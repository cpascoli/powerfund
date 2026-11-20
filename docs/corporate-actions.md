# Corporate actions — stock splits

How PowerFund handles a stock split, why it works that way, and what the operator does when one happens. Written with the Sandisk (SNDK) 8-for-1 of November 2026, the split that showed there was nothing here.

## What went wrong

Sandisk split eight-for-one, effective after the close on 19 November 2026; 20 November was the first split-adjusted session.

Half of the system already handled it. Every bar vendor we use restates a series' *whole history* when a split takes effect, and ingest compares each refetch with what it stored (`detectPriceRebase`). It saw eight-times disagreement on every session, recognised a split, and refetched five years of SNDK closes on the new basis.

The other half did not know a split was a thing. `positions` still held 2.28 shares. The snapshot job multiplied 2.28 by the new $94.395 close and valued a $1,721.76 holding at $215.22. Because the NAV series is rebuilt from the ledger every night, the error was not one bad day: every snapshot back to the 1 October fill was restated wrong, and with it the deployed-sleeve return, the drawdown and the kill-switch input.

Nothing failed. `verify:book` compares the projection with the ledger, and both said 2.28. `bars:freshness` said the store was current. The reconciliation checks agreed with each other and were wrong about the world.

## The convention

**Prices are stored on the vendor's current share basis. Quantities are restated to that basis when they are read. The ledger is never rewritten.**

| | Basis | Changes on a split? |
|---|---|---|
| `market_bars` | Current. The vendor restates history; ingest refetches the series in full. | Yes, wholesale, by ingest |
| `transactions` | As booked. 2.28 shares at $1,742.46 stays that. | **Never** |
| `corporate_actions` | The record of the split. | One row, applied once |
| `positions` | Current. It is a projection of the ledger. | Re-projected when the split is applied |
| `portfolio_snapshots` | Current. Rebuilt nightly from the ledger. | Rebuilt on the next run |
| Cash, cost basis, realised P&L | Dollars. | No |

The alternative — unadjusted historical prices with point-in-time quantities — is equally valid accounting and was not chosen because we do not have unadjusted prices. Yahoo, Tiingo's `adjClose` and Stooq all serve adjusted series, and rebuilding an unadjusted one would mean un-applying the vendor's adjustment with our own record of splits, which is the same dependency with more ways to be wrong. The two approaches are never mixed: no reader multiplies a ledger quantity by a stored close without going through the rule below.

### The rule

For a split with ratio `r = numerator / denominator` and effective date `D` (the first session on the new basis):

```text
a quantity booked in a session before D   →  × r
a per-share price from a session before D →  ÷ r
dollars                                    →  unchanged
```

A fill on `D` itself already traded on the new basis and is not scaled. Several splits compound: the factor for a session is the product of every *applied* split effective after it.

The session of a booking is its New York calendar day, the same rule the snapshots and flows use (`fillSessionDate`; `trade_session()` in SQL). A fill booked at 21:00 New York on the 19th is 02:00 UTC on the 20th and is still pre-split.

The rule exists once in each language and both are tested against the same cases:

- SQL: `split_factor(instrument, session)` — used by `apply_transaction`, `verify_book_against_ledger` and the settle trigger.
- TypeScript: `splitFactorAfter` / `ledgerOnCurrentBasis` in `packages/domain/src/corporate-actions.ts` — used by the snapshot rebuild and the contribution report.

Quantities are rounded to 8 decimals per ledger entry, in all three places, so the projection and the reconciliation cannot differ by dust after a reverse split.

## The record

`corporate_actions` (migration `20261120090000_corporate_actions.sql`):

| Column | |
|---|---|
| `instrument_id`, `action_type` | The name; `split` is the only type today |
| `effective_date` | First session on the new basis. Must be a weekday |
| `split_numerator`, `split_denominator` | New per old: 8-for-1 is 8/1, a 1-for-10 reverse split is 1/10 |
| `status` | `pending` → `applied` or `rejected`. One way, once |
| `source`, `evidence` | `vendor_event`, `price_rebase` or `manual`, and what was observed |
| `verified_by`, `verification_notes` | Required to apply: who checked, against what |
| `fractional_treatment` | Required to apply a reverse split: `retained` or `cash_in_lieu` |
| `applied_at`, `rejected_at`, `created_at`, `updated_at` | Audit timestamps |

### Why it cannot be applied twice

Idempotency is structural, not a check someone has to remember:

- A row is inserted `pending`. Inserting one already `applied` is refused, because it would skip the re-projection.
- `pending → applied` happens in one `UPDATE`, inside which a trigger re-projects the position. A settled row refuses every further update and every delete.
- A partial unique index allows one live row per `(instrument, type, effective_date)`. A rejected row does not block registering the event again.
- Ingest's detection goes through `planDetectedSplit`, which ignores an event it has already seen in any state — including one the operator rejected.

To correct a split that was applied wrongly, register and apply its inverse. Nothing is ever removed.

### What applying does

In one transaction, for the instrument's open position:

1. Recomputes the quantity from the ledger on the new basis. It does not multiply what the projection holds, because a buy booked after the effective date is already on the new basis.
2. Restates average cost so `quantity × avg_cost` is exactly what it was. The money paid does not move.
3. Opens a review task, already due, to restate the name's per-share research (see below).

It writes no transaction, moves no cash and realises nothing. `supabase/tests/corporate_actions.sql` asserts each of those through the real trigger chain.

It refuses when a **sale** was booked on or after the effective date before the split was applied: that sale's realised P&L was computed against a position on the old basis, sits on an immutable row, and needs a hand correction first. Apply splits promptly and this never arises.

### Trades dated before an applied split

`apply_transaction` multiplies a trade's units by `split_factor` for its session. In the ordinary case the factor is 1 and nothing changes. A fill that genuinely happened before a split but is booked afterwards is recorded as it happened and projected on the current basis.

### Reverse splits and fractions

The ratio is applied exactly; the book keeps fractional shares to 8 decimals. If the broker instead paid cash for the fraction, record `fractional_treatment = 'cash_in_lieu'` and then **book the sale the broker made** — a `sell` of the fractional quantity for the cash received, dated when it settled. That is a real transaction, entered by the operator from the statement. The system never invents it.

## Detection, and why it does not apply itself

A split reaches us two ways, and ingest opens a `pending` row for either:

- **The series moves.** `detectPriceRebase` sees every overlapping session disagree by the same factor. The ratio is snapped to a real split ratio (`impliedSplit`); the effective date is estimated as the session after the last one stored, and marked as an estimate.
- **The vendor says so.** Yahoo's chart response carries split events (`fetchYahooChart`). An event corrects the date on a pending row that a rebase opened.

The vendor event cannot be the only signal. On 20 November 2026 Yahoo was already serving restated SNDK prices and no split event at all.

Neither applies the split. That is deliberate, and it is the lesson of the APH incident recorded in `CLAUDE.md`: an automatic repair path with a weak trigger is more dangerous than no repair path. A vendor glitch that looked like a split once overwrote five years of correct prices; the same glitch auto-applied here would multiply a real position by a wrong factor. A human checks the company's filing and applies it. Until then the valuation is marked provisional, which is the true state.

## Knowing when the valuation is wrong

`assessBookIntegrity` (domain) and `loadBookIntegrity` (`packages/db`) answer one question for the open book: can these marks be leaned on?

| Check | Catches |
|---|---|
| **Coverage** — every open holding has a close for the last completed session | A late vendor. Six of twelve holdings on 19 Nov 2026 |
| **Pending corporate actions** | A split registered and not yet applied |
| **Share-basis agreement** — each fill, restated by applied splits, lies near its own session's stored range | A split nobody registered; or one applied while prices are still unadjusted (the double adjustment) |

The third is the stored-data invariant. It does not depend on any event feed: a fill at 7.7× its session's high says the ledger and the bars are on different bases, whoever failed to mention it. It names a suspect and an implied ratio and applies nothing.

Where it shows:

- **Agent API / MCP** — `getPortfolio`, `getPerformance`, `getRiskSnapshot` and `getFundState.portfolio` carry `price_data_stale`, `price_data_expected_session`, `price_data_missing`, `corporate_actions_pending`, `valuation_provisional` and `valuation_warnings`.
- **`price_data_stale` changed meaning.** It was true only when the *newest* holding session was behind, so it stayed false while half the book was a day old. It is now true when *any* open holding lacks the last completed session. `price_data_through` is unchanged (the newest session).
- **Briefing and Portfolio** — the mandate flags lead with the finding, and "Mandate checks clear" is removed while it stands.
- **Nightly run** — `book:integrity` runs after `verify:book` and fails the run on a share-basis problem. A merely late close is reported, not failed.

**When `valuation_provisional` is true, NAV, returns, drawdown and risk are not inputs for a deployment decision.** The agent says so and stops.

## Research and price triggers

A split also changes what a per-share number in research means.

**Structured thresholds are restated at the moment of comparison.** A review trigger `{metric: "price", operator, value}` keeps its stored value. It carries `price_basis_date` — stamped when the trigger is written or replaced, falling back to the task's creation date — and the evaluator divides the value by the factor of the splits effective after that day. "Review SNDK at or below $700" does not fire because the share count multiplied by eight; it fires at $87.50. `price_return_pct` triggers need nothing: both closes come from one adjusted series.

**Free text is never rewritten.** A dossier version is a record of what was believed at the prices of its day. Instead:

- Applying a split opens a due review, *Restate SYM per-share research after the N-for-M split*, listing what to restate in a **new** dossier version: entry zones, bear/base/bull value per share, price-based invalidation, EPS, and the window of any open planned action.
- `getCompanyDossier` returns `corporate_actions` and a `price_basis_note` when the current version predates a split, giving the factor.
- Each open planned action in `listPlannedActions` carries the same note. A plan is sized in dollars, which a split does not touch; its window text usually quotes a price.

Nothing is reactivated or authorised by a split. A review task cannot create a transaction.

