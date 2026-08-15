-- PowerFund benchmark dossier replacements
-- Research as of 2026-08-15
-- Assumes public.instruments has a unique symbol column.
-- Review scenario assumptions and refresh market-price inputs before running.

begin;

do $guard$
begin
  if (select count(*)
      from public.dossiers d
      join public.instruments i on i.id = d.instrument_id
      where i.symbol in ('CLS', 'VRT', 'NVT', 'MRCY', 'NBIS')) <> 5 then
    raise exception 'Expected one existing dossier for each of CLS, VRT, NVT, MRCY and NBIS';
  end if;
end
$guard$;

-- CLS — Celestica
update public.dossiers as d
set
  status = 'investigate'::public.dossier_status,
  summary = $pf$**Research status:** Primary-source verified through Q2 2026. **Valuation basis:** $335.05 closing price on 14 August 2026.

Celestica is executing exceptionally well in AI networking and compute hardware: Q2 revenue rose 62% to $4.70B, CCS revenue rose 84% to $3.81B, adjusted operating margin reached 8.2%, and management raised 2026 guidance to $20.5B revenue and $11.30 adjusted EPS. The investment is nevertheless a concentrated hyperscaler-capex and programme-execution bet. Three customers represented 32%, 14%, and 12% of 2025 revenue, and the shares trade at about 29.7x 2026 adjusted EPS guidance. The position merits a starter/medium weight, but additions should require either estimate-confirming evidence or a materially better entry valuation.$pf$,
  thesis = $pf$## Investment case

Celestica has evolved from a low-margin contract manufacturer into a higher-value design, manufacturing and platform partner for AI/ML compute and data-centre networking. Its Hardware Platform Solutions business supplies networking switches and compute/storage platforms, while its manufacturing scale, supply-chain execution and rack-level engineering allow hyperscalers to outsource increasingly complex systems.

The variant perception is not that AI infrastructure demand is undiscovered; it is that Celestica may sustain higher growth and margins for longer than the market expects as multiple switching and AI/ML compute programmes ramp. The counterpoint is that the current price already discounts a large portion of that transition, while customer concentration gives buyers significant bargaining power.

## Verified operating baseline

- Q2 2026 revenue: **$4.70B**, up **62%** year over year.
- Q2 CCS revenue: **$3.81B**, up **84%**; CCS margin **8.7%**.
- Q2 HPS revenue: approximately **$1.9B**, up **58%**.
- Q2 adjusted operating margin: **8.2%**; adjusted EPS: **$2.54**.
- 2026 company outlook: **$20.5B revenue** and **$11.30 adjusted EPS**.
- First-half operating cash flow was approximately **$767M** and capex approximately **$493M**, implying roughly **$274M** of company-defined pre-dividend free cash flow before other investing uses.
- 2025 customer concentration: top three customers were **32%**, **14%**, and **12%** of revenue; top ten were **79%**.

## Valuation scenarios

These are PowerFund scenarios, not company guidance. They use the 14 August 2026 price of $335.05 and exclude dividends.

### 24 months

| Case | Weight | Core assumptions | Implied value | Return / CAGR |
|---|---:|---|---:|---:|
| Bear | 25% | $14 adjusted EPS; 18x P/E; programme growth normalises sharply | $252 | -24.8% / -13.3% |
| Base | 50% | $21 adjusted EPS; 25x P/E; major ramps convert with modest margin expansion | $525 | +56.7% / +25.2% |
| Bull | 25% | $28 adjusted EPS; 28x P/E; multiple compute/networking wins scale successfully | $784 | +134.0% / +53.0% |

Probability-weighted working value: approximately **$522**, or **24.8% annualised**. The probabilities are research priors, not forecasts.

### 60 months

| Case | Weight | Core assumptions | Implied value | Return / CAGR |
|---|---:|---|---:|---:|
| Bear | 25% | $16 normalised EPS; 16x P/E after AI capex cycle matures | $256 | -23.6% / -5.2% |
| Base | 50% | $30 EPS; 22x P/E; Celestica retains a durable higher-value platform role | $660 | +97.0% / +14.5% |
| Bull | 25% | $45 EPS; 27x P/E; sustained share gains and structurally higher margins | $1,215 | +262.6% / +29.4% |

Probability-weighted working value: approximately **$698**, or **15.8% annualised**.$pf$,
  catalysts = $pf$- Delivery of 2026 revenue and adjusted EPS guidance without deterioration in working-capital quality.
- Evidence that 2027 growth is supported by multiple customers and programmes rather than one outsized ramp.
- Continued growth in 800G/1.6T networking switches and next-generation rack-scale AI compute platforms.
- CCS and HPS mix growth accompanied by adjusted operating-margin expansion above the Q2 2026 level.
- Customer diversification: new hyperscaler wins or a falling share of revenue from the largest customer.
- Free-cash-flow conversion improving after the elevated 2026 capacity-investment programme.$pf$,
  risks = $pf$- **Customer concentration:** one customer represented 32% of 2025 revenue; master supply agreements generally do not guarantee volumes or fixed pricing.
- **AI-capex cyclicality:** a hyperscaler spending slowdown could hit networking, compute, capacity utilisation and valuation simultaneously.
- **Programme execution:** rapid ramps create inventory, component, quality, yield and delivery risk.
- **Customer bargaining power:** hyperscalers can demand price reductions, redesign systems, shift suppliers or internalise more design work.
- **Capital intensity:** 2026 capex is far above Celestica's historical percentage of revenue, increasing fixed costs and depreciation if demand disappoints.
- **Margin ceiling:** even after improvement, operating margins remain modest relative to the valuation and leave limited room for execution errors.
- **Technology transitions:** Ethernet/fabric architecture, custom silicon or rack design changes can render programmes less valuable faster than conventional industrial cycles.
- **Valuation compression:** strong fundamental results can coexist with poor stock returns if the forward multiple normalises.$pf$,
  invalidation = $pf$## Warning — investigate and freeze additions

