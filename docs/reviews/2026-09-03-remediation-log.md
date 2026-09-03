# Remediation log — 2–3 September 2026

**Scope:** everything found and fixed after the [2 September full review](./2026-09-02-full-review.md), across both days.
**Range:** `445422c..444567b` — 14 commits, 75 files, 6 migrations, 8 new test suites.
**State at the end:** 269 unit tests, 38 SQL assertions, typecheck clean across five workspaces, CI green, repo and production schemas in sync.

This is a companion to the review, not a summary of it. The review said what was
wrong; this says what was done, what turned out to be wrong about the diagnosis
along the way, and what was deliberately left.

---

## 1. What the two days were actually about

Seven of the eight defects below share one shape: **the system was internally
consistent about the wrong number.** Every reconciliation passed. Every test
passed. `verify_book_against_ledger()` returned all-OK throughout. The ledger was
never wrong — but the layer that *marks* it was, and nothing compared the two.

| Defect | The book said | The truth was |
|--------|---------------|---------------|
| Snapshot session mislabelling | max drawdown 25.1% | 16.4% |
| SKHY listing | a KRW position was bookable | ₩1,626,000 booked as $1.6m/share |
| Fundamentals currency | revenue `52576287000000 USD` | ₩52.6T |
| Filing dates | NVIDIA's Jul-2025 quarter knowable Aug 2026 | Aug 2025 |
| APH prices | $163.18 on 1 Sep | $81.59 — a 2-for-1 split |
| Viewer access | reads gated | every table `using (true)` |

That is the theme worth carrying forward: **a projection that cannot be rebuilt
from its source, or checked against it, will eventually disagree with it and say
nothing.**

---

## 2. The measurement layer

### 2.1 NAV marks were labelled with the wrong session — `469b5af`

`snapshotPortfolio()` stamped `as_of = new Date()` and marked positions from
"the newest bar for this instrument, whatever its date". GitHub Actions routinely
runs the 22:00 UTC cron after midnight, so the row labelled 27 August held 26
August closes. `backfillMissingSnapshots` then reconstructed the genuinely
missing 26th from the same closes, and the two rows came out byte-identical.

Proven, not inferred: stored 27 Aug `positions_value` 16,265.41 against a
computed 26 Aug session of **16,265.41**; stored 28 Aug 16,553.63 against a
computed 27 Aug of **16,553.63**.

Compounding it, `accumulateLedgerFlows` bucketed fills by the **UTC day** of
`occurred_at` while the snapshot's content depended on when the job ran. The VST
fill (28 Aug 15:29 UTC) landed on a row written at 05:55 that morning, before the
trade: `16,553 / (16,265 + 3,000) − 1` = a **−14.1% day that never happened**,
followed by a compensating +11.6%.

| Metric | Published | True | Error |
|--------|----------:|-----:|------:|
| Deployed TWR since inception | −16.7% | −15.00% | 1.7pp |
| Current deployed drawdown | 18.1% | 16.39% | 1.7pp |
| **Max deployed drawdown** | **25.1%** | **16.39%** | **8.7pp** |

The 15% diagnostic breach was real, so the 30 August ritual-11 write was the
right call. Only the magnitude was fiction — and the same defect would fire the
kill-switch spuriously on any future fill day where the cron ran late. After
capital Phase 1 that flag becomes a buy halt.

**A correction found while fixing it.** The first fix bucketed flows as "the
first session closing at or after the fill" and rebuilt the series at −25.4%.
That was wrong, and the reason matters: `transactions.occurred_at` is when the
operator **books** a fill, not an exchange timestamp. The 13 August starters were
typed in at 16:20–16:31 ET, and NBIS's 253.76 fill sits inside the 13 August
range (247.38–275.96) and outside the 14th's (256.90–278.66) — the trade was in
the 13 August session. `fillSessionDate` is therefore the New York calendar day
of the booking, walked back to the last weekday.

**Fix.** One session-keyed path (`reconstructSnapshots`) rebuilds the whole
series from the ledger and stored bars on every run: `as_of` stamped at the
session's own evening, SPY's bars as the trading calendar so exchange holidays
are honoured, and a position marked only from a bar dated that session. A missing
bar carries the prior close and is named in `staleMarks` with its real
`closeDate`. `backfill.ts` is gone — a late run, a re-run and a backdated fill now
converge instead of leaving a wrong row nothing overwrites.
`pnpm --filter @powerfund/worker snapshot:verify` does it as a dry run.

