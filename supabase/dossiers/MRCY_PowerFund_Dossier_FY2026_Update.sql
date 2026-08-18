begin;

do $guard$
begin
  if (
    select count(*)
    from public.dossiers d
    join public.instruments i on i.id = d.instrument_id
    where i.symbol = 'MRCY'
  ) <> 1 then
    raise exception 'Expected exactly one existing dossier for MRCY';
  end if;
end
$guard$;

-- MRCY — Mercury Systems
-- Refreshed 18 August 2026 after review of the official Q4 / FY2026
-- earnings release AND earnings presentation.
--
-- Key management framework incorporated below:
-- FY27 revenue approaching $1.1B, adjusted EBITDA approaching $200M,
-- high-teens adjusted EBITDA margin, ~35% FCF conversion.
-- FY28 reference: low-double-digit organic growth, EBITDA margin at the
-- low end of the 20–25% target range, FCF conversion returning toward 50%.
--
-- Valuation scenarios use the $105.00 regular-session close on 18 Aug 2026.
-- Refresh the price before using the valuation section for capital allocation.

update public.dossiers as d
set
  status = 'investigate'::public.dossier_status,

  summary = $pf$**Research status:** Primary-source verified through Q4 and full-year FY2026, including Mercury's 18 August 2026 earnings presentation. **Valuation basis:** $105.00 regular-session close on 18 August 2026; refresh before a new capital decision because the print produced substantial post-close volatility.

Mercury's Q4/FY2026 print materially strengthens the **demand, backlog and medium-term operating-leverage** side of the thesis. Q4 bookings reached a record **$659.6M**, up **93% YoY**, with a **2.28x book-to-bill**. FY2026 bookings reached **$1.546B**, up **49.8%**, with a **1.57x full-year book-to-bill**. Ending backlog reached **$1.945B**, up **38.4%**, including **$996M of 12-month backlog**, up **23.3%**.

The presentation provides a much clearer forward bridge. For FY2027 management expects revenue approaching **$1.1B**, growth approaching double digits, adjusted EBITDA approaching **$200M** / nearly **+30% YoY**, and adjusted EBITDA margin in the **high teens**. FY2027 FCF conversion is expected around **35%**, temporarily below the 50% long-term target because Mercury intends to invest in inventory, automation and factory optimisation to support higher production volumes.

For FY2028, management's initial reference point is **low-double-digit organic revenue growth**, adjusted EBITDA margin around the **low end of the 20–25% target range**, and FCF conversion moving back toward the **50% target**. Importantly, the FY2027/FY2028 outlook incorporates only tailwinds represented by firm bookings and excludes potential incremental upside from additional CPA, effectors, airborne, space and missile-defence demand and excludes any benefit from the Palantir automation initiative.

This substantially reduces uncertainty around demand. The primary remaining question is now **conversion**: can Mercury turn nearly $2B of backlog into sustained ~10%+ organic growth, high-teens/20%+ adjusted EBITDA margins and stronger free cash flow?

At the $105 reference price, valuation remains demanding enough that MRCY should remain an **investigate / smaller-position** name rather than a core PowerFund holding until execution is further proven.$pf$,

  thesis = $pf$## Investment case

Mercury supplies secure, rugged, open-architecture processing, RF/sensor and mission-computing technology for aerospace and defence platforms. Its systems are designed into long-lived defence programmes, creating qualification, integration, security and lifecycle switching costs.

The PowerFund thesis is:

> **MRCY is a defence-electronics turnaround with record multi-year demand: approximately $1.95B of backlog and a 1.57x FY2026 book-to-bill should drive low-double-digit organic growth, while replacement of legacy low-margin backlog, higher production scale and factory automation can lift adjusted EBITDA margins from 15.3% in FY2026 toward 20%+ by FY2028, causing earnings and cash flow to grow substantially faster than revenue.**

The Q4 presentation materially improves confidence in four parts of the thesis:

1. **Demand is broad-based.** Q4 included significant production awards across Common Processing Architecture (CPA), effectors, airborne applications, space and missile defence.

