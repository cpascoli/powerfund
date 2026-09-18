# Are we on track? — 18 September 2026

A short companion to the [2026-09-18 full review](./2026-09-18-full-review.md).
That document is the audit. This one answers the question the operator actually
asked after reading it: *if we follow the process and rituals we are building,
are we on a good track to build and manage a successful AI stock portfolio —
and what quick wins is a system that aims to replicate a professional fund
still missing?*

Written as an opinion, not a finding. Where it makes a claim about the live
book, the number is from the full review.

---

## 1. The honest answer, in two parts

### The process: yes, and more than most personal books ever get to

The system has a written mandate, a ledger that reconciles to the cent, a
performance series keyed on the cash session rather than the wall clock, a
kill-switch that reads a true series, and rituals that fire on schedule and
leave a durable record. In the five weeks since the last review the process
caught its own mistakes — the snapshot alignment bug, the APH split, the KRW
listing — and fixed each without touching capital. That is the part a
professional fund gets right and an amateur never builds. It is real, and it
is the reason the rest of this note is worth writing.

### The portfolio: unproven, and the early read is against us

The unitized deployed sleeve is **−13.8% since 12 August against SPY −2.4%**.
Eight names over five weeks is far too little to conclude anything about
skill. It is enough to say that the process has not yet earned the right to
more capital, and that the mandate's Phase-1 gate is correctly not granting it.

The risk worth naming is this. The process is very good at **protecting** NAV
(90% cash, small tranches, written invalidations on every position) and very
good at **explaining** losses (three drawdown diagnostics in five weeks, each
concluding "factor compression, hold"). It has almost nothing yet that forces
it to **learn**:

- `decision_outcomes` has zero rows after 57 decisions;
- the mandate has no relative-return clause, so a sleeve that does −14% while
  QQQ does −3% passes every rule;
- each diagnostic answers fresh, with no obligation to say what would make
  the next one conclude differently.

A fund that measures itself carefully but never scores itself can run a
beautiful process into mediocre returns indefinitely. So: **good track for
building the system; unproven for the returns; and the missing piece is not
more risk control, it is a feedback loop that can tell us when our
stock-picking rules are wrong.**

---

## 2. Quick wins a professional fund would have that we do not

None of these is large. Four are changes to the mandate and the agent's
instructions; three are one table or one view each. Together they turn a
system that already *records* well into one that can *learn*.

### 2.1 A pre-mortem on every entry

Before a fill, write two numbers on the decision: the **expected 12-month
return** and the **probability the invalidation is hit**. In a year the
hit-rate is a fact rather than a feeling, and the hit-rate is what decides how
positions should be sized. Cost: two nullable columns on `decisions`, two
fields on the enter/add forms and `createDecision`, and a line in ritual 7.

### 2.2 Grade decisions on a clock, not on inspiration

`recordDecisionOutcome` exists and has never been called. Make the 30 / 90 /
180-day grade a Due item in the Briefing, the same way the weekly hold is.
`decision-returns.ts` already computes the close-to-close return against SPY
for each horizon; the ritual only has to write the row and a one-line
"what we got right / wrong". Start with the 30 August enters — they are the
rows sitting under the −13.8%.

### 2.3 Dollar-at-risk to invalidation, on the book page

NBIS at $1,500 and VRT at $5,000 carry very different loss-to-stop, and
nothing on Portfolio → Book shows it. Every desk shows it. Parse the stop from
`positions.invalidation` where it is a price (or add a numeric
`invalidation_price` column) and render **(price − stop) × quantity** next to
market value, plus the sum for the sleeve. Display only, no automation — but it
changes how the next tranche gets sized.

### 2.4 A relative benchmark in the mandate

Every rule in `mandate.md` is absolute: 15% sleeve drawdown, NAV preservation,
position and theme caps. Add one clause to the capital Phase-1 → 2 transition
(ritual 13): *the deployed sleeve must be within N points of QQQ over the
phase, or the transition review must say in writing why we are deploying more
into demonstrated underperformance.* Pick N at the next monthly pass. Until
then `getPerformance` already computes the number; the quarterly review
should be required to quote it.

### 2.5 Attribution by factor, not by theme

The diagnostics already attribute ~81% of dollar losses to the
AI-infrastructure factor across names filed under five different themes (CLS,
VRT, NVT, CRDO, NBIS). Theme caps are not protecting the book from what is
actually correlated. `FACTOR_EXPOSURES` and the Workbench → Risk view exist;
make the factor weight a **gate input** (a soft flag on `evaluateProposedBuy`
when the incremental buy pushes any single factor past a chosen share of
deployed cost), and make the monthly pass quote the factor split, not only the
theme split.

### 2.6 A point-in-time watchlist, starting today

One append-only table: `watchlist_membership (instrument_id, added_at,
removed_at, reason)`. Without it we can never test whether our *idea
generation* beats the market — only whether the names that survived did,
which is the survivorship bias that already made the first scorer replay
unusable for tuning. It cannot be backfilled. Every month of delay is a month
of evaluation we will never have.

### 2.7 "What would change my mind" on every diagnostic

Three identical "factor compression, hold" conclusions in five weeks is a
pattern the ritual should be able to see. Add one required line to ritual 11's
outcome: *this is diagnostic N for this sleeve; the evidence that would make
the next one conclude differently is X.* The historical review gate already
loads the prior diagnostics; the instruction should demand the count and the
falsifier be written down. That is the difference between a review and a
reassurance.

---

## 3. Sequencing

Do 2.1, 2.2 and 2.7 first: they are instruction and schema changes, they
need no new machinery, and they start generating the data the others read.
Start 2.6 the same day because it cannot wait. Then 2.3 and 2.4 at the next
monthly pass (1 October), where N and the sizing display can be decided with
the book in front of us. 2.5 last, once a month of factor attribution has been
quoted by hand and we know which threshold is meaningful.

None of this authorises a dollar of new capital. Software Phase N is not
capital Phase N. What it does is make the capital Phase-1 → 2 review, when it
comes, a decision made on evidence the process generated about itself rather
than on the fact that the calendar reached January.