**Verified.** Rebuild matched an independent reconstruction to four decimal
places (−15.0027% / 16.388%). Row effects: 27 Aug no longer a copy of 26 Aug
(+288.22), 28 Aug now contains the VST fill (+2,177.38), 13 Aug −29.78 (it had
held 12 Aug closes for four names just bought), everything else within a cent.
The 15 pre-rebuild rows are at `/tmp/portfolio_snapshots_backup_2026-09-02.json`.

The next night's scheduled run stamped `2026-09-02T22:30:00Z` for the 2 September
session and picked up the CRDO fill — the fix working unattended.

### 2.2 Why 199 passing tests missed it

Every performance fixture was hand-built so the flow and the mark already agreed
on a day. They verified **the maths given well-formed inputs**; nothing verified
that the inputs were well-formed, and `apps/worker` — which writes those inputs —
had no tests at all.

`snapshot-alignment.test.ts` adds the missing class: session attribution, flow
bucketing on the booking session, flows folding into the next mark when a session
has no snapshot, marks that may only come from their own session, and a
regression pinned to the real 26 Aug–1 Sep numbers that reproduces the phantom
day and then rebuilds the window without it.

---

## 3. Currency

### 3.1 A KRW listing could be booked as dollars — `14c86f1`

`market_bars`, `market_caps` and `fundamentals_quarterly` store whatever the
vendor returns in the listing's own currency, while cash, cost basis, NAV and
every mandate cap are USD. There is no FX layer anywhere. SKHY was mapped to the
Seoul line, so a ₩1,626,000 close would have entered the book at **$1.6m a
share**, blown through the position and theme caps, and corrupted NAV — while
every reconciliation check still passed.

`bookCurrencyBlock()` refuses a non-USD listing at the buy gate, before caps are
evaluated, and is deliberately **not overridable**: no written reason makes the
arithmetic true. A `before insert` trigger on `transactions` is the backstop.
Sells stay allowed so an existing position could be unwound.

### 3.2 …except the premise was wrong — `64f9b40`

The SKHY dossier, primary-source verified 21 August, referenced a **July 2026
Nasdaq ADR listing** at ~$165.70. It was right: `SKHY` quotes on Nasdaq in USD,
39 sessions, last close $164.98. The `data_symbol → 000660.KS` mapping was
reasonable when made (the ADR was weeks old and the house ticker looked empty)
but is no longer true, and the currency guard was refusing a name the book can
actually buy.

Repointed to the ADR, dropped the Seoul-denominated bars, caps, fundamentals and
setup rather than leave two currencies in one series, and re-ingested: 39 USD
bars, $1.17T market cap. `seed.sql` also re-applied the Seoul mapping after every
migration, so a local reset disagreed with production, which never runs that
file — removed.

Fixing the listing did not make it scoreable, and was not expected to: 39
sessions is too short for the 200-day and 5-year-percentile work.

### 3.3 DATA-15: every row was stamped USD regardless — `7a9944c`

The currency a company reports in is not the currency its shares trade in. All
four of these quote in USD:

| | Quote | Reports in |
|---|---|---|
| TSM | USD | **TWD** |
| CCJ | USD | **CAD** |
| SKHY | USD | **KRW** |
| NBIS | USD | USD (SEC `Revenues` is RUB) |

The SEC client now picks the unit carrying the most revenue facts and reads every
monetary concept in it, so a row is never assembled from two currencies. Yahoo
publishes no currency on timeseries rows but does expose `financialCurrency` on
the quote, now fetched alongside. `sliceScorerInputsAsOf` **withholds the market
cap** when it disagrees with the reporting currency rather than dividing one into
the other — SK hynix's net debt over a USD market cap would be out by three
orders of magnitude and read as a balance sheet in crisis.

**The correction initially did not land**, which is the more interesting part.
The re-ingest reported `foreignCurrency: {CCJ: CAD, SKHY: KRW, TSM: TWD}` — it
had detected them — but the stored rows still said USD. The vintage dedupe
compared measures and not currency, so the corrected rows were skipped as
unchanged while the ingest reported success. **A correction the dedupe swallows
is worse than none, because nothing tells you.** Currency now joins both the skip
predicate and the uniqueness constraint.

---

## 4. Point-in-time fundamentals — DATA-1

### 4.1 Vintages — `c5b63f5`

`fundamentals_quarterly` keyed a quarter on `(instrument_id, period_end)` and
upserted, so a restatement destroyed the original and there was no way to ask
what we knew on a past date. Every scorer built on it was look-ahead biased by
construction and every backtest of one unfalsifiable.