- CCS or HPS growth falls below approximately 25% year over year without a clearly temporary supply/timing cause.
- Adjusted operating margin falls below 8% or gross-margin progress stalls while revenue continues growing.
- Management weakens its 2027 programme commentary, customer forecasts soften, or working capital grows materially faster than revenue.
- Forward valuation exceeds roughly 35x adjusted EPS while consensus revisions stop rising.

## Reduce — normally trim 25–50%

- CCS revenue declines sequentially for two quarters or a major programme is delayed/lost.
- 2026/2027 revenue or EPS expectations are cut by more than 10–15%.
- Adjusted operating margin remains below 7.5% for two quarters despite strong AI demand.
- Free-cash-flow conversion remains weak after the current capacity build, with inventory and receivables persistently outgrowing sales.
- The largest customer materially reduces demand and replacement programmes do not offset it.

## Invalidate — exit unless a documented exception is approved

- Loss or structural downsizing of a top customer/programme causes a greater-than-20% reset to normalised earnings power.
- Two major hyperscaler programmes are lost, cancelled or insourced.
- HPS/CCS growth and backlog/forecast evidence show a structural, not temporary, end to the AI infrastructure ramp.
- Celestica cannot earn at least a high-single-digit adjusted operating margin at scale, undermining the higher-value platform thesis.
- Accounting, controls, liquidity or customer-credit evidence makes reported earnings or cash conversion unreliable.$pf$,
  competitive_notes = $pf$Celestica competes with Jabil, Flex, Hon Hai/Foxconn and other electronics-manufacturing and design providers, while also facing customer insourcing. Its emerging advantage is the combination of global manufacturing, supply-chain management and differentiated HPS design capability in networking and AI compute. The company is increasingly viewed as an ODM rather than only an EMS vendor.

The moat is programme-specific rather than absolute. Qualification, engineering integration and delivery performance create switching costs, but hyperscalers remain sophisticated, concentrated customers with the ability to dual-source and negotiate price. Celestica should therefore be valued as an excellent cyclical execution company with improving strategic content—not as a software-like monopoly.$pf$,
  next_diligence = $pf$1. Map the 32%/14%/12% customers to disclosed programmes as far as public evidence permits; quantify revenue and margin sensitivity to each.
2. Reconcile management's 2027 growth commentary with estimated programme capacity, component availability and customer capex plans.
3. Track quarterly HPS revenue, CCS margin, inventory, receivables, customer advances and capex-to-revenue.
4. Build normalised EPS and free-cash-flow cases that remove total-return-swap fair-value effects and distinguish sustainable margin from ramp benefits.
5. Compare CLS programme exposure and valuation with Jabil, Flex and Hon Hai rather than only AI semiconductor peers.
6. Refresh scenarios after Q3 2026 results or immediately following a material hyperscaler capex revision.

**Next scheduled review:** Q3 2026 results; earlier if a top customer changes capex guidance.$pf$,
  source = $pf$Primary sources verified through 15 August 2026:

