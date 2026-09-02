-- The book has no FX layer.
--
-- `market_bars`, `market_caps` and `fundamentals_quarterly` all store whatever
-- the vendor returns in the listing's own currency, while cash, cost basis, NAV
-- and every mandate cap are USD. A foreign listing booked as a position would be
-- marked at its local price as though it were dollars: SK Hynix at a ₩1,623,000
-- close enters the book at $1.6m a share, blows through the position and theme
-- caps, and corrupts NAV — while every reconciliation check still passes,
-- because the ledger is internally consistent about the wrong number.
--
-- The application refuses this at the buy gate (`bookCurrencyBlock`). This is the
-- backstop: the ledger itself will not accept the row. Sells are always allowed
-- so an existing position could still be unwound if one ever got in.

create or replace function public.assert_transaction_currency()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  listing_currency text;
  listing_symbol text;
begin
  if new.instrument_id is null or new.kind <> 'buy' then
    return new;
  end if;

  select coalesce(i.currency, 'USD'), i.symbol
    into listing_currency, listing_symbol
    from public.instruments i
   where i.id = new.instrument_id;

  if listing_currency is null then
    raise exception 'Unknown instrument %', new.instrument_id
      using errcode = 'foreign_key_violation';
  end if;

  if upper(listing_currency) <> 'USD' then
    raise exception
      '% is listed in % and the book has no FX conversion; its marks, weights and NAV contribution would all be wrong',
      listing_symbol, upper(listing_currency)
      using errcode = 'check_violation';
  end if;

  return new;
end;
$$;

drop trigger if exists transactions_currency_guard on public.transactions;

create trigger transactions_currency_guard
  before insert on public.transactions
  for each row
  execute function public.assert_transaction_currency();

-- SK Hynix was mapped to its Seoul listing (`data_symbol = '000660.KS'`) so bars
-- and fundamentals would ingest, but kept `exchange = 'US'` and `currency =
-- 'USD'`. Every number stored against it is KRW. Record what it actually is, so
-- the guard above recognises it and the dossier does not read as a USD name.
update public.instruments
   set currency = 'KRW',
       exchange = 'KRX'
 where symbol = 'SKHY';