`fundamentals_vintages` is append-only — one observation per quarter per filing,
carrying `filed_at`, a never-null `knowable_at` and a `knowable_basis` of
`filing` or `estimated`. `fundamentals_quarterly` remains the trigger-maintained
latest-known projection, so no read path changed. `fundamentals_as_of(instrument,
date)` returns the newest observation of each period already filed by then. Same
ledger-and-projection shape as `transactions`.

### 4.2 The table was not the hard part

Backfilling filing dates from the stored payloads gave a **median lag of 397
days**. companyfacts reports a period again in every later filing that carries it
as a comparative, and the client kept only the most recently filed unit — so
NVIDIA's July 2025 quarter came back stamped 26 August 2026, the FY27 Q2 10-Q,
rather than the 27 August 2025 filing that first disclosed it. That would have
told a backtest we knew nothing for a year: a different flavour of the same
disease.

The client now emits **one vintage per filing**, resolving each measure to the
newest fact filed by that date and dropping filings that merely repeat the
previous numbers.

| Period year | Median lag before | After |
|---|---:|---:|
| 2015 | ~398d | 35d |
| 2020 | ~400d | 34d |
| 2025 | ~388d | 33d |

Production holds **2,342 vintages**, 92% with a real filing date, and **144
quarters were genuinely revised after first disclosure**. The projection grew
from 1,491 to **2,019 quarters**, because per-filing ingest recovers periods the
collapse-to-one-row path never stored. Yahoo rows carry `period_end + 90 days`
flagged `estimated` — late on purpose, since assuming we learned something later
understates a strategy while assuming earlier is the bias being removed — and a
strict run can drop them.

### 4.3 A projection that could not be rebuilt — `7a967f8`

Pruning the bootstrap vintages exposed the design hole: the projection trigger
fired only on insert. The delete left **1,026 projection rows** showing the pruned
row's `knowable_at` with a dangling `vintage_id`, and **76 showing values no
surviving observation supported**.

The trigger now handles deletes, including dropping the projection row when a
quarter's last observation goes, and `reproject_fundamentals()` rebuilds the
table from the vintages on demand. After running it: **0 rows disagree** with
their newest vintage on value, knowable date, or link.

---

## 5. The scorer

### 5.1 As-of scoring and replay — `ade0fdf`

`fundamental_inflection_v1` read the latest fundamentals row, the last 400 bars
and the newest market cap — right for scoring today, useless for asking what it
would have said in the past. It had been running shadow for two weeks with no way
to tell whether it was worth wiring into anything.

`sliceScorerInputsAsOf` assembles the inputs as they stood on a date. The live
run and a replay go through that one function, so "today" is just the last slice
and a backtest cannot silently measure a different scorer. Hysteresis carries
forward through a replay as it does in production rather than being seeded from
stored state, which would be look-ahead.

The first replay covered 14 dates and produced a 475% twelve-month mean — because
**the benchmark bars only reached 2025-07-11** and the session calendar comes from
them. SPY and QQQ backfilled to 2021-06; 1,307 bars each.

### 5.2 What the replay says — `262e4ee`, `38c33c5`

53 names, 63 monthly dates, 2021-06 → 2026-08, 2,619 observations. Raw returns
are enormous because this universe over this window was an AI bull market, so
only the excess column means anything. Two corrections were needed before it did:
unscoreable names had to leave the baseline (they were the strongest performers
in the universe, so every genuine setup was being compared against them), and a
name must be compared leave-one-out rather than against an average containing
itself.

| Setup | n | 12m mean | vs universe |
|---|---:|---:|---:|
| Insufficient data | 477 | 128.3% | +71.2% |
| Improving — extended | 488 | 89.0% | **+32.1%** |
| Correction candidate | 231 | 96.9% | **+30.2%** |
| Avoid / late-cycle | 409 | 57.9% | −2.0% |
| **Improving — research now** | **203** | **16.0%** | **−6.4%** |
| Falling fundamentals | 265 | 57.3% | −17.3% |
| Watch | 438 | 33.2% | −24.3% |
| Needs thesis check | 108 | 41.7% | −35.5% |

**The flagship state is the worst of the informative ones.** The two that beat
the universe are `improving_extended`, which by definition means the price has
already run, and `correction_candidate`, which means it has already fallen. The
scorer is being paid for momentum and mean reversion, not for the fundamental
inflection it claims to detect at the point it claims to detect it.

Read against a hard caveat: the 53 names are *today's* watchlist, assembled
partly because they already worked. That is the survivorship contamination
`goals.md` warns about, and the baseline is drawn from the same survivor set.
What the replay supports is the relative statement, not an absolute one.