2. **CPA is showing strategic momentum.** Mercury reported its largest-ever quarter for CPA bookings and believes the result reflects differentiation of its CPA solutions.

3. **The defence spending cycle is becoming multi-year.** Management is beginning to see multi-year customer commitments as stronger defence budgets convert into firm production demand.

4. **The margin bridge is explicit.** Management expects backlog-margin expansion as legacy low-margin backlog converts, operational simplification/automation, and positive operating leverage from higher organic growth.

The remaining investment debate is no longer whether Mercury has demand. It is whether the company can convert that demand without repeating its historical programme, supply-chain and manufacturing execution problems.

## Verified operating baseline

### Q4 FY2026

- Bookings: **$659.6M**, up **93% YoY**.
- Book-to-bill: **2.28x**, versus 1.25x in Q4 FY2025.
- Backlog: **$1.945B**, up **38%**.
- 12-month backlog: **$996.0M**, up approximately **23%**.
- Revenue: **$289.8M**, up **6%**.
- Gross margin: **30.6%**, down 40 bps YoY.
- Adjusted EBITDA: **$48.5M**, down **5%**.
- Adjusted EBITDA margin: **16.7%**, versus 18.8%.
- Adjusted EPS: **$0.37**, down **21%**.
- Operating cash flow: **$42.2M**, up **11%**.
- Free cash flow: **$28.6M**, down **16%**.
- FCF / adjusted EBITDA: **58.9%**.

Q4 margin softness means the operating-leverage thesis is **not yet fully proven** even though forward guidance is considerably stronger than the trailing-quarter comparison.

### FY2026

- Bookings: **$1.546B**, up **49.8%**.
- Full-year book-to-bill: **1.57x**, versus 1.13x.
- Revenue: **$983.6M**, up **7.9%**.
- Gross margin: **28.6%**, up 70 bps.
- Adjusted EBITDA: **$150.2M**, up approximately **25.7%**.
- Adjusted EBITDA margin: **15.3%**, up **217 bps**.
- Adjusted EPS: **$1.06**, up **66%**.
- Operating cash flow: **$102.4M**.
- Free cash flow: **$68.1M**.
- FCF / adjusted EBITDA: **45.3%**.

Additional indicators:

- Domestic revenue represented approximately **85.8%** of FY2026 revenue and grew **13.0% organically YoY**.
- Q4 over-time revenue grew **23.6% YoY** to its highest level in 15 quarters, driven largely by improved material availability.
- Net working capital ended around **$431M**, down approximately **$18M / 4% YoY** while revenue grew.
- Cash ended at **$214.3M**.
- Debt ended at **$441.5M**, down $150M sequentially.
- Net debt ended around **$227M**, down approximately **$55M / 19.5% YoY**.
- Inventory ended at **$367.0M**, versus $332.9M a year earlier.
- FY2026 capex was **$34.3M**, versus $19.8M.

### FY2027 management outlook

- Revenue approaching **$1.1B**.
- Revenue growth approaching **double digits**.
- Q1 revenue expected to be the lowest of the year but still up **high single digits YoY**, with revenue increasing through the balance of FY2027.
- Adjusted EBITDA approaching **$200M**, nearly **+30% YoY**.
- Adjusted EBITDA margin in the **high teens** and generally increasing through the year.
- FY2027 FCF conversion expected around **35%**, below the 50% long-term target because of investment in inventory, automation and factory optimisation.
- Q1 expected to be a larger-than-normal cash outflow because Mercury will receive materials needed for the production ramp.

At approximately $200M adjusted EBITDA and 35% FCF conversion, FY2027 FCF would be roughly **$70M**.

### FY2028 reference point

Management's initial FY2028 reference framework is:

- **Low-double-digit organic revenue growth**.
- Adjusted EBITDA margin around the **low end of the 20–25% target profile**.
- FCF conversion returning toward the **50% target**.

If FY2027 revenue reaches approximately $1.1B and FY2028 organic growth is around 10–12%, FY2028 revenue could reach approximately **$1.21–1.23B**. At approximately 20–21% adjusted EBITDA margin, this implies around **$240–260M adjusted EBITDA**, before assuming upside from additional defence-production tailwinds or Palantir-enabled automation.

