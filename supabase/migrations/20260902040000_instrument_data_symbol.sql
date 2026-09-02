-- House tickers can differ from the vendor listing (SKHY → 000660.KS).
-- Ingest and live quotes use data_symbol when set.

alter table public.instruments
  add column if not exists data_symbol text;

comment on column public.instruments.data_symbol is
  'Vendor ticker for Yahoo/Tiingo/Stooq/SEC when it differs from the house symbol.';

update public.instruments
set
  data_symbol = '000660.KS',
  notes = 'HBM / DRAM — house ticker SKHY; Yahoo/KRX listing 000660.KS'
where symbol = 'SKHY';

-- Wrong-ticker SKHY bars must not mix with KRW KRX prices.
delete from public.market_bars
where instrument_id in (select id from public.instruments where symbol = 'SKHY');

delete from public.market_caps
where instrument_id in (select id from public.instruments where symbol = 'SKHY');

-- Yahoo already stored totalRevenue under unprefixed keys; extract it.
update public.fundamentals_quarterly as f
set
  revenue = coalesce(
    f.revenue,
    nullif(f.raw ->> 'totalRevenue', '')::numeric,
    nullif(f.raw ->> 'operatingRevenue', '')::numeric
  ),
  free_cash_flow = coalesce(
    f.free_cash_flow,
    nullif(f.raw ->> 'freeCashFlow', '')::numeric
  ),
  capex = coalesce(
    f.capex,
    abs(nullif(f.raw ->> 'capitalExpenditure', '')::numeric),
    abs(nullif(f.raw ->> 'purchaseOfPPE', '')::numeric)
  ),
  shares_diluted = coalesce(
    f.shares_diluted,
    nullif(f.raw ->> 'shareIssued', '')::numeric,
    nullif(f.raw ->> 'ordinarySharesNumber', '')::numeric,
    nullif(f.raw ->> 'dilutedAverageShares', '')::numeric
  ),
  net_debt = coalesce(
    f.net_debt,
    case
      when f.raw ? 'totalDebt'
        and (
          f.raw ? 'cashAndCashEquivalents'
          or f.raw ? 'cashCashEquivalentsAndShortTermInvestments'
        )
      then
        coalesce(nullif(f.raw ->> 'totalDebt', '')::numeric, 0)
        - coalesce(
          nullif(f.raw ->> 'cashAndCashEquivalents', '')::numeric,
          nullif(f.raw ->> 'cashCashEquivalentsAndShortTermInvestments', '')::numeric,
          0
        )
      else null
    end
  )
where f.revenue is null
  and (f.raw ? 'totalRevenue' or f.raw ? 'operatingRevenue');