**Conclusion: do not wire it into Briefing or the buy gate.** Keeping it shadow
was right. The constructive next step is not to tune thresholds against this
sample — that is fitting noise — but to build a point-in-time watchlist so the
question can be asked properly.

### 5.3 `insufficient_data` said too little — `7a9944c`

It conflated a name we started following recently, which resolves itself on a
schedule, with one nothing we ingest publishes quarterly figures for, which never
does. Snapshots now carry a `dataGap` naming the shortfall and, when something is
accumulating, roughly how long the wait is — surfaced in the rationale the
operator already reads.

| | Missing | Wait |
|---|---|---|
| IREN | short fundamentals | ~6 months |
| SKHY | fundamentals + price history | ~12 months |
| NBIS | short fundamentals | ~12 months |
| TSM, CCJ | short fundamentals | ~15 months |

A name with **no** fundamentals from any source gets no estimate and is told
plainly that waiting will not fix it.

**Why these five cannot simply be fixed.** SEC has no quarterly XBRL for them —
TSM's `Revenue` has 24 annual facts and **0 quarterly**; CCJ's 18 are all annual;
NBIS's `us-gaap` is RUB, annual-only and stale since FY2023; SKHY has no
financial XBRL at all. Yahoo caps at **5 quarters of revenue for every symbol**,
NVDA included. The scorer needs 9. No free source we use closes that gap today —
but because vintages accumulate, these names become scoreable on the schedule
above with no code at all. An earlier recommendation in this session to add the
`ifrs-full` taxonomy was **withdrawn** after checking: it would have supplied
annual data that cannot feed a quarterly year-on-year comparison.

---

## 6. Prices: a split nobody saw — `9872dfc`

A split does not arrive as an event we can subscribe to. It arrives as the vendor
quietly returning different numbers for sessions already stored. Amphenol split
two-for-one on 26 August and our series held $163.18 for 1 September while the
vendor had moved to $81.59 — **exactly 2.0000×, on every overlapping session**.
Nothing caught it, because the nightly job refreshes the last few days and
upserts them without comparing, so the two price bases were spliced together and
the older half could never be reached again. `adj_close = close` on both sides,
so no column said which basis a row was in.

APH is not held, so no money was wrong. Every held name is exposed to the same
thing: a split in VRT would have the snapshot mark the position from a stale
unadjusted close, put NAV out by the split factor, fabricate a deployed drawdown
and trip the kill-switch — while `verify_book_against_ledger` still returned
all-OK.

Ingest now compares the fetched window against what we hold before writing it.
Disagreement beyond 0.5% means the vendor re-based the series, so the whole
history is refetched rather than the window patched over. It fired immediately:

```
[ingest:bars] APH — REBASED: 2/5 stored sessions disagree from 2026-09-01;
              consistent 2.0000x — looks like a split; refetched from 2021-06-21
```

`bars:audit` scans stored series for jumps a refresh window can no longer reach.
Over all 55 instruments: **24 sessions worth checking, and only APH lands on a
round factor**. The large moves in held names — VRT −36.7% in Feb 2022, CRDO,
NBIS — are genuine.

---

## 7. Access control

### 7.1 Operator-only writes — `8f7fead`

`app_users` defaults new accounts to viewer and RLS gated writes on
`is_operator()`, but nothing in the app checked, so a viewer saw Add fill, Plan
buy, Confirm, Sell, the dossier editor and the decision form — and learned they
were read-only from a raw Postgres error. `requireOperator()` guards all nine
mutating actions and the controls hide.

### 7.2 Operator-only reads — `444567b`

The half left open since August. Every table stayed `for select to authenticated
using (true)`, and **two viewer accounts had existed since 14–15 August** — able
to read the exact cash balance, every fill and its cost basis, and
`planned_actions`, the buys that had not happened yet. A live feed of intended
trades is front-running material.

Positions, cash, snapshots, the ledger and the queue are now operator-only.
Research is untouched, and nothing is withheld that the public catalog does not
already publish in percentage terms. The public and agent APIs read through the
service role, so neither changed.

RLS is silent when it refuses, so a viewer would have seen NAV $0 and an empty
book — "the fund holds nothing" rather than "this is not yours". Briefing,
Portfolio and Workbench's Risk view say so instead, and the nav no longer offers
them; the routes gate themselves, since hiding nav is not a boundary.

`viewer_read_surface.sql` asserts it from outside, as the `authenticated` role
carrying a viewer's JWT — including that the **operator still sees rows**, since
a total lockout would otherwise satisfy "viewer sees nothing".

---

## 8. Engineering hygiene