**Decision calibration is unaffected.** 30/90/180-day returns are close-to-close on one series against SPY, with no quantity involved, and a rebase replaces a series in a single write, so a grade cannot have been computed on a spliced series.

## Operator runbook

When ingest reports `SPLIT PENDING`, or `book:integrity` reports a mismatch:

```bash
pnpm --filter @powerfund/worker splits                    # what is registered
pnpm --filter @powerfund/worker book:integrity            # what the data says

# If nothing was detected, register it yourself (lands pending):
pnpm --filter @powerfund/worker splits:register -- --symbol=SNDK --effective=2026-11-20 --ratio=8:1

# Check the company's filing: ratio, and the first split-adjusted session.
# Check the bars are restated: bars:audit shows no split-sized jump for the name.

# Optional: see the NAV series the split would produce, writing nothing.
#   snapshotPortfolio({ dryRun: true, splits: [...] })

pnpm --filter @powerfund/worker splits:apply -- --id=<uuid> --verifiedBy=<who> "--notes=<filing, date>"
pnpm --filter @powerfund/worker snapshot:portfolio        # rebuild NAV history
pnpm --filter @powerfund/worker verify:book
pnpm --filter @powerfund/worker book:integrity
```

Then work the review task it opened. If it was not a split: `splits:reject -- --id=<uuid> "--notes=<why>"`.

Order matters in one respect: **apply only once the bars are restated.** Applied against unadjusted prices, the position is overvalued by the ratio — `book:integrity` reports that case too, as a mismatch in the other direction.

## The SNDK reconciliation

Sources: Sandisk's 8-K of 29 October 2026 and investor FAQ (8-for-1, effective after the close on 19 November, split-adjusted trading from 20 November). Cross-check from our own records: the 1 October planned action quotes the 30 September close as $1,739.89; the vendor now serves $217.48625 for that session, exactly one eighth.

Ledger, confirmed in production and unchanged by any of this: one fill, 1 October 2026, 2.28 shares at $1,742.46, cash −$3,972.81.

Measured with a dry-run rebuild against production on 20 November (19 November closes), before and after:

| | Before | After | |
|---|---:|---:|---|
| SNDK quantity | 2.28 | 18.24 | × 8 |
| SNDK average cost | $1,742.4605 | $217.8076 | ÷ 8 |
| SNDK cost basis | $3,972.81 | $3,972.81 | unchanged |
| SNDK market value | $215.22 | $1,721.76 | |
| Cash | $211,532.15 | $211,532.15 | unchanged |
| Invested cost | $38,467.85 | $38,467.85 | unchanged |
| Positions value | $26,501.70 | $28,008.24 | +$1,506.54 |
| NAV | $238,033.85 | $239,540.39 | +$1,506.54 |
| Deployed sleeve, since inception | −35.8% | −31.2% | |
| Deployed drawdown from peak | 36.8% | 32.3% | |
| Deployed max drawdown | 40.7% | 36.0% | matches the 36.0% the 15 Nov review recorded |

The last line is the confirmation that the history, not just the last day, is repaired: the corrected series reproduces the maximum drawdown measured before the vendor restated anything.

What was affected, and what was not:

- **Snapshots** — all 36 sessions from 1 October understated SNDK by seven-eighths. Rebuilt by the first `snapshot:portfolio` after the split is applied. Nothing to do by hand.
- **Kill-switch diagnostic** — read a drawdown about 4.5 points too deep while the error stood. It was already past 15% on the true figure, so no state changed.
- **Decisions, fills, planned actions** — none were recorded between the restatement and the fix.
- **Calibration grades** — 17 were recorded in the window; all are bars-only and unaffected.
- **Research** — SNDK dossier v8 (5 November) and the position's thesis summary quote pre-split per-share figures ($1,700–1,800 entry zone, ~$2,520 value, ~$900 bear case). They stay as written; the split's review task asks for a restated version.

Applied by migration `20261120093000_register_sndk_split.sql`, which is idempotent and a no-op where SNDK does not exist.

## Limits

- **Splits only.** Spin-offs, mergers, special dividends and symbol changes are not modelled.
- **Tiingo.** With `TIINGO_API_KEY` set, the stored `close` is Tiingo's *unadjusted* close and only `adj_close` is adjusted. Readers use `adj_close ?? close`, so marks stay right, but rebase detection compares `close` and would not see a split. Production runs on Yahoo. Do not enable Tiingo without fixing that.
- **Dividends.** `adj_close` is also dividend-adjusted and is used as a price level — the open finding in the 13 October review. Unrelated to splits and not changed here.
- **Booking time is not trade time.** A pre-split fill booked after the effective date with a post-split timestamp is treated as post-split. Book it with the time it happened.
- **No apply button.** Applying is a worker command (or a migration). The app shows the warning; it does not offer the action.
- **Free text.** Per-share numbers in dossiers, theses and planned-action windows are flagged, never converted.
- **Public API.** `/api/v1` reads `positions`, which is correct once a split is applied; it does not carry the provisional flag.
