-- Register and apply Sandisk's eight-for-one split.
--
-- The facts, checked against three independent sources before this was written:
--
--   * Sandisk's 8-K of 29 Oct 2026 and its investor FAQ: an eight-for-one
--     forward split, effective after the Nasdaq close on 19 Nov 2026, first
--     split-adjusted session 20 Nov 2026.
--   * Our own record: the 1 Oct planned action quotes the 30 Sep close as
--     $1,739.89. The vendor now serves 217.48625 for that session, which is
--     1,739.89 / 8 to the cent.
--   * The ledger: one fill, 2.28 shares at $1,742.46 for $3,972.81, against a
--     1 Oct session the vendor now prices near $223 — 7.8x, an intraday fill
--     seen against a restated range.
--
-- What it does: one row in `corporate_actions`, moved pending -> applied. The
-- settle trigger re-projects the open position to 18.24 shares and restates
-- average cost so the $3,972.81 paid is unchanged. It writes no transaction,
-- moves no cash and realises nothing; the fill row is not touched.
--
-- Idempotent, and a no-op on a database with no SNDK instrument (a fresh
-- local reset before seeding, CI's empty-database job). Re-running it finds the
-- applied row and stops: there is no second application to make.

do $$
declare
  v_instrument uuid;
  v_action uuid;
  v_status public.corporate_action_status;
begin
  select id into v_instrument
  from public.instruments
  where symbol = 'SNDK';

  if v_instrument is null then
    raise notice 'SNDK is not in this database; nothing to register';
    return;
  end if;

  select id, status into v_action, v_status
  from public.corporate_actions
  where instrument_id = v_instrument
    and action_type = 'split'
    and effective_date = date '2026-11-20'
    and status <> 'rejected';

  if v_action is null then
    insert into public.corporate_actions (
      instrument_id, action_type, effective_date,
      split_numerator, split_denominator, source, evidence, notes
    )
    values (
      v_instrument, 'split', date '2026-11-20', 8, 1, 'manual',
      jsonb_build_object(
        'announced', '2026-10-29',
        'record_date', '2026-11-09',
        'effective_after_close', '2026-11-19',
        'filing', 'https://www.sec.gov/Archives/edgar/data/0002023554/000162828026068243/sndk-20261029.htm',
        'stored_close_check', jsonb_build_object(
          'session', '2026-09-30',
          'recorded_pre_split', 1739.89,
          'vendor_post_split', 217.48625,
          'ratio', 8
        )
      ),
      'Eight-for-one forward split. Registered by migration because it predates corporate-action handling.'
    )
    returning id, status into v_action, v_status;
  end if;

  if v_status = 'pending' then
    update public.corporate_actions
       set status = 'applied',
           verified_by = 'operator',
           verification_notes =
             'Sandisk 8-K of 29 Oct 2026 and investor FAQ: 8-for-1, effective after the close on 19 Nov 2026, '
             || 'split-adjusted trading from 20 Nov 2026. Cross-checked against the stored 30 Sep close '
             || '(1,739.89 recorded pre-split, 217.48625 served post-split: exactly 8x).'
     where id = v_action;
  end if;
end;
$$;