| | |
|---|---|
| **`supabase db reset` was broken** — `655d1c5` | The EQIX risk field opened a dollar-quoted string whose body began with `$`, so `$$$5–6B annual capex` read as `$$$` to the CLI's seed batcher and it lost the rest of the file. Postgres parses it fine; only seeding failed, which is why it went unnoticed — and why the local database had been unusable for testing migrations. Every migration since has been applied to a full local reset before production. |
| **`db:test` ran two of three suites** — `655d1c5` | Now loops over `supabase/tests/*.sql`, so `review_tasks.sql` ran for the first time since it was written, and anything added later is picked up. 38 assertions across 4 suites. |
| **No CI at all** — `444567b` | Typecheck, 269 unit tests and the web build on every push and pull request, plus a second job applying all 28 migrations to an empty database and running the SQL suites. Green on its first run. |
| **Repo/production migration drift** | Two local-only migrations never applied, one production-only version with no local file. Reconciled on the operator's instruction that production is authoritative: `20260902040000` marked applied (its effects were present, and replaying it would have deleted 1,340 live bars), the phantom row reverted, and `20260901034006` allowed to run rather than marked — it is idempotent, so running it removed the guess. |

---

## 9. Verification at the end of the two days

| Check | Result |
|---|---|
| `verify_book_against_ledger()` | 17/17 exact against production |
| Snapshot alignment | 16 sessions, 0 alignment issues, 0 stale marks |
| Published deployed drawdown | 16.7% (was 25.1% fiction) |
| Fundamentals projection vs vintages | 0 rows disagree on value, date or link |
| Viewer read surface | 0 rows visible across 5 book tables; operator unaffected |
| Migration history | 28 versions, 0 mismatched |
| Unit tests / SQL assertions | 269 / 38 |
| CI | both jobs green |

---

## 10. Found and deliberately not fixed

Recorded so they are not rediscovered as new.

| Item | Why it was left |
|---|---|
| **APH dossier anchors at ~$157.60** — pre-split, now 2× the real price | Dossier text is research; editing it needs operator approval per the process rules. A specific instance of the anchor drift in review §8, where 13 of 30 dossiers were already >10% adrift. |
| **Scenario values are not a stored object** | The largest remaining gap between the mandate's process and the software. Ritual 9's probability-weighted returns are re-derived from prose by an LLM every month; the app cannot recompute, check, or re-price them. |
| **Replay universe is survivorship-contaminated** | Needs a point-in-time watchlist — names as they were added, including ones since dropped — before the scorer verdict means anything absolute. |
| **Signals are 65% noise** | 70 of 107 rows are `X → X`, written when data completeness changes rather than the setup. |
| **Weekly-hold completion path** | Due links the stale row; completion requires a new journal entry, so grading the old enter feels like completion and is not. |
| **No quarterly review task** | Q3 ends 30 September; rituals 10 and 12 have nowhere to persist. |
| **0 `decision_outcomes` across 38 decisions** | Ritual 12 has no calibration data. |
| **`macro` review scope undocumented** | 8 of 27 live tasks use a scope the operating process never defines. |
| **`instruments.status = 'active'` is dead; no archive path** | Ritual 5 remains unimplementable across 53 names except by raw SQL. |
| **`bookFill` retry can double-book an unplanned fill** | Queued fills are protected by the `planned_action_id` unique index; manual ones are not. |
| **`listDecisions` is unbounded** | Will silently truncate at the PostgREST 1,000-row cap and break `thesis_review` detection. |
| **Benchmarks labelled "TR" but computed from price closes** | ~1.2%/yr of flattery against SPY over the multi-year window the mandate wants to judge. |
| **Mandate rule 1 still says "cost and/or market"** | The code chose market three weeks ago; the doc has not. |

---

## 11. The lesson worth keeping

Three of these defects were found only because a number looked implausible and
someone chased it: a 475% twelve-month mean, a 397-day median filing lag, a
−49% day followed by a +106% day. None were caught by a test, and all were in
code with passing tests around it.

What the tests were missing is not coverage but **class**. They asserted that
functions compute correctly given inputs. The defects were all in whether the
inputs meant what they claimed. The new suites assert invariants over stored
data instead — that a snapshot's marks come from its own session, that a vintage
is dated by the filing that disclosed it, that a viewer sees nothing while the
operator still sees rows, that the stored series still agrees with the vendor.

The cheapest guard of all remains unused elsewhere in the system:
`verify_book_against_ledger()` exists, passes, and is called by nothing but a
test. Wiring that class of check — projection against source, nightly, surfaced
as a flag — is the generalisation of everything above.