- [Celestica Q2 2026 earnings release and financial tables](https://corporate.celestica.com/news-releases/news-release-details/celestica-announces-second-quarter-2026-financial-results), 27 July 2026.
- [Celestica 2025 Form 10-K](https://www.sec.gov/Archives/edgar/data/1030894/000103089426000011/cls-20251231.htm), including customer concentration, HPS exposure and capital-investment risks.
- [Celestica quarterly-results archive](https://corporate.celestica.com/quarterly-results).
- Market-price input: $335.05 close on 14 August 2026; refresh all scenario returns before a new capital decision.

All 24/60-month scenario assumptions, probabilities and implied values are PowerFund calculations, not company guidance or analyst consensus.$pf$
from public.instruments as i
where d.instrument_id = i.id
  and i.symbol = 'CLS';

-- VRT — Vertiv
update public.dossiers as d
set
  status = 'investigate'::public.dossier_status,
  summary = $pf$**Research status:** Primary-source verified through Q2 2026. **Valuation basis:** $293.84 closing price on 14 August 2026.

Vertiv is the strongest operating business in the current portfolio but also the most visibly priced for sustained excellence. Q2 sales grew 24%, adjusted operating profit grew 51%, adjusted margin reached 22.6%, and management raised 2026 guidance to $13.8–14.2B revenue, 23.3–24.3% adjusted operating margin, $6.65–6.75 adjusted EPS and $2.4–2.6B adjusted FCF. At approximately 43.9x midpoint 2026 adjusted EPS, the thesis requires continued AI power/cooling content growth, strong execution and a premium terminal multiple. Hold as a high-quality AI-infrastructure position, but add only on estimate-confirming evidence or meaningful de-rating.$pf$,
  thesis = $pf$## Investment case

AI racks require far greater power density, thermal management and systems integration than conventional data-centre equipment. Vertiv supplies critical power, cooling, racks, services and controls across the facility-to-rack stack. Its installed base, engineering relationships, global service footprint and ability to validate integrated systems give it a strong position as customers move to liquid cooling and higher-density architectures.

The variant perception is that Vertiv's content per MW and service opportunity can rise fast enough for earnings to compound even as overall data-centre growth eventually normalises. The market already recognises this thesis: the central investment question is not whether demand is strong, but whether future earnings can exceed the high expectations embedded in the price.

## Verified operating baseline

- Q2 2026 net sales: **$3.274B**, up **24%**; organic growth was **18%**.
- Adjusted operating profit: **$738M**, up **51%**; adjusted margin **22.6%**.
- Adjusted EPS: **$1.52**, up **60%**.
- Q2 adjusted free cash flow: **$925M**; the company ended Q2 in a net-cash position with **$5.6B liquidity**.
- 2026 guidance: **$13.8–14.2B sales**, **30–32% organic growth**, **23.3–24.3% adjusted operating margin**, **$6.65–6.75 adjusted EPS**, and **$2.4–2.6B adjusted FCF**.
- Q3 guidance calls for **34–36% organic growth** and a **24–25% adjusted operating margin**.

## Valuation scenarios

PowerFund scenarios based on $293.84 on 14 August 2026; dividends excluded.

### 24 months

| Case | Weight | Core assumptions | Implied value | Return / CAGR |
|---|---:|---|---:|---:|
| Bear | 25% | $7.50 EPS; 25x P/E; orders normalise and multiple compresses | $188 | -36.0% / -20.0% |
| Base | 50% | $11 EPS; 35x P/E; sustained content growth with some multiple normalisation | $385 | +31.0% / +14.5% |
| Bull | 25% | $14 EPS; 45x P/E; liquid cooling and power systems exceed expectations | $630 | +114.4% / +46.4% |

Probability-weighted working value: approximately **$397**, or **16.2% annualised**.

### 60 months

| Case | Weight | Core assumptions | Implied value | Return / CAGR |
|---|---:|---|---:|---:|
| Bear | 25% | $10 normalised EPS; 22x P/E after capex-cycle maturity | $220 | -25.1% / -5.6% |
| Base | 50% | $18 EPS; 30x P/E; durable systems-and-service compounder | $540 | +83.8% / +12.9% |
| Bull | 25% | $28 EPS; 40x P/E; structural content and share gains persist | $1,120 | +281.2% / +30.7% |

Probability-weighted working value: approximately **$605**, or **15.5% annualised**.$pf$,
  catalysts = $pf$- Q3 delivery near the 34–36% organic-growth and 24–25% adjusted-margin guidance ranges.
- Sustained positive order growth and pipeline conversion into backlog and revenue.
- Accelerating adoption of liquid cooling and high-density power architectures for next-generation GPU systems.
- Expansion of service and controls revenue, improving recurring economics and customer stickiness.
- Further adjusted-margin and free-cash-flow upside from productivity, price/cost and scale.
- Evidence that recent acquisitions broaden rack-level content without reducing ROIC or balance-sheet quality.$pf$,
  risks = $pf$- **Valuation:** approximately 43.9x midpoint 2026 adjusted EPS leaves little tolerance for an ordinary growth slowdown.
- **Shared factor exposure:** the same hyperscaler-capex shock would affect VRT, CLS, NVT and NBIS.
- **Order timing and cancellation:** large, multi-phase projects create lumpiness and working-capital requirements.
- **Competition:** Schneider Electric, Eaton, Delta, Johnson Controls, Trane and customer-designed systems can pressure share and economics.
- **Technology/content risk:** more efficient architectures or customer standardisation could reduce Vertiv content per rack or per MW.
- **Execution:** rapid capacity expansion, acquisitions and global supply-chain complexity can create delivery, quality and integration problems.
- **Margin normalisation:** current productivity, mix and price/cost benefits may not persist through a slower demand environment.
- **Multiple compression:** even correct long-term fundamentals may not protect the stock during a 6–12 month risk-off period.$pf$,
  invalidation = $pf$## Warning — investigate and freeze additions

- Organic sales growth falls below 15% without a clearly temporary project-timing explanation.
- Adjusted operating margin falls below 22%, pipeline language weakens, or working capital rises materially faster than sales.
- Order growth turns negative, if disclosed, or backlog/pipeline conversion is repeatedly deferred.
- Forward P/E remains above approximately 45x while EPS revisions flatten.

## Reduce — normally trim 25–50%

- Trailing order growth is negative or book-to-bill is below 1 for two reporting periods, if disclosed.
- Full-year revenue or adjusted-EPS guidance is reduced by more than 10%.
- Adjusted operating margin remains below 21% for two quarters despite continued data-centre growth.
- Material liquid-cooling or power design wins shift to competitors, or acquisition/integration problems weaken FCF and ROIC.
- Hyperscaler capex guidance turns down and Vertiv's own pipeline/order evidence confirms the slowdown.

## Invalidate — exit unless a documented exception is approved

- Organic growth remains below 10–12% for two quarters while orders/backlog also contract.
- Persistent, evidenced market-share loss in liquid cooling, high-density power or integrated rack infrastructure.
- A technology or customer-architecture shift structurally reduces Vertiv content per rack/MW.
- Adjusted operating margin falls below 18–20% for several quarters without a credible temporary cause.
- Balance-sheet or acquisition behaviour changes the thesis from high-quality organic compounder to leveraged roll-up.$pf$,
  competitive_notes = $pf$Vertiv's primary advantage is breadth across critical power, thermal management, racks, controls and global services, combined with close engineering work with chip, server and data-centre customers. Its service network and installed base create switching costs and help it participate across the infrastructure lifecycle.

Schneider Electric and Eaton have broader electrical portfolios and balance sheets; Delta has component and power-electronics scale; Johnson Controls and Trane compete in cooling; hyperscalers can also design or dual-source subsystems. Vertiv's differentiation is strongest where integrated, validated operation at extreme rack densities matters. The dossier should therefore track design wins and content per MW, not merely industry megawatts.$pf$,
  next_diligence = $pf$1. Capture quarterly organic orders, backlog and book-to-bill whenever management discloses them; distinguish cancellations from project timing.
2. Build an explicit content-per-MW bridge for power, liquid cooling, racks and services across current and next-generation GPU architectures.
3. Compare VRT margins, valuation and growth with Schneider Electric and Eaton on a consistent accounting basis.
4. Separate organic margin improvement from acquisition mix, price/cost and temporary working-capital benefits.
5. Track top-customer concentration, large-project terms and fixed-price exposure from the 10-Q/10-K.
6. Refresh scenario EPS and multiples after Q3 2026; do not add simply because the stock declines.

**Next scheduled review:** Q3 2026 results or an earlier hyperscaler-capex guidance change.$pf$,
  source = $pf$Primary sources verified through 15 August 2026:

- [Vertiv Q2 2026 earnings release and financial tables](https://investors.vertiv.com/news/news-details/2026/Vertiv-Reports-Strong-Second-Quarter-2026-with-Diluted-EPS-Growth-of-53-Adjusted-Diluted-EPS-Growth-of-60-Raises-Full-Year-2026-Guidance-Across-All-Key-Metrics/default.aspx), 29 July 2026.
- [Vertiv quarterly-results archive](https://investors.vertiv.com/financials/quarterly-results/default.aspx).
- [Vertiv SEC filings](https://investors.vertiv.com/financials/sec-filings/default.aspx), including the Q2 2026 Form 10-Q.
- Market-price input: $293.84 close on 14 August 2026; refresh before a new capital decision.

All 24/60-month scenario assumptions, probabilities and implied values are PowerFund calculations.$pf$
from public.instruments as i
where d.instrument_id = i.id
  and i.symbol = 'VRT';

-- NVT — nVent Electric
update public.dossiers as d
set
  status = 'investigate'::public.dossier_status,
  summary = $pf$**Research status:** Primary-source verified through Q2 2026. **Valuation basis:** $171.39 closing price on 14 August 2026.

nVent is a focused electrical-infrastructure compounder with genuine data-centre and liquid-cooling exposure, not merely an AI label. Q2 sales rose 53% to $1.471B, organic sales rose 47%, adjusted operating income rose 61%, adjusted EPS rose 69% to $1.45, and backlog reached $2.5B. Management expects more than $2B of 2026 data-centre sales and raised full-year adjusted EPS guidance to $5.00–5.10. At about 33.9x midpoint guidance, its valuation is lower than VRT's but the base-case return hurdle is still only modest. Retain at starter/medium size; additions require durable orders, backlog conversion and evidence that liquid cooling is producing attractive incremental returns.$pf$,
  thesis = $pf$## Investment case

nVent provides electrical connection, protection, enclosures, power distribution and liquid-cooling solutions across data centres, utilities and industrial markets. The portfolio has shifted toward higher-growth infrastructure through acquisitions, divestitures, new products and manufacturing investment. AI rack density increases the need for liquid cooling and protected, reliable electrical distribution, while utility investment provides a partially distinct demand driver.

The variant perception is that nVent can compound above traditional electrical-equipment rates because its data-centre platform is becoming a larger part of the business, while its valuation remains below the most crowded pure-play AI-infrastructure peers. The key challenge is separating sustainable organic demand from acquisition effects and unusually strong near-term liquid-cooling orders.

## Verified operating baseline

- Q2 2026 sales: **$1.471B**, up **53%**; organic growth **47%**.
- Adjusted operating income: **$323M**, up **61%**; adjusted return on sales **21.9%**.
- Adjusted EPS: **$1.45**, up **69%**; free cash flow **$167M**, up **125%**.
- Organic orders grew at a **low-double-digit** rate; backlog was **$2.5B**.
- Infrastructure represented **58%** of year-to-date vertical mix.
- Management expects more than **$2B of data-centre sales in 2026** and is expanding liquid-cooling capacity.
- Updated 2026 guidance: **37–39% reported sales growth**, **32–34% organic growth**, and **$5.00–5.10 adjusted EPS**.
- Net debt/adjusted EBITDA was approximately **1.2x**, below management's 2.0–2.5x target range.

## Valuation scenarios

PowerFund scenarios based on $171.39 on 14 August 2026; dividends excluded.

### 24 months

| Case | Weight | Core assumptions | Implied value | Return / CAGR |
|---|---:|---|---:|---:|
| Bear | 20% | $5.60 EPS; 22x P/E; orders normalise and multiple compresses | $123 | -28.2% / -15.3% |
| Base | 55% | $7.50 EPS; 28x P/E; data-centre growth remains strong but moderates | $210 | +22.5% / +10.7% |
| Bull | 25% | $9 EPS; 34x P/E; liquid cooling and new products sustain premium growth | $306 | +78.5% / +33.6% |

Probability-weighted working value: approximately **$217**, or **12.4% annualised**.

### 60 months

| Case | Weight | Core assumptions | Implied value | Return / CAGR |
|---|---:|---|---:|---:|
| Bear | 20% | $6.50 normalised EPS; 20x P/E | $130 | -24.1% / -5.4% |
| Base | 55% | $11 EPS; 25x P/E; durable infrastructure compounder | $275 | +60.5% / +9.9% |
| Bull | 25% | $16 EPS; 30x P/E; sustained data-centre share and margin gains | $480 | +180.1% / +22.9% |

Probability-weighted working value: approximately **$297**, or **11.6% annualised**.$pf$,
  catalysts = $pf$- Conversion of the $2.5B backlog into revenue without margin or working-capital deterioration.
- Data-centre sales exceeding the 2026 $2B expectation and remaining diversified across customers and architectures.
- Further liquid-cooling design wins and successful ramp of the additional Blaine, Minnesota capacity.
- Organic orders reaccelerating from low-double-digit growth while Q3/Q4 revenue remains strong.
- New products continuing to contribute materially after accounting for acquisition effects.
- Deleveraging and disciplined M&A that earns ROIC above WACC within management's stated three-year target.$pf$,
  risks = $pf$- **Expectation risk:** about 33.9x midpoint 2026 adjusted EPS still assumes premium growth beyond the current year.
- **Order normalisation:** Q2 organic sales growth of 47% substantially exceeded low-double-digit organic order growth, which may foreshadow moderation.
- **Data-centre concentration:** more than $2B of expected 2026 sales creates increasing exposure to the same hyperscaler-capex factor as CLS and VRT.
- **Competitive pressure:** Vertiv, Schneider, Eaton, Rittal and other cooling/electrical suppliers can contest design wins and price.
- **Acquisition/integration risk:** portfolio transformation can obscure underlying organic economics and raise leverage.
- **Capacity risk:** new facilities add fixed costs before demand and yield are fully proven.
- **Tariffs and input costs:** management expects price/productivity to offset inflation, but a gap would pressure margins.
- **Technology risk:** cooling architecture and rack-level standardisation may shift value to competitors or customers.$pf$,
  invalidation = $pf$## Warning — investigate and freeze additions

- Organic orders fall below mid-single digits or backlog stops growing while revenue remains elevated.
- Data-centre growth drops below approximately 20% without a clearly temporary comparison or project-timing effect.
- Adjusted return on sales falls below 20% or free-cash-flow conversion weakens materially.
- Forward P/E exceeds approximately 35x while earnings revisions flatten.

## Reduce — normally trim 25–50%

- Organic orders turn negative and backlog declines more than 10% from peak.
- Full-year organic-growth or adjusted-EPS guidance is reduced by more than 10%.
- Data-centre revenue declines despite continuing end-market growth, implying share loss or programme problems.
- Adjusted return on sales remains below 18–19% for two quarters.
- Net debt/adjusted EBITDA rises above 2.5x because of acquisitions without clearly improving per-share economics.

## Invalidate — exit unless a documented exception is approved

- Organic growth remains below 5% for two quarters while backlog and data-centre orders contract.
- Persistent loss of liquid-cooling or systems-protection design wins shows the portfolio lacks competitive differentiation.
- Adjusted return on sales falls below approximately 17% for several quarters without a temporary explanation.
- Acquisitions, leverage or integration problems prevent FCF from tracking adjusted earnings.
- Data-centre content per rack/MW structurally declines or customers internalise the relevant systems.$pf$,
  competitive_notes = $pf$nVent is more focused than Schneider Electric and Eaton and less comprehensive at facility scale than Vertiv, but it has strong brands and engineering positions in enclosures, protection, connection and liquid cooling. This focus can produce faster growth and attractive incremental margins when its selected categories are bottlenecks.

Its competitive case depends on validated designs, product breadth within the rack/electrical envelope, manufacturing availability and customer qualification. The evidence bar should be actual organic orders, backlog, capacity utilisation and data-centre revenue—not generic growth in AI power demand.$pf$,
  next_diligence = $pf$1. Reconcile low-double-digit Q2 organic order growth with 47% organic sales growth and estimate the implied 2027 growth rate.
2. Obtain the mix, customer concentration and margin profile of the expected $2B+ 2026 data-centre sales.
3. Separate acquisition, FX, price and volume contributions for each segment.
4. Track backlog conversion, cancellation terms, facility ramp costs and utilisation of the new liquid-cooling capacity.
5. Compare NVT's liquid-cooling portfolio and design wins with VRT, Schneider and Eaton.
6. Recalculate scenario EPS after Q3 2026 and test whether the base case still clears PowerFund's required return.

**Next scheduled review:** Q3 2026 results; earlier if organic-order or backlog commentary changes materially.$pf$,
  source = $pf$Primary sources verified through 15 August 2026:

- [nVent Q2 2026 earnings release filed with the SEC](https://www.sec.gov/Archives/edgar/data/1720635/000162828026051203/q22026nvtpressrelease.htm), 31 July 2026.
- [nVent Q2 2026 earnings presentation](https://s22.q4cdn.com/268397047/files/content_files/2026-Q2-Earnings-Deck.pdf), 31 July 2026.
- [nVent Q2 2026 Form 8-K](https://www.sec.gov/Archives/edgar/data/1720635/000162828026051203/nvt-20260731.htm).
- [nVent investor-relations archive](https://investors.nvent.com/events-and-presentations/default.aspx).
- Market-price input: $171.39 close on 14 August 2026; refresh before a new capital decision.

All 24/60-month scenario assumptions, probabilities and implied values are PowerFund calculations.$pf$
from public.instruments as i
where d.instrument_id = i.id
  and i.symbol = 'NVT';

-- MRCY — Mercury Systems
update public.dossiers as d
set
  status = 'investigate'::public.dossier_status,
  summary = $pf$**Research status:** Primary-source verified through Q3 FY2026, but **provisional pending FY2026 results on 18 August 2026**. **Valuation basis:** $111.12 closing price on 14 August 2026.

Mercury's operating turnaround is real but already substantially reflected in the valuation. Q3 bookings rose 73.7% to $348M, book-to-bill reached 1.48, backlog rose 17.9% to about $1.6B, revenue rose 11.5% to $236M and adjusted EBITDA rose 46.2% to $36M. However, Q3 free cash flow was negative $2M, GAAP earnings remained negative, and the approximately $6.9B enterprise value is very high relative to current EBITDA. The current position should remain small and no addition should occur before the 18 August results and a refreshed valuation.$pf$,
  thesis = $pf$## Investment case

Mercury supplies secure, rugged, open-architecture processing, sensor and mission-computing subsystems used across more than 300 aerospace and defence programmes. Defence platforms require increasing compute at the edge, while primes and government customers value trusted domestic supply chains and modular systems that shorten integration timelines.

The thesis combines a secular defence-electronics opportunity with an operational turnaround: record bookings and backlog should convert into higher revenue, margins and cash flow as legacy programme issues and execution problems are resolved. The variant perception is that normalised earnings power can rise much faster than revenue. The valuation, however, now requires much of that recovery to occur.

## Verified operating baseline

- Q3 FY2026 bookings: **$348M**, up **73.7%**; book-to-bill **1.48**.
- Backlog: approximately **$1.6B**, up **17.9%**; **$891M** expected to convert within 12 months.
- Q3 revenue: **$236M**, up **11.5% organically**.
- Adjusted EBITDA: **$36M**, up **46.2%**; adjusted EBITDA margin **15.3%**.
- GAAP net loss: **$3M**; adjusted EPS **$0.27**.
- Q3 operating cash flow **$6M** and free cash flow **negative $2M**.
- Cash at 27 March 2026: approximately **$332M**; long-term debt approximately **$592M**, for roughly **$260M net debt** before leases.
- At $111.12, equity value was approximately **$6.6B** and enterprise value approximately **$6.9B**.

## Valuation scenarios

PowerFund EV/adjusted-EBITDA scenarios based on $111.12, approximately 59–62M diluted shares over time and case-specific net debt. They must be replaced after FY2026 results.

### 24 months

| Case | Weight | Core assumptions | Implied value | Return / CAGR |
|---|---:|---|---:|---:|
| Bear | 30% | $175M EBITDA; 18x EV/EBITDA; ~$300M net debt | $48 | -56.8% / -34.3% |
| Base | 50% | $275M EBITDA; 28x EV/EBITDA; ~$200M net debt | $125 | +12.5% / +6.1% |
| Bull | 20% | $350M EBITDA; 32x EV/EBITDA; ~$100M net debt | $185 | +66.5% / +29.0% |

Probability-weighted working value: approximately **$114**, or only **1.2% annualised**. This fails a high-return hurdle at the current price and argues against adding before new evidence.

### 60 months

| Case | Weight | Core assumptions | Implied value | Return / CAGR |
|---|---:|---|---:|---:|
| Bear | 30% | $220M EBITDA; 16x; ~$200M net debt | $54 | -51.4% / -13.4% |
| Base | 50% | $420M EBITDA; 24x; near-zero net debt | $163 | +46.7% / +8.0% |
| Bull | 20% | $600M EBITDA; 28x; modest net cash | $273 | +145.7% / +19.7% |

Probability-weighted working value: approximately **$152**, or **6.5% annualised**.$pf$,
  catalysts = $pf$- FY2026 results on 18 August confirming backlog conversion, FY2027 growth and margin expectations.
- Book-to-bill remaining above 1 and backlog continuing to grow with high-quality, funded programmes.
- Conversion of the $891M 12-month backlog into revenue without new reach-forward losses or working-capital stress.
- Adjusted EBITDA margin moving sustainably through the high teens toward 20%.
- Positive and improving free cash flow as execution and inventory normalise.
- Production and automation improvements, including the Palantir factory initiative, reducing cycle times and cost.
- Additional wins in radar, electronic warfare, mission computing, autonomy and secure edge processing.$pf$,
  risks = $pf$- **Valuation:** current enterprise value is very demanding relative to present EBITDA and free cash flow.
- **Turnaround execution:** bookings do not guarantee profitable conversion; prior programme and operational problems can recur.
- **Fixed-price/programme risk:** cost overruns, schedule changes and reach-forward losses can erase margin recovery.
- **Cash conversion:** Q3 free cash flow remained negative despite stronger bookings and EBITDA.
- **Customer/programme concentration:** defence procurement timing and a limited set of platforms can make results lumpy.
- **Prime-contractor power:** large defence primes may insource subsystems, dual-source or pressure economics.
- **Leverage and intangible assets:** debt and acquisition history reduce resilience if the recovery stalls.
- **Appropriations risk:** strong defence demand may not translate into timely funded orders or revenue.$pf$,
  invalidation = $pf$## Mandatory near-term review

Re-underwrite the dossier immediately after FY2026 results on 18 August 2026. Do not add before reviewing FY2027 guidance, backlog quality, EBITDA margin, free cash flow and programme charges.

## Warning — investigate and freeze additions

- Quarterly book-to-bill falls below 1 or backlog growth slows below approximately 5%.
- Adjusted EBITDA margin falls below 14% or free cash flow remains negative without a working-capital explanation.
- New programme charges, schedule slips or inventory growth call backlog quality into question.
- Management avoids providing a credible route from bookings to FY2027 cash generation.

## Reduce — normally trim 25–50%

- Book-to-bill remains below 1 for two quarters or backlog declines more than 10%.
- Adjusted EBITDA margin remains below 12–13% for two quarters.
- Free cash flow is negative for two consecutive quarters after the expected turnaround inflection.
- FY2027 guidance implies that current valuation remains above roughly 30x credible two-year EBITDA.
- Material reach-forward losses or programme cancellations reverse the earnings recovery.

## Invalidate — exit unless a documented exception is approved

- Backlog fails to convert into sustained organic revenue growth and positive free cash flow.
- A structural programme/customer loss reduces normalised EBITDA power by more than 20%.
- Adjusted EBITDA and cash flow return to pre-turnaround deterioration despite healthy defence demand.
- Debt, covenant or liquidity pressure constrains investment or forces dilutive capital raising.
- Evidence shows Mercury's modular/open processing position is being structurally displaced or insourced.$pf$,
  competitive_notes = $pf$Mercury competes with specialist embedded-compute and defence-electronics suppliers such as Curtiss-Wright and Teledyne, with portfolios inside L3Harris, RTX and other primes, and with customer insourcing. Its differentiation is a commercially developed, modular and open processing platform adapted for secure, rugged defence environments.

The strategic position can be valuable because customers need advanced silicon and software at the edge without redesigning entire platforms. The moat is constrained by programme qualification, prime-contractor bargaining power and Mercury's own execution record. Backlog, margins and FCF must therefore validate the strategic narrative.$pf$,
  next_diligence = $pf$1. **Immediate:** update every operating and valuation assumption after FY2026 results on 18 August.
2. Reconcile total backlog with funded backlog, cancellation rights, programme concentration and expected gross margin.
3. Identify historical reach-forward losses and remaining reserve/execution exposure by programme category.
4. Build a quarterly bridge from bookings to revenue, adjusted EBITDA, working capital and free cash flow.
5. Compare normalised EV/EBITDA and FCF yield with Curtiss-Wright, Teledyne and relevant defence-electronics peers.
6. Determine whether Palantir-enabled automation produces measurable lead-time, inventory and margin improvements.

**Next scheduled review:** 18–19 August 2026 following FY2026 results.$pf$,
  source = $pf$Primary sources verified through 15 August 2026:

- [Mercury Systems Q3 FY2026 earnings release](https://ir.mrcy.com/news-releases/news-release-details/mercury-systems-reports-third-quarter-fiscal-2026-results), 5 May 2026.
- [Mercury Systems quarterly-results archive](https://ir.mrcy.com/financial-information/quarterly-results), including the Q3 presentation.
- [Mercury FY2026 reporting-date announcement](https://ir.mrcy.com/news-releases/news-release-details/mercury-systems-report-fourth-quarter-and-full-year-fiscal-0), confirming results due 18 August 2026.
- Market-price input: $111.12 close on 14 August 2026; refresh immediately after FY2026 results.

All 24/60-month scenario assumptions, probabilities and implied values are provisional PowerFund calculations.$pf$
from public.instruments as i
where d.instrument_id = i.id
  and i.symbol = 'MRCY';

-- NBIS — Nebius Group
update public.dossiers as d
set
  status = 'investigate'::public.dossier_status,
  summary = $pf$**Research status:** Primary-source verified through Q2 2026. **Valuation basis:** $277.68 closing price on 14 August 2026.

Nebius has delivered extraordinary growth and contracted economics, but it is the portfolio's highest-risk holding. Q2 group revenue rose 454% to $582.3M; AI-cloud revenue rose 514% to $575M; AI-cloud ARR reached $3.0B and adjusted EBITDA margin reached about 50%. Management reaffirmed $3.0–3.4B 2026 revenue, $7–9B year-end ARR and about 40% adjusted EBITDA margin. Against that, Q2 capex was approximately $5.7B, 2026 capex guidance is $20–25B, debt reached about $8.55B, and shares outstanding increased to 271.9M after ATM issuance. At roughly $75.5B equity value, the stock offers large upside only if capacity, customer contracts, financing and margins all scale successfully; retain only as a small high-beta position.$pf$,
  thesis = $pf$## Investment case

Nebius is building a full-stack AI cloud spanning GPU infrastructure, orchestration, training and inference, with additional optionality from Avride, TripleTen and equity investments. Demand for scarce AI capacity is being converted into large signed agreements, customer prepayments and attractive management-reported payback periods. A mix of owned, colocated and asset-light capacity may allow the platform to scale faster than traditional clouds.

The variant perception is that Nebius can become a large, profitable specialist AI cloud rather than a leveraged commodity GPU lessor. The opposing case is that current scarcity pricing, prepayments and 50% AI-cloud adjusted EBITDA margin are peak-cycle conditions, while dilution, debt, depreciation, customer concentration and technology obsolescence consume much of the apparent value.

## Verified operating baseline

- Q2 group revenue: **$582.3M**, up **454%**; AI-cloud revenue **$575M**, up **514%**.
- AI-cloud ARR: **$3.0B**, up **56% sequentially**; AI cloud was approximately 98% of group revenue.
- AI-cloud adjusted EBITDA: approximately **$285.7M**, margin **49.7%**; group adjusted EBITDA **$236.2M**.
- Four Q2 cloud agreements averaged more than **$1B TCV** and **$20–25M annual contract value per MW**.
- Approximately **70%** of Q2 deals included prepayments covering **50–60%** of associated capex; management estimates a **1 year 10 month** payback for those deals.
- 2026 guidance reaffirmed: **$3.0–3.4B revenue**, **$7–9B year-end ARR**, approximately **40% adjusted EBITDA margin**, and **$20–25B capex**.
- Q2 capex: approximately **$5.7B**; management expects more than **$9B customer prepayments** during 2026.
- 30 June balance sheet: **$8.04B cash**, approximately **$8.55B current and non-current debt**, plus restricted cash; shares outstanding **271.86M**.
- Through 30 June, Nebius sold **12.7M shares** through its ATM at a weighted average **$223.60**, raising about **$2.8B**; another 12.3M shares remained authorised under that programme.
- Management raised year-end 2026 contracted-power target to **5 GW** and plans to deploy more than **1 GW per year from 2027**.

## Valuation scenarios

PowerFund EV/EBITDA scenarios based on $277.68 and approximately $75.5B current equity value. They explicitly model dilution and case-specific net debt but exclude a separate premium for Avride/ClickHouse/Toloka; this is deliberately conservative and avoids double-counting optionality.

### 24 months

| Case | Weight | Core assumptions | Implied value | Return / CAGR |
|---|---:|---|---:|---:|
| Bear | 35% | $9B revenue; 25% EBITDA margin; 12x EV/EBITDA; $3B net debt; 320M shares | $75 | -73.0% / -48.0% |
| Base | 45% | $18B revenue; 40% margin; 18x; $2B net debt; 310M shares | $412 | +48.4% / +21.8% |
| Bull | 20% | $28B revenue; 48% margin; 22x; near-zero net debt; 300M shares | $986 | +255.1% / +88.4% |

Probability-weighted working value: approximately **$409**, or **21.3% annualised**. The very wide range matters more than the weighted value.

### 60 months

| Case | Weight | Core assumptions | Implied value | Return / CAGR |
|---|---:|---|---:|---:|
| Bear | 35% | $14B revenue; 30% margin; 8x; $2B net debt; 340M shares | $93 | -66.5% / -19.6% |
| Base | 45% | $35B revenue; 42% margin; 14x; near-zero net debt; 330M shares | $624 | +124.7% / +17.6% |
| Bull | 20% | $60B revenue; 48% margin; 18x; near-zero net debt; 320M shares | $1,620 | +483.4% / +42.3% |

Probability-weighted working value: approximately **$637**, or **18.1% annualised**.$pf$,
  catalysts = $pf$- Delivery of $7–9B year-end 2026 ARR and approximately 40% adjusted EBITDA margin.
- Late-2026 capacity for the four large Q2 agreements coming online on schedule and contributing primarily to 2027 revenue.
- Collection of more than $9B of expected 2026 customer prepayments and maintenance of 50–60% capex coverage on new deals.
- Execution of the 5 GW contracted-power pipeline and deployment of more than 1 GW annually from 2027.
- Asset-backed and asset-light financing reducing the need for corporate debt and equity dilution.
- Diversification beyond the largest strategic customers and continued premium pricing for short-duration capacity.
- Token Factory/inference and full-stack software increasing utilisation, customer retention and value beyond GPU rental.
- Transparent evidence that Avride and strategic equity stakes create per-share value without distracting capital from the cloud.$pf$,
  risks = $pf$- **Extreme capital intensity:** $5.7B Q2 capex and $20–25B annual guidance create construction, financing, utilisation and obsolescence risk.
- **Dilution:** 12.7M ATM shares were issued in the first half and additional authorised capacity remains; convertibles may add further dilution.
- **Debt and prepayment obligations:** customer cash finances assets but also represents delivery obligations; debt and leases can amplify a utilisation downturn.
- **Customer concentration:** several very large agreements can make one counterparty, renegotiation or deployment delay material.
- **Scarcity pricing:** $20–25M ACV/MW and 50% AI-cloud adjusted EBITDA margin may decline as GPU supply and competing capacity increase.
- **Technology obsolescence:** GPUs and networking equipment can lose economic value faster than accounting depreciation.
- **Execution:** moving from secured power to connected, commissioned, utilised capacity across many jurisdictions is difficult.
- **Accounting quality:** adjusted EBITDA excludes very large depreciation, SBC and financing costs; GAAP loss from continuing operations was $190M in Q2.
- **Competition:** hyperscalers, CoreWeave, Oracle, Crusoe, Lambda and new sovereign/enterprise capacity compete on price, software and availability.
- **Valuation:** current enterprise value already capitalises a large portion of the 2026–2027 scale-up.$pf$,
  invalidation = $pf$## Warning — investigate and freeze additions

- Quarterly ARR growth falls below approximately 25% sequentially before the 2027 capacity ramp is substantially delivered.
- AI-cloud adjusted EBITDA margin falls below 40%, or capex rises without proportional signed ACV/prepayment support.
- Major capacity milestones slip by more than one quarter or connected capacity materially trails guidance.
- Equity dilution exceeds approximately 5% over 12 months without a demonstrable increase in per-share base-case value.
- EV/forward ARR exceeds approximately 12x while ARR guidance and contract economics stop improving.

## Reduce — normally trim 25–50%

- Year-end ARR or revenue guidance is cut by more than 15%.
- AI-cloud adjusted EBITDA margin remains below 30% for two quarters.
- Prepayments cover less than approximately 35% of associated capex on new large agreements, increasing funding dependence.
- A major customer delays, renegotiates or cancels contracted capacity, or customer commitments prove materially less binding than assumed.
- Net debt, convertibles and dilution grow faster than enterprise value created per share.
- Utilisation or pricing for commissioned capacity weakens while competing supply comes online.

## Invalidate — exit unless a documented exception is approved

- Contracted capacity repeatedly fails to convert into connected, revenue-producing infrastructure.
- Large customer losses or renegotiations reduce normalised revenue/EBITDA power by more than 20%.
- The AI-cloud operation becomes adjusted-EBITDA negative after the current ramp or cannot fund maintenance/replacement capex through a cycle.
- Capital markets, customer prepayments or asset-backed finance become unavailable on economic terms, preventing contracted delivery.
- Evidence shows the business is primarily a commodity GPU lessor with no durable software, utilisation or cost advantage.
- Governance, disclosure or accounting concerns make customer commitments, margins, capex economics or per-share dilution unreliable.$pf$,
  competitive_notes = $pf$Nebius competes with AWS, Azure and Google Cloud at the platform level and with CoreWeave, Oracle, Crusoe, Lambda and other specialist capacity providers. Its strengths are speed of deployment, a purpose-built AI software stack, access to current NVIDIA systems, flexible contracts and demonstrated ability to win large customers.

Its disadvantages are smaller scale, weaker diversification, greater financing dependence and less proven enterprise distribution than hyperscalers. The durable moat must come from orchestration software, utilisation, performance per dollar, customer integration and financing efficiency—not merely temporary GPU scarcity. The asset-light model could improve capital efficiency, but it remains early and must be measured separately from owned/colocated economics.$pf$,
  next_diligence = $pf$1. Build a contract register distinguishing binding minimum commitments, up-to frameworks, duration, prepayments, cancellation rights, customer credit and delivery dates.
2. Reconcile $40B+ customer commitments with recognised revenue, remaining performance obligations and contracted MW.
3. Model every financing layer: prepayments, secured debt, convertibles, ATM shares, leases and asset-light partner economics.
4. Track connected MW, commissioned MW, utilised MW, revenue/MW, EBITDA/MW and maintenance/replacement capex by cohort.
5. Calculate fully diluted shares under the remaining ATM and convertible scenarios.
6. Separate group and AI-cloud EBITDA from depreciation, SBC, financing cost and non-core businesses.
7. Compare utilisation, pricing, software capability and balance-sheet risk with CoreWeave and hyperscaler alternatives.
8. Refresh the wide scenario range quarterly; NBIS should remain explicitly capped as a high-beta position.

**Next scheduled review:** Q3 2026 results; monthly monitoring of financing, dilution and capacity announcements.$pf$,
  source = $pf$Primary sources verified through 15 August 2026:

- [Nebius Q2 2026 earnings release filed with the SEC](https://www.sec.gov/Archives/edgar/data/1513845/000110465926094568/tm2622968d1_ex99-1.htm), 12 August 2026.
- [Nebius Q2 2026 shareholder letter](https://assets.nebius.com/assets/a6ecfd85-a6cb-4967-8ef7-9a25bd261f9c/SHLQ226.pdf), 12 August 2026.
- [Nebius Q1 2026 shareholder presentation filed with the SEC](https://www.sec.gov/Archives/edgar/data/1513845/000110465926059872/tm2614392d1_ex99-2.htm), including the 2026 revenue, ARR, margin and capex guidance subsequently reaffirmed in Q2.
- [Nebius investor financials archive](https://nebius.com/financials).
- [Nebius 2025 Form 20-F](https://www.sec.gov/Archives/edgar/data/1513845/000110465926052948/nbis-20251231x20f.htm).
- Market-price input: $277.68 close on 14 August 2026; refresh before a new capital decision.

All 24/60-month scenario assumptions, probabilities and implied values are PowerFund calculations. Company guidance is identified explicitly.$pf$
from public.instruments as i
where d.instrument_id = i.id
  and i.symbol = 'NBIS';

-- Expect exactly five dossier rows to exist before committing.
select i.symbol, d.status, d.updated_at
from public.dossiers d
join public.instruments i on i.id = d.instrument_id
where i.symbol in ('CLS', 'VRT', 'NVT', 'MRCY', 'NBIS')
order by i.symbol;

commit;