### KPI ladder

| Fiscal year | Revenue growth | Adjusted EBITDA margin | FCF conversion |
|---|---:|---:|---:|
| FY2026 actual | +7.9% | 15.3% | 45.3% |
| FY2027 outlook | approaching +10% | high teens | ~35% |
| FY2028 reference | low double digits | ~20%+ / low end of target | toward 50% |
| Long-term target | low double digits | 20–25% | 50% |

This ladder is now the primary evidence test for the investment thesis.

## Valuation scenarios

Using the **$105.00 regular-session close on 18 August 2026**:

- Market capitalisation: approximately **$6.24B**.
- Net debt: approximately **$227M**.
- Enterprise value: approximately **$6.47B**.
- EV / FY2026 adjusted EBITDA: approximately **43x**.
- EV / FY2027 management EBITDA outlook of ~$200M: approximately **32x**.
- Trailing FCF yield: approximately **1.1%**.

This remains a premium valuation.

### 24 months

PowerFund scenarios below are anchored to management's FY2027/FY2028 framework but are **PowerFund assumptions, not company guidance**.

| Case | Weight | Core assumptions | Implied value |
|---|---:|---|---:|
| Bear | 25% | FY2028 revenue ~$1.15B; EBITDA ~$210–230M; 18x EV/EBITDA; ~$200M net debt; ~62M shares | ~$60–64 |
| Base | 50% | FY2028 revenue ~$1.22B; EBITDA ~$250–260M; 24x; ~$100M net debt; ~62.5M shares | ~$94–98 |
| Bull | 25% | FY2028 revenue ~$1.30B+; EBITDA ~$310–320M; 28x; approximately zero net debt; ~63M shares | ~$138–142 |

Probability-weighted working value at the $105 valuation basis remains around **$100**.

The stronger Q4 print raises confidence in the operating pathway but does not make the $105 reference price obviously cheap. The risk/reward improves materially if post-print weakness produces a lower entry price without deterioration in the FY2027/FY2028 operating framework.

### 60 months

| Case | Weight | Core assumptions | Implied value |
|---|---:|---|---:|
| Bear | 20% | Organic growth falls to mid single digits; margins stall below 18%; defence cycle normalises | ~$55–75 |
| Base | 55% | Low-double-digit revenue CAGR persists; EBITDA margin reaches ~22%; FCF conversion ~50% | ~$140–175 |
| Bull | 25% | Strong defence cycle, CPA/mission-compute share gains and automation drive ~25% margin and faster revenue growth | ~$220–300+ |

The five-year thesis is more attractive than the two-year valuation setup because upside comes from **revenue compounding plus margin expansion**, not simply a higher valuation multiple.$pf$,

  catalysts = $pf$- Conversion of approximately **$996M of 12-month backlog** into revenue without material programme charges, schedule slippage or working-capital deterioration.

- FY2027 revenue approaching **$1.1B** and adjusted EBITDA approaching **$200M**.

- FY2027 adjusted EBITDA margin reaching the **high teens** and generally increasing through the year.

- FY2028 adjusted EBITDA margin moving toward **20%+**, consistent with the low end of the company's long-term 20–25% target range.

- FY2028 FCF conversion returning toward the **50% target** after the planned FY2027 inventory/factory-investment cycle.

- Book-to-bill remaining above **1.0** after FY2026's exceptional **1.57x**.

- Continued strong CPA awards after Mercury's largest-ever CPA bookings quarter.

- Additional multi-year commitments across effectors, airborne applications, space, munitions and missile defence.

- Additional defence-budget tailwinds that are **not included** in management's current FY2027/FY2028 reference framework.

- Palantir-enabled planning and factory automation producing measurable improvements in backlog conversion, inventory turns, lead times, throughput and margins; management currently assumes **no benefit** from this initiative in its FY2027/FY2028 reference outlook.

- Further debt reduction as production and cash conversion improve.$pf$,

  risks = $pf$- **Execution remains the central risk.** Mercury has historically struggled to convert programme demand into clean revenue, margins and free cash flow.

