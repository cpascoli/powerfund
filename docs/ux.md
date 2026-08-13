# Research UX

How Power Fund’s frontend should feel as we add research, datasets, and charts over time.

**Audience (now):** you as operator/PM.  
**Audience (later):** other investors consuming insight — same IA, tighter permissions.

## Product job

Make a dense investment-intelligence world **navigable**: find what matters, understand why, drill into evidence, and leave a decision trail — without drowning in dashboards.

Visualization is a first-class medium, not decoration. Every chart should answer a question or support a decision.

## Information architecture

Five zones. Everything we publish maps into one of them.

```text
Briefing     →  what needs attention now
Explore      →  browse the research universe (themes → names → dossiers)
Signals      →  ranked candidates with rationale
Workbench    →  charts, comparisons, datasets (deep viz)
Portfolio    →  book, exposure, risk against mandate
Journal      →  theses, actions, outcomes
```

### Navigation rules

1. **One primary nav** — the zones above. No competing top bars.
2. **Drill down, don’t fork** — Theme → Instrument → Dossier tabs (Overview / Filings / Charts / Notes). Breadcrumbs always present on drill-downs.
3. **Signals and Journal stay shallow** — inbox/list → detail. Depth lives in Explore + Workbench.
4. **Workbench is for questions** — “compare these three names”, “CapEx vs price”, “theme relative strength”. It is not a second home page.
5. **Context travels** — opening a chart from a dossier pre-selects that instrument; from a theme, the theme filter is set.

### Object model users learn

| Object | User meaning |
|--------|----------------|
| Theme | Sector / concentration bucket |
| Instrument | Company or liquid proxy |
| Document | Filing, transcript, note artifact |
| Signal | “Why look now” candidate |
| Position | Capital at risk |
| Decision | Written thesis + outcome |
| View (Workbench) | Saved chart/query over data |

Teach these nouns consistently in UI copy. Avoid inventing parallel vocabularies per page.

## Density without chaos

Investment tools fail when everything is visible at once. Prefer:

| Pattern | Use |
|---------|-----|
| **Briefing strip** | 3–6 items: new signals, risk flags, thesis due for review |
| **Scoped pages** | One job per route (see mandate: one job per section) |
| **Progressive disclosure** | Summary → evidence → raw data |
| **Linked highlighting** | Hover a name in a table; related series dims/highlights in the chart |
| **Saved views** | Persist Workbench configurations; don’t force rebuilds |
| **Empty states with next action** | Always say what to add or connect next |

Avoid: KPI walls, multi-chart heroes, floating badge clutter, duplicate “overview” cards that restate the same NAV five ways.

## Visualization principles

1. **Question first** — title the chart as a question or claim (“AI-infra relative strength vs SPX”), not “Chart 1”.
2. **Evidence adjacent** — chart + the 2–3 facts that justify attention (signal rationale, CapEx note, filing link).
3. **Comparable defaults** — same color for a theme everywhere; same scale conventions for returns vs levels.
4. **Time is the default axis** — most research views are temporal; cross-sectionals are secondary.
5. **Late-chase warnings** — when price is parabolic or crowded, surface that next to the viz (mandate alignment).
6. **Performance** — virtualize long lists; don’t ship megapoint canvases on first paint; aggregate then zoom.
7. **Exportable** — every serious view should be linkable (`/workbench?…` or saved id) for weekly review.

### Planned viz surface (Workbench)

Start lean; grow deliberately:

- Theme map / treemap of watchlist coverage and exposure
- Price + key event markers (filings, signals, decisions)
- Relative strength vs benchmark / theme basket
- Factor/score history once scorers exist
- Dataset browser (tables first, then plots)

Chart library choice is deferred until the first real series lands — document the pick in an ADR when we add it.

## Page intents

| Route | Intent | Viz expectation |
|-------|--------|-----------------|
| `/` Briefing | Situational awareness | Small sparklines / risk meters later; not a chart zoo |
| `/explore` | Enter the universe | Theme map, coverage counts |
| `/explore` → instrument | Dossier | Price + events; filings list; notes |
| `/signals` | Triage inbox | Confidence/score distribution optional |
| `/workbench` | Open-ended analysis | Primary heavy-viz home |
| `/portfolio` | Mandate, book, and deployment queue | Exposure by theme, drawdown |
| `/decisions` (Journal) | Process memory | Timeline; optional P&L by decision |

## Interaction standards

- **Keyboard**: `/` focus search (when search exists); `j/k` list navigation on inbox-style pages.
- **Search**: global search over instruments, themes, decisions, documents — highest leverage nav feature after IA.
- **Filters**: theme, status, date range — sticky per zone in URL query params.
- **Mobile**: readable briefing + signal triage; deep Workbench can be desktop-first.

## Trust & tone

- Explainability over spectacle — every signal and highlighted datapoint should open its “why”.
- Numbers need as-of timestamps and units.
- Distinguish **fact** (filing date, reported CapEx) from **interpretation** (our score, our thesis).

## Out of scope for UX v1

- Real-time trading blotter aesthetics
- Dark-mode-first “terminal” cosplay
- Public marketing landing inside the app shell

## Evolution

When we add a major dataset or chart type, update:

1. This file (where it lives in the IA)
2. [`architecture/overview.md`](../architecture/overview.md) if a new app boundary appears
3. The nav only if a **new zone** is truly needed — prefer nesting under Explore or Workbench
