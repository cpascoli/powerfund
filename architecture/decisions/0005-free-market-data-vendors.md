# ADR 0005: Free-tier market data vendors (Phase 1)

## Status

Accepted

## Context

We need daily OHLCV, market cap, and core quarterly fundamentals (revenue, FCF, capex, net debt, shares) for the watchlist without paying for institutional feeds yet.

## Decision

Phase 1 free stack (fallback chains in `@powerfund/data-clients`):

| Data | Primary | Fallbacks |
|------|---------|-----------|
| Daily OHLCV | **Tiingo** Starter (free API key) | Yahoo `chart()` → Stooq CSV |
| Market cap | Yahoo `quote()` | leave null if blocked |
| Quarterly fundamentals | **SEC** companyfacts (no key) | Yahoo `fundamentalsTimeSeries` |

Constraints we accept:

- Personal / internal research use only (vendor ToS)
- Yahoo / Stooq paths are best-effort and may rate-limit or challenge bots; Tiingo is preferred for bars when `TIINGO_API_KEY` is set
- SEC requires a descriptive User-Agent; coverage is strongest for US `us-gaap` filers
- No real-time requirement — end-of-day / delayed is enough
- Rate-limit politely (sleep between tickers)

## Consequences

- Worker can bootstrap the watchlist at $0 (Tiingo key recommended for reliable bars)
- Yahoo alone is not production-reliable — chains + `source` column support vendor swaps
- Store `source` on every row so we can migrate vendors without ambiguity