- **Q4 margin evidence was mixed.** Revenue rose 6%, but adjusted EBITDA declined 5% and adjusted EBITDA margin fell to 16.7% from 18.8%.

- **FY2027 FCF will remain suppressed by design.** Management expects only approximately 35% conversion because inventory and factory investment are required for the production ramp; full cash-flow proof is therefore delayed until FY2028.

- **Inventory risk.** Inventory is already $367M and is expected to receive further investment. Failure to convert those materials into revenue would weaken both the cash-flow and execution thesis.

- **Fixed-price/programme execution:** cost overruns, schedule delays, quality problems, reach-forward/EAC losses and supply-chain failures can erode the expected backlog-margin improvement.

- **Booking lumpiness:** the 2.28x Q4 book-to-bill should not be extrapolated mechanically even though the 1.57x full-year figure is also very strong.

- **Customer and prime-contractor bargaining power:** customers can dual-source, insource systems, change architecture or pressure programme economics.

- **Valuation:** at the $105 reference price, enterprise value is approximately 32x management's FY2027 adjusted EBITDA outlook of ~$200M.

- **Adjusted-earnings quality:** FY2026 stock-based and other non-cash compensation expense increased to approximately $57.1M from $38.3M.

- **Dilution:** FY2026 diluted weighted-average shares rose to approximately 60.7M from 59.2M.

- **Defence-budget/procurement timing:** long-term spending is supportive, but continuing resolutions, shutdowns, procurement changes or programme delays can shift award timing.$pf$,

  invalidation = $pf$## Warning — investigate and freeze additions

- FY2027 organic revenue growth runs materially below **high single digits** despite approximately $996M of 12-month backlog.

- Adjusted EBITDA margin fails to progress into the **high teens** during FY2027.

- Two-quarter trailing book-to-bill falls below **1.0**, or backlog begins declining materially despite healthy defence demand.

- Inventory rises sharply without corresponding backlog conversion and revenue acceleration.

- New programme/EAC charges indicate that the record backlog has structurally poor economics.

- FCF weakness materially exceeds management's planned FY2027 investment cycle without a clear working-capital explanation.

- Valuation exceeds approximately **30x credible two-year adjusted EBITDA** while FY2027/FY2028 earnings expectations stop improving.

## Reduce — normally trim 25–50%

- FY2027 revenue growth falls below approximately **5–7%**.

- Adjusted EBITDA margin remains below approximately **16% through the second half of FY2027**.

- Backlog declines more than approximately **10% from the $1.945B peak** without a temporary timing explanation.

- Book-to-bill remains below **1.0 for two consecutive quarters**.

- A major programme delay, cancellation or adverse EAC change reduces expected normalised EBITDA power by approximately **10–20%**.

- Net debt begins rising materially because production growth consumes structurally excessive working capital.

- Adjusted earnings increasingly diverge from GAAP/per-share economics because of persistent stock compensation, restructuring, litigation or programme adjustments.

## Invalidate — exit unless explicitly re-underwritten

> **Invalidate if the record backlog fails to translate into approximately 10% organic growth and high-teens adjusted EBITDA margins during FY2027, or if Mercury cannot demonstrate a credible path toward approximately 20%+ adjusted EBITDA margins and ~50% FCF conversion in FY2028 — evidence that programme-execution problems or poor backlog economics are structural rather than temporary.**

Additional hard invalidators:

- A structural customer or programme loss reduces normalised EBITDA power by more than **20%**.

- Recurring programme losses and execution problems return despite healthy aerospace and defence demand.

- Debt/covenant/liquidity pressure constrains investment or forces dilutive capital raising.

- Evidence shows Mercury's modular/open processing architecture is being structurally displaced or materially insourced by primes or government customers.$pf$,

  competitive_notes = $pf$Mercury competes with specialist embedded-compute and defence-electronics suppliers, vertically integrated capabilities inside major defence primes, and customer insourcing.

Its differentiation is based on:

- qualification into long-lived aerospace and defence programmes;
- secure/trusted domestic manufacturing;
- ruggedisation and mission-critical reliability;
- open/modular architectures that allow advanced commercial compute technology to be deployed in defence environments;
- integration expertise across processing, RF, sensors and mission systems; and
- meaningful switching/requalification costs once systems are designed into a programme.

The FY2026 record bookings and $1.945B backlog are strong evidence that Mercury is currently winning production demand. The company's largest-ever CPA bookings quarter is particularly encouraging for its position in secure common processing.

The moat is nevertheless not a monopoly. Large primes retain substantial bargaining power, alternative suppliers exist, and architecture can be insourced. The correct evidence bar remains **backlog conversion, improving backlog margin, high-teens/20%+ adjusted EBITDA margins and free-cash-flow conversion**.$pf$,

  next_diligence = $pf$1. Track FY2027 quarterly performance against the explicit management ladder: revenue growth approaching 10%, high-teens adjusted EBITDA margin, approximately $200M adjusted EBITDA and approximately 35% FCF conversion.

2. Reconcile the **$996M of 12-month backlog** to FY2027 revenue and determine how much incremental FY2027 revenue requires new bookings.

3. Decompose Q4/FY2026 bookings across CPA, effectors, airborne, space, missile defence and memory procurement; distinguish true platform demand from working-capital/material-procurement commitments.

4. Determine the margin profile of new bookings versus legacy backlog and verify that average backlog gross margin improves as management expects.

5. Track Q1 FY2027 inventory/cash outflow against management's planned material purchases and verify that the working-capital investment converts into higher H2 revenue and cash generation.

6. Monitor programme/EAC charges and legacy development contracts for recurring execution issues.

7. Measure whether Palantir-enabled factory automation improves inventory turns, lead times, throughput, backlog conversion and adjusted EBITDA margin; management currently assumes no FY2027/FY2028 benefit.

8. Monitor stock-based compensation and diluted share growth alongside adjusted EBITDA and FCF.

9. Compare normalised FY2028 EV/EBITDA, FCF yield and organic growth with Curtiss-Wright, Teledyne and other defence-electronics peers.

10. Re-underwrite after Q1 FY2027 rather than waiting for FY2027 year-end.

**Next scheduled full review:** Q1 FY2027 results.$pf$,

  source = $pf$Primary sources verified through 18 August 2026:

- [Mercury Systems Q4/FY2026 results release](https://ir.mrcy.com/news-releases/news-release-details/mercury-systems-reports-fourth-quarter-and-fiscal-2026-results), 18 August 2026.
- [Mercury Systems Q4/FY2026 earnings presentation](https://ir.mrcy.com/static-files/068bd2bc-6db4-4136-9dcd-df80ada48e1c), 18 August 2026. Key pages: 4–10 outlook; 11–14 results and cash flow; 16–18 non-GAAP reconciliations.
- [Mercury Systems quarterly-results archive](https://ir.mrcy.com/financial-information/quarterly-results).
- [Mercury Systems Q3 FY2026 earnings release](https://ir.mrcy.com/news-releases/news-release-details/mercury-systems-reports-third-quarter-fiscal-2026-results), 5 May 2026.
- [Mercury Systems Q3 FY2026 earnings presentation](https://ir.mrcy.com/static-files/607f2864-b222-48a1-95c9-3c7da7cdf169), 5 May 2026.
- [Mercury FY2026 reporting-date announcement](https://ir.mrcy.com/news-releases/news-release-details/mercury-systems-report-fourth-quarter-and-full-year-fiscal-0), 28 July 2026.

Valuation reference: **$105.00 regular-session close on 18 August 2026**. Refresh price before capital allocation.

All 24/60-month scenario assumptions, probabilities, implied values and interpretive conclusions are **PowerFund estimates**, not company guidance.$pf$

from public.instruments as i
where d.instrument_id = i.id
  and i.symbol = 'MRCY';

select
  i.symbol,
  d.status,
  d.updated_at
from public.dossiers d
join public.instruments i on i.id = d.instrument_id
where i.symbol = 'MRCY';

commit;
