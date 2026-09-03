-- SKHY is the Nasdaq ADR, not the Seoul ordinary line.
--
-- `20260902040000` mapped SKHY to `000660.KS` so ingest would return something —
-- reasonable at the time, because the ADR had only listed in July 2026 and the
-- house ticker looked empty. It is no longer true: SKHY quotes on Nasdaq in USD
-- (about $164.98 on 2026-09-02) with 39 sessions of history, and the dossier has
-- been written against that listing all along ("Valuation basis: SKHY closed at
-- approximately $165.70 on 21 August 2026").
--
-- The consequence of the wrong mapping was that every stored number for SKHY was
-- KRW — a ₩1,626,000 close, ₩52.6T of revenue — and `20260902220000` then
-- recorded the instrument as KRX/KRW on that basis, so the currency guard was
-- refusing a name the book can actually buy. Point it back at the ADR and drop
-- the Seoul-denominated data rather than leave two currencies in one series.

update public.instruments
   set data_symbol = null,
       exchange = 'US',
       currency = 'USD',
       notes = 'HBM / DRAM — Nasdaq ADR listed July 2026'
 where symbol = 'SKHY';

-- Vintages first: the projection trigger removes the matching
-- `fundamentals_quarterly` rows as each observation goes.
delete from public.fundamentals_vintages
 where instrument_id in (
   select id from public.instruments where symbol = 'SKHY'
 );

delete from public.fundamentals_quarterly
 where instrument_id in (
   select id from public.instruments where symbol = 'SKHY'
 );

delete from public.market_bars
 where instrument_id in (
   select id from public.instruments where symbol = 'SKHY'
 );

delete from public.market_caps
 where instrument_id in (
   select id from public.instruments where symbol = 'SKHY'
 );

-- The scorer's stored setup was computed from KRW inputs; the next run rebuilds
-- it from the ADR. Leaving it would show a state derived from prices in another
-- currency.
delete from public.instrument_setups
 where instrument_id in (
   select id from public.instruments where symbol = 'SKHY'
 );
