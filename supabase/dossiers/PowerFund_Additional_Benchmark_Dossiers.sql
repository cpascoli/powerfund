-- PowerFund benchmark dossiers — additional candidates
-- Research as of 2026-08-15
-- Assumes public.instruments has a unique symbol column.
-- Review scenario assumptions and refresh market-price inputs before running.

begin;

do $guard$
begin
  if (select count(*)
      from public.dossiers d
      join public.instruments i on i.id = d.instrument_id
      where i.symbol in ('SNDK', 'CEG', 'VST', 'RTX', 'NOC', 'GD', 'PWR', 'EME')) <> 8 then
    raise exception 'Expected one existing dossier for each of SNDK, CEG, VST, RTX, NOC, GD, PWR, EME';
  end if;
end
$guard$;

-- SNDK — Sandisk
update public.dossiers as d
set
  status = 'investigate'::public.dossier_status,
  summary = $pf$**Research status:** Primary-source verified through preliminary fiscal Q4 2026 results and the August 2026 investor update. **Valuation basis:** $1,641.11 closing price on 14 August 2026.

Sandisk is the highest-upside and highest-timing-risk name in this group. Fiscal Q4 revenue rose 51% sequentially to $8.97B, Q4 non-GAAP EPS reached $39.25, fiscal-year adjusted free cash flow was $8.74B, and management guided fiscal Q1 2027 revenue to $10.30–10.80B with non-GAAP EPS of $44–46. Datacenter revenue grew 437% in fiscal 2026, and new multiyear customer agreements may make flash economics less transactional. However, Q4 gross margin of 84.6%, extreme price-led growth and a share price that has multiplied many times in eighteen months are not normal-cycle conditions. This is an AI-memory sleeve candidate, not a diversifier. Do not chase; require a small initial weight, explicit cycle indicators and acceptance of a possible 40–55% drawdown.$pf$,
  thesis = $pf$## Investment case

Sandisk is a leading NAND flash supplier with vertically integrated technology, manufacturing partnerships and products spanning datacenter, edge and consumer storage. AI inference, training checkpoints and rapidly expanding data lakes are increasing demand for high-capacity enterprise flash. Management is shifting customer relationships toward multiyear New Business Model agreements that include prepayments, deposits and supply commitments, potentially reducing the amplitude of the traditional spot-memory cycle.

The variant perception is that high-value datacenter demand, disciplined industry supply and longer contracts can sustain structurally higher margins and cash generation than prior NAND cycles. The opposing case is powerful: two-thirds of Q4 sequential revenue growth came from pricing, gross margin reached an exceptional 84.6%, and customers may double-order when supply is scarce. A future supply response, technology transition or demand pause could collapse both earnings and the valuation multiple.

## Verified operating baseline

- Fiscal Q4 2026 revenue: **$8.97B**, up **51% sequentially**; approximately one-third of the increase came from volume and two-thirds from pricing.
- Q4 GAAP net income: **$6.90B**, or **$43.97 per diluted share**; non-GAAP diluted EPS: **$39.25**.
- Fiscal 2026 revenue: **$20.25B**, up **175%**; GAAP EPS was **$73.76** and non-GAAP EPS **$70.88**.
- Q4 datacenter revenue: **$2.98B**, up **103% sequentially**; fiscal-year datacenter revenue rose **437%** to **$5.15B**.
- Q4 gross margin: **84.6%**; fiscal-year gross margin: approximately **71.5%**.
- Fiscal-year free cash flow: **$11.49B**; adjusted free cash flow was **$8.74B** after adjusting for Flash Ventures and NBM payments.
- Cash and cash equivalents at 3 July 2026: **$4.76B**.
- Fiscal Q1 2027 outlook: **$10.30–10.80B revenue**, **83–85% non-GAAP gross margin**, and **$44–46 non-GAAP EPS**.
- Remaining repurchase authorization: approximately **$15.5B** after the board approved an additional $14B programme.
- Fiscal Q4 and fiscal-year results were preliminary pending completion and filing of the fiscal 2026 Form 10-K.

## Valuation scenarios

PowerFund scenarios based on $1,641.11 on 14 August 2026. Earnings are deliberately normalized below peak quarterly run rates in the bear and base cases. Dividends are excluded.

### 24 months

| Case | Weight | Core assumptions | Implied value | Return / CAGR |
|---|---:|---|---:|---:|
| Bear | 35% | $50 normalized EPS; 15x P/E; NAND pricing and margins mean-revert sharply | $750 | -54.3% / -32.4% |
| Base | 45% | $120 normalized EPS; 18x P/E; contracts cushion a cyclical normalization | $2,160 | +31.6% / +14.7% |
| Bull | 20% | $190 normalized EPS; 22x P/E; AI storage demand and disciplined supply sustain extraordinary economics | $4,180 | +154.7% / +59.6% |

Probability-weighted working value: approximately **$2,071**, or **12.3% annualised**. The unusually high bear weight reflects cycle and entry-price uncertainty.

### 60 months

| Case | Weight | Core assumptions | Implied value | Return / CAGR |
|---|---:|---|---:|---:|
| Bear | 35% | $70 normalized EPS; 14x P/E; contracts do not prevent a conventional oversupply cycle | $980 | -40.3% / -9.8% |
| Base | 45% | $155 normalized EPS; 18x P/E; datacenter mix and NBM agreements lift through-cycle earnings | $2,790 | +70.0% / +11.2% |
| Bull | 20% | $250 normalized EPS; 22x P/E; flash content and pricing remain structurally stronger | $5,500 | +235.1% / +27.4% |

Probability-weighted working value: approximately **$2,699**, or **10.5% annualised**.$pf$,
  catalysts = $pf$- Conversion of NBM agreements into visible revenue, cash receipts and lower earnings volatility without onerous pricing concessions.
- Fiscal Q1 2027 delivery near the $10.55B revenue and $45 non-GAAP EPS midpoints.
- Datacenter revenue and enterprise SSD shipments outgrowing edge revenue while customer concentration remains manageable.
- Sustained industry capital discipline and delayed supply additions relative to AI-driven bit demand.
- QLC Stargate and subsequent node transitions reaching qualification, yield and cost targets.
- Repurchases completed below conservative through-cycle value rather than during a valuation spike.
- The fiscal 2026 Form 10-K confirming preliminary earnings, cash flow and internal-control quality.$pf$,
  risks = $pf$- **Memory cyclicality:** pricing, inventory and gross margin can reverse much faster than reported revenue trends.
- **Peak economics:** an 84.6% gross margin and price-led sequential growth invite supply additions and customer resistance.
- **AI concentration:** datacenter demand is tied to hyperscaler capital expenditure and storage architecture choices.
- **Customer and contract risk:** multiyear agreements may concentrate counterparties, include price resets or shift working-capital obligations.
- **Manufacturing dependency:** Flash Ventures, Japanese fabrication capacity, yields and technology transitions are critical.
- **Competition:** Samsung, SK hynix/Solidigm, Micron and Kioxia can alter supply, pricing and product leadership.
- **Valuation and momentum:** a spectacular share-price rise can unwind even if near-term estimates remain strong.
- **Reporting maturity:** Sandisk is newly independent, and fiscal 2026 year-end figures were preliminary at the research date.
- **Capital allocation:** a $15.5B authorization can destroy value if exercised into peak-cycle enthusiasm.$pf$,
  invalidation = $pf$## Warning — investigate and freeze additions

- NAND contract or spot pricing declines by more than **10% sequentially**, or customer inventory days rise materially.
- Datacenter revenue growth falls below **20%** while industry supply growth accelerates.
- Gross-margin guidance falls below **70%**, even if absolute earnings remain elevated.
- NBM coverage increases without transparent volume, price-reset, deposit and termination terms.
- Forward valuation exceeds **20x a conservative through-cycle EPS estimate**, rather than peak annualized earnings.

## Reduce — normally trim 25–50%

- Revenue declines sequentially for two quarters or management misses guidance by more than **10%**.
- Gross margin remains below **60%** for two quarters, signalling a material change in price/cost economics.
- Datacenter revenue contracts, a major qualification is lost, or one customer materially reduces committed volumes.
- Inventory rises above **120 days** or cash conversion deteriorates despite reported profits.
- Announced industry wafer-capacity growth materially exceeds credible demand growth for the following 12–24 months.

## Invalidate — exit unless a documented exception is approved

- NBM contracts fail to reduce cyclicality and instead create material pricing, refund or counterparty losses.
- Sandisk loses technology competitiveness for two consecutive NAND generations or enterprise SSD qualifications at multiple major customers.
- Through-cycle gross margin and free-cash-flow power revert to levels that cannot support at least **$70 normalized EPS** within five years.
- A material accounting, internal-control, tax-separation or Flash Ventures dispute makes reported economics unreliable.
- Management uses peak-cycle cash predominantly for value-destructive repurchases or acquisitions.$pf$,
  competitive_notes = $pf$NAND is an oligopoly, but it is not a stable consumer franchise. Sandisk's advantages are controller and firmware expertise, BiCS technology, long customer relationships, enterprise qualifications and its Flash Ventures manufacturing partnership with Kioxia. NBM contracts can add switching costs and capacity visibility.

The same concentrated structure can amplify cycles: each supplier has an incentive to add bits when returns are exceptional. Samsung, SK hynix/Solidigm, Micron and Kioxia possess scale and technology depth. The moat must be assessed through cost per bit, yields, qualification share, contract durability and through-cycle cash—not current gross margin alone.$pf$,
  next_diligence = $pf$1. Reconcile the ten announced NBM agreements to customers, duration, capacity coverage, deposits, pricing resets and cancellation rights.
2. Build a quarterly NAND cycle dashboard covering contract/spot pricing, supplier bit growth, capex, utilization and customer inventory.
3. Separate datacenter volume growth from price and mix; track enterprise SSD qualifications and revenue per exabyte.
4. Reconcile reported free cash flow to Flash Ventures flows and NBM prepayments/deposits.
5. Review the fiscal 2026 Form 10-K when filed, with specific attention to controls, customer concentration and year-end adjustments.
6. Refresh scenarios using conservative through-cycle EPS; never annualize a peak quarter mechanically.

**Next scheduled review:** fiscal Q1 2027 results and the fiscal 2026 Form 10-K; earlier following material NAND pricing or capacity announcements.$pf$,
  source = $pf$Primary sources verified through 15 August 2026:

- [Sandisk fiscal Q4 and fiscal-year 2026 earnings release](https://investor.sandisk.com/news-releases/news-release-details/sandisk-reports-fiscal-fourth-quarter-2026-financial-results), 5 August 2026.
- [Sandisk fiscal Q4 2026 earnings presentation](https://investor.sandisk.com/static-files/c75d1bee-c5c9-4e5a-8605-302c1aeac59b), including end-market, product and outlook information.
- [Sandisk fiscal Q3 2026 Form 10-Q](https://investor.sandisk.com/static-files/21ecbf29-74ac-4abd-9563-2afd618ddbba), including manufacturing, customer, separation and risk disclosures.
- [Sandisk 2025 Form 10-K](https://www.sec.gov/Archives/edgar/data/2023554/000202355425000034/sndk-20250627.htm), including NAND competition, Flash Ventures and cyclicality risks.
- Market-price input: $1,641.11 close on 14 August 2026; refresh all scenario returns before a new capital decision.

All 24/60-month scenario assumptions, probabilities and implied values are PowerFund calculations, not company guidance or analyst consensus.$pf$
from public.instruments as i
where d.instrument_id = i.id
  and i.symbol = 'SNDK';

-- CEG — Constellation Energy
update public.dossiers as d
set
  status = 'investigate'::public.dossier_status,
  summary = $pf$**Research status:** Primary-source verified through Q2 2026. **Valuation basis:** $282.50 closing price on 14 August 2026.

Constellation combines the largest U.S. nuclear operating platform with the broader gas, geothermal and retail portfolio acquired through Calpine. Q2 adjusted operating EPS rose to $2.55, management raised 2026 adjusted EPS guidance to $11.50–12.50, Crane cleared important FERC and NRC milestones, and an additional 920 MW of 15–20-year nuclear PPAs was signed. This is a high-quality power-scarcity beneficiary, but not a clean diversifier from PowerFund's AI-capex thesis: large-load contracting and power prices are part of the same causal chain. At roughly 23.5x midpoint 2026 adjusted EPS, a starter position is defensible only with integration, leverage and nuclear-operation discipline.$pf$,
  thesis = $pf$## Investment case

Constellation owns a difficult-to-replicate fleet of nuclear plants and, following Calpine, a large portfolio of dispatchable gas generation, geothermal assets and customer-facing retail operations. Existing nuclear sites have scarce interconnections, permits, trained workforces and long useful lives. Rising electricity demand, retirements of older generation and the need for 24/7 reliable power increase the value of these assets.

The variant perception is that long-term corporate PPAs, nuclear life extensions, Crane's restart and Calpine synergies can convert volatile merchant exposure into durable per-share cash growth. The opposing case is that the acquisition increases leverage and operational complexity while regulators and politicians may limit the monetization of power scarcity. Nuclear outages, project delays and commodity hedging can create large deviations between thesis and reported GAAP earnings.

## Verified operating baseline

- Q2 2026 GAAP net income attributable to common shareholders: **$513M**, or **$1.42 per share**.
- Q2 adjusted operating earnings: **$920M**, or **$2.55 per share**, versus $1.91 a year earlier.
- Q2 operating revenue: **$7.50B**; first-half operating revenue: **$18.63B**, reflecting the Calpine combination.
- 2026 adjusted operating EPS guidance increased to **$11.50–12.50**.
- Nuclear output in Q2 was **44,160 GWh**; owned nuclear capacity factor excluding Salem and South Texas Project was **93.0%**, versus 94.8% a year earlier.
- The gas, oil and pumped-storage fleet's Q2 equivalent forced-outage factor was **6.2%**.
- FERC approved transfer of capacity interconnection rights to Crane, and the NRC approved a fuel-license amendment supporting the planned **2027 restart**.
- Constellation signed an additional **920 MW** of nuclear PPAs lasting **15–20 years** with investment-grade customers.
- The company agreed to sell Brazos Valley Energy Center for **$860M**, completing a required Calpine-related divestiture step.

## Valuation scenarios

PowerFund scenarios based on $282.50 on 14 August 2026. EPS is adjusted/normalized; dividends are excluded.

### 24 months

| Case | Weight | Core assumptions | Implied value | Return / CAGR |
|---|---:|---|---:|---:|
| Bear | 25% | $11 EPS; 18x P/E; integration, outages and regulation offset stronger power markets | $198 | -29.9% / -16.3% |
| Base | 50% | $15 EPS; 24x P/E; Calpine synergies and contracted nuclear growth progress | $360 | +27.4% / +12.9% |
| Bull | 25% | $20 EPS; 28x P/E; Crane, PPAs and market pricing exceed expectations | $560 | +98.2% / +40.8% |

Probability-weighted working value: approximately **$370**, or **14.4% annualised**.

### 60 months

| Case | Weight | Core assumptions | Implied value | Return / CAGR |
|---|---:|---|---:|---:|
| Bear | 25% | $13 EPS; 16x P/E; political intervention and normalized power prices cap returns | $208 | -26.4% / -5.9% |
| Base | 50% | $25 EPS; 22x P/E; contracted generation, synergies and buybacks compound per share | $550 | +94.7% / +14.3% |
| Bull | 25% | $38 EPS; 26x P/E; scarce reliable power earns sustained premiums and projects deliver | $988 | +249.7% / +28.5% |

Probability-weighted working value: approximately **$574**, or **15.2% annualised**.$pf$,
  catalysts = $pf$- Calpine integration achieving operating, commercial and financing synergies without degrading reliability.
- Crane restarting in 2027 on budget and beginning delivery under its long-term agreement.
- Additional 15–20-year nuclear or portfolio PPAs with creditworthy customers at attractive risk-adjusted spreads.
- Nuclear capacity factors returning above **94%** with fewer non-refuelling outage days.
- License extensions, uprates and interconnection reuse increasing output from existing sites.
- Asset-sale proceeds, free cash flow and repurchases reducing leverage and share count.
- Higher forward capacity and power prices being captured through disciplined hedging rather than speculative exposure.$pf$,
  risks = $pf$- **Nuclear operations:** unplanned outages, safety events, NRC action and long-duration maintenance can remove high-margin output.
- **Calpine integration:** the transaction increases debt, commodity exposure, asset diversity and execution complexity.
- **Regulatory and political intervention:** rate caps, market redesign, co-location rules or windfall measures could reduce scarcity economics.
- **Commodity and hedge risk:** realized results can differ materially from market curves and GAAP derivative marks.
- **Project risk:** Crane restart, uprates and life extensions can be delayed or exceed budget.
- **Customer concentration:** large-load PPAs may concentrate credit, delivery and reputational exposure.
- **Environmental liabilities:** nuclear decommissioning, spent fuel, gas emissions and legacy sites require long-duration capital.
- **Factor concentration:** CEG increases PowerFund exposure to AI-related electricity demand rather than offsetting it.$pf$,
  invalidation = $pf$## Warning — investigate and freeze additions

- Owned nuclear capacity factor falls below **91%** for two quarters outside planned refuelling schedules.
- Calpine synergy or 2026/2027 adjusted EPS expectations fall by more than **10%**.
- Net leverage does not decline on the planned path after required divestitures and integration spending.
- Crane's expected restart slips beyond **2028** or remaining cost rises materially.
- Forward valuation exceeds approximately **27x normalized EPS** without equivalent growth in contracted cash flow.

## Reduce — normally trim 25–50%

- Adjusted EPS guidance is reduced by more than **15%**, excluding a clearly reversible mark-to-market item.
- A material nuclear unit experiences a multi-quarter unplanned outage or adverse NRC status.
- Calpine integration produces recurring availability, control or liquidity problems.
- Political or market-rule changes impair the economics of multiple existing plants or major PPAs.
- Counterparty, collateral or hedge requirements consume materially more liquidity than forecast.

## Invalidate — exit unless a documented exception is approved

- A serious nuclear safety or regulatory event permanently impairs a major site or the fleet's operating licence.
- Constellation cannot maintain investment-grade credit while funding integration and growth commitments.
- Long-term contracts fail to earn an acceptable return after fuel, capacity, collateral and operating risk.
- Structural market reform prevents the fleet from monetizing reliable generation across its principal regions.
- Accounting, controls or commodity-risk evidence makes adjusted earnings an unreliable measure of cash economics.$pf$,
  competitive_notes = $pf$Constellation's moat is physical and regulatory: nuclear licences, scarce interconnections, operating expertise, customer origination and a large dispatchable fleet cannot be recreated quickly. Calpine adds geographic and fuel diversity plus retail and commercial capabilities.

Competitors include Vistra, NRG, Talen, regulated utilities and new renewable/storage developers. Buyers of large blocks of power retain negotiating leverage, and governments ultimately design the markets. Competitive advantage must be measured through availability, realized margin, contract quality and return on invested capital—not generation megawatts alone.$pf$,
  next_diligence = $pf$1. Build a pro-forma Calpine bridge covering debt, synergies, maintenance capital, tax attributes and per-share accretion.
2. Track each nuclear site's capacity factor, outage days, NRC status, licence life and major capital programme.
3. Catalogue PPAs by counterparty, MW, term, start date, escalation, delivery obligation and credit support.
4. Model merchant exposure and hedge coverage by region and year; distinguish GAAP marks from realized cash economics.
5. Maintain a Crane restart budget, milestone and contingency schedule.
6. Treat CEG as an AI-power factor holding in portfolio stress tests, not as a full diversifier.

**Next scheduled review:** Q3 2026 results; earlier following a Crane, NRC, Calpine or major market-rule update.$pf$,
  source = $pf$Primary sources verified through 15 August 2026:

- [Constellation Q2 2026 earnings release and financial tables](https://investors.constellationenergy.com/static-files/980078c9-ab31-49ce-8498-8044c0794cd7), 6 August 2026.
- [Constellation Q2 2026 Form 10-Q filing directory](https://www.sec.gov/Archives/edgar/data/1868275/000186827526000104/), including Calpine, debt, commodity and nuclear disclosures.
- [Constellation investor relations earnings archive](https://investors.constellationenergy.com/taxonomy/term/3896/).
- Market-price input: $282.50 close on 14 August 2026; refresh all scenario returns before a new capital decision.

All 24/60-month scenario assumptions, probabilities and implied values are PowerFund calculations, not company guidance or analyst consensus.$pf$
from public.instruments as i
where d.instrument_id = i.id
  and i.symbol = 'CEG';

-- VST — Vistra
update public.dossiers as d
set
  status = 'investigate'::public.dossier_status,
  summary = $pf$**Research status:** Primary-source verified through Q2 2026. **Valuation basis:** $148.13 closing price on 14 August 2026.

Vistra offers a lower-multiple route to U.S. power scarcity through an integrated retail and generation portfolio. Q2 ongoing adjusted EBITDA grew 31% to $1.77B, 2026 adjusted EBITDA guidance remained $6.8–7.6B, adjusted free cash flow before growth guidance remained $3.93–4.73B, and 2026/2027 expected generation was approximately 100%/94% hedged. Repurchases have reduced shares by roughly 30% since November 2021. The opportunity is attractive, but leverage, acquisitions, commodity accounting and capital intensity make VST riskier than CEG operationally. It is also an AI-power exposure, not a true factor diversifier. A starter position should be conditioned on leverage and acquisition discipline.$pf$,
  thesis = $pf$## Investment case

Vistra combines retail electricity customers with a diversified fleet of nuclear, natural-gas, coal, solar and storage assets. Retail load provides a natural hedge for generation, while the fleet can benefit from tighter reserve margins, capacity-price increases and rising demand. Hedging converts part of future market value into visible cash, and repurchases can compound per-share value when undertaken below conservative estimates.

The variant perception is that the integrated model, nuclear assets, gas flexibility and disciplined hedging can produce durable free cash flow rather than purely merchant volatility. The counterpoint is that headline EBITDA depends on non-GAAP adjustments, acquisitions add debt and integration risk, and political or market intervention can redistribute scarcity rents away from generators.

## Verified operating baseline

- Q2 2026 net income: **$305M**, including a **$472M unrealized hedge loss** expected to settle in future years.
- Q2 ongoing-operations adjusted EBITDA: **$1.77B**, up **31%** year over year.
- First-half ongoing adjusted EBITDA: **$3.26B**, versus $2.59B a year earlier.
- 2026 guidance: **$6.8–7.6B ongoing adjusted EBITDA** and **$3.925–4.725B adjusted free cash flow before growth**.
- Management's previously announced 2027 EBITDA midpoint opportunity was **$7.4–7.8B**, excluding Cogentrix and Meta PPAs.
- Expected generation hedged as of 3 August: approximately **100% for 2026**, **94% for 2027** and **72% for 2028**.
- Shares outstanding: approximately **336M**, about **30% below** November 2021; approximately $1.2B of repurchase authorization remained.
- Q2 liquidity: approximately **$6.30B**, including $435M cash and substantial revolving-facility availability.
- The pending Cogentrix acquisition and initial Meta PPA contributions were excluded from current guidance.

## Valuation scenarios

PowerFund scenarios based on $148.13 on 14 August 2026. Values use normalized adjusted free cash flow per share; dividends are excluded.

### 24 months

| Case | Weight | Core assumptions | Implied value | Return / CAGR |
|---|---:|---|---:|---:|
| Bear | 25% | $10 FCF/share; 10x; weaker power markets and acquisition leverage | $100 | -32.5% / -17.8% |
| Base | 50% | $15 FCF/share; 14x; hedges, fleet execution and buybacks compound | $210 | +41.8% / +19.1% |
| Bull | 25% | $20 FCF/share; 16x; scarcity pricing, PPAs and acquisitions outperform | $320 | +116.0% / +47.0% |

Probability-weighted working value: approximately **$210**, or **19.1% annualised**.

### 60 months

| Case | Weight | Core assumptions | Implied value | Return / CAGR |
|---|---:|---|---:|---:|
| Bear | 25% | $11 FCF/share; 9x; power normalization and leverage constrain capital returns | $99 | -33.2% / -7.7% |
| Base | 50% | $23 FCF/share; 13x; per-share cash compounds through hedging and repurchases | $299 | +101.8% / +15.1% |
| Bull | 25% | $35 FCF/share; 15x; structural load growth supports high fleet margins | $525 | +254.4% / +28.8% |

Probability-weighted working value: approximately **$306**, or **15.6% annualised**.$pf$,
  catalysts = $pf$- 2026 adjusted EBITDA and free-cash-flow delivery near or above the midpoints.
- High fleet availability through summer and winter peaks, especially at Comanche Peak and gas assets.
- Cogentrix closing with financing and integration economics consistent with announced returns.
- Meta and other large-load PPAs beginning to contribute without excessive customer concentration.
- Repurchases completed below conservative per-share value while leverage remains controlled.
- Forward hedges locking attractive 2028–2030 economics as load and capacity markets tighten.
- Credit-rating improvement lowering financing and collateral costs.$pf$,
  risks = $pf$- **Leverage and acquisition risk:** Lotus, Cogentrix and other investments can weaken the balance sheet or dilute returns.
- **Commodity exposure:** realized power, gas, capacity and hedge results can move sharply.
- **Non-GAAP complexity:** EBITDA and FCFbG exclude items that can still consume shareholder cash.
- **Operational risk:** outages, weather, fuel supply and plant-performance problems reduce generation at the most valuable times.
- **Retail risk:** weather, customer churn, bad debt and load-shape mismatch can impair the natural hedge.
- **Regulation:** market redesign, rate intervention, emissions policy or co-location rules can change asset economics.
- **Coal and environmental liabilities:** remediation, closure and emissions obligations remain material.
- **Factor concentration:** VST increases portfolio dependence on the same electricity-demand narrative as data-centre holdings.$pf$,
  invalidation = $pf$## Warning — investigate and freeze additions

- 2026/2027 adjusted EBITDA opportunity falls more than **10%** without a corresponding reduction in share price.
- Hedge coverage declines without a documented risk budget, or collateral requirements materially reduce liquidity.
- Net leverage rises above management's stated target range after acquisition closing.
- Fleet availability underperforms peers through two peak seasons.
- Forward valuation exceeds **15x normalized FCF/share** while acquisitions still require substantial capital.

## Reduce — normally trim 25–50%

- Adjusted free cash flow before growth misses guidance by more than **15%** for non-timing reasons.
- Cogentrix or another acquisition requires materially more debt/equity or delivers lower returns than underwritten.
- A major nuclear or gas asset suffers a multi-quarter outage or permanent derating.
- Retail and generation cease to offset each other through normal weather and price volatility.
- Management prioritizes acquisitions over deleveraging and repurchases despite an unattractive cost of capital.

## Invalidate — exit unless a documented exception is approved

- Vistra cannot maintain adequate liquidity or investment-grade credit through a normal commodity downturn.
- Structural market or political changes remove acceptable returns from multiple core plants.
- Repeated hedge, collateral or accounting failures show that reported adjusted EBITDA is not a reliable cash proxy.
- Material environmental, nuclear or safety liabilities permanently impair fleet value.
- Acquisitions destroy per-share cash flow across a full operating cycle.$pf$,
  competitive_notes = $pf$Vistra's integrated retail-generation model, diversified fleet, nuclear licences and interconnections are difficult to replicate. Scale supports risk management, fuel procurement, customer origination and capital-market access. The large reduction in share count shows that capital allocation can be a genuine per-share advantage.

CEG, NRG, Talen, regulated utilities and renewable/storage developers compete for customers and market value. Vistra has more financial and operational complexity than a regulated utility and less nuclear concentration than CEG. The moat should be assessed through realized cash margin, availability, hedge quality and return on acquired capital.$pf$,
  next_diligence = $pf$1. Reconcile adjusted EBITDA and FCFbG to GAAP cash flow, including collateral, growth capital, closure costs and working capital.
2. Map debt, maturities, secured entities and rating thresholds before and after Cogentrix.
3. Track generation hedges by region, year, volume and price; stress collateral under adverse curves.
4. Maintain plant-level availability, heat-rate and maintenance-capital records.
5. Underwrite Cogentrix and Meta PPAs separately rather than embedding management's opportunity ranges.
6. Classify VST as an AI-power factor holding in mandate tests and stress scenarios.

**Next scheduled review:** Q3 2026 results and Cogentrix closing documentation; earlier following a major outage or market-rule change.$pf$,
  source = $pf$Primary sources verified through 15 August 2026:

- [Vistra Q2 2026 earnings release and financial tables](https://investor.vistracorp.com/2026-08-07-Vistra-Reports-Second-Quarter-2026-Results), 7 August 2026.
- [Vistra Q2 2026 Form 10-Q filing index](https://www.sec.gov/Archives/edgar/data/1692819/000169281926000019/0001692819-26-000019-index.htm), including debt, hedging, acquisitions and environmental disclosures.
- [Vistra 2025 Form 10-K](https://www.sec.gov/Archives/edgar/data/1692819/000169281926000006/vistra-20251231.htm), including market, plant, retail and regulatory risks.
- Market-price input: $148.13 close on 14 August 2026; refresh all scenario returns before a new capital decision.

All 24/60-month scenario assumptions, probabilities and implied values are PowerFund calculations, not company guidance or analyst consensus.$pf$
from public.instruments as i
where d.instrument_id = i.id
  and i.symbol = 'VST';

-- RTX — RTX
update public.dossiers as d
set
  status = 'investigate'::public.dossier_status,
  summary = $pf$**Research status:** Primary-source verified through Q2 2026. **Valuation basis:** $222.97 closing price on 14 August 2026.

RTX offers the broadest commercial-aerospace and defence mix among the proposed primes. Q2 sales rose 14% to $24.7B, adjusted EPS increased 21% to $1.89, free cash flow was $2.9B and backlog reached $289B, split $170B commercial and $119B defence. Management raised 2026 adjusted EPS guidance to $7.10–7.25 and free-cash-flow guidance to $8.50–8.75B. The business quality and backlog are strong, but the shares trade at roughly 31x midpoint adjusted EPS—an unusually full valuation for an aerospace and defence compounder still managing Pratt & Whitney engine obligations. RTX is a useful diversifier, but current expected return supports patience or a very small starter rather than a full position.$pf$,
  thesis = $pf$## Investment case

RTX combines Collins Aerospace systems, Pratt & Whitney engines and Raytheon defence electronics and missiles. The commercial businesses benefit from large installed fleets and decades of aftermarket revenue; defence franchises benefit from qualification, classified technology, installed architectures and replenishment demand. The mix reduces dependence on any single procurement cycle.

The variant perception is that commercial aftermarket growth, Pratt margin recovery and sustained defence demand can lift free cash flow faster than revenue. The opposing case is that the market already prices a large portion of that recovery, while engine inspection/compensation obligations, supply constraints and fixed-price defence programmes can absorb cash and create unexpected charges.

## Verified operating baseline

- Q2 2026 sales: **$24.71B**, up **14% reported** and **16% organically**.
- Q2 GAAP EPS: **$1.57**; adjusted EPS: **$1.89**, up **21%**.
- Q2 operating cash flow: **$3.5B**; free cash flow: **$2.9B**.
- Backlog: **$289B**, comprising **$170B commercial** and **$119B defence**, up 22% year over year.
- Collins Q2 sales: **$8.21B**; adjusted operating margin: **16.7%**.
- Pratt & Whitney Q2 sales: **$8.89B**, up 16%; adjusted operating margin was **8.3%**, with commercial aftermarket up 25%.
- Full-year 2026 outlook increased to **$95–96B adjusted sales**, **8–9% organic growth**, **$7.10–7.25 adjusted EPS** and **$8.50–8.75B free cash flow**.
- RTX agreed to sell Blue Canyon Technologies for **$620M**, continuing portfolio simplification.

## Valuation scenarios

PowerFund scenarios based on $222.97 on 14 August 2026. EPS is adjusted/normalized and dividends are excluded.

### 24 months

| Case | Weight | Core assumptions | Implied value | Return / CAGR |
|---|---:|---|---:|---:|
| Bear | 25% | $7.50 EPS; 20x P/E; engine cash costs and multiple normalization dominate | $150 | -32.7% / -18.0% |
| Base | 50% | $9.50 EPS; 26x P/E; aftermarket and defence convert backlog steadily | $247 | +10.8% / +5.3% |
| Bull | 25% | $11.50 EPS; 30x P/E; Pratt recovery and defence growth exceed expectations | $345 | +54.7% / +24.4% |

Probability-weighted working value: approximately **$247**, or **5.3% annualised**, before dividends.

### 60 months

| Case | Weight | Core assumptions | Implied value | Return / CAGR |
|---|---:|---|---:|---:|
| Bear | 25% | $10 EPS; 18x P/E; mature growth and recurring programme costs | $180 | -19.3% / -4.2% |
| Base | 50% | $14 EPS; 23x P/E; installed-base and defence compounding continue | $322 | +44.4% / +7.6% |
| Bull | 25% | $18.50 EPS; 27x P/E; aftermarket, productivity and missiles compound strongly | $500 | +124.2% / +17.5% |

Probability-weighted working value: approximately **$331**, or **8.2% annualised**, before dividends. Portfolio value is primarily resilience and factor diversification, not maximum upside from today's price.$pf$,
  catalysts = $pf$- Pratt & Whitney inspection and compensation obligations declining while fleet utilization and shop throughput improve.
- Commercial aftermarket maintaining double-digit growth across Collins and Pratt.
- Defence bookings and missile production converting the $119B defence backlog into margin and cash.
- Free cash flow reaching the raised $8.50–8.75B range with lower abnormal engine cash use thereafter.
- Collins and Pratt margin expansion from productivity, pricing and mix.
- Divestiture proceeds and cash returns reducing per-share valuation over time.
- Supply-chain recovery improving engine and systems deliveries without excess inventory.$pf$,
  risks = $pf$- **Pratt engine liabilities:** powder-metal inspections, customer compensation and shop capacity can consume more cash or last longer than expected.
- **Supply chain:** castings, electronics, skilled labour and suppliers can constrain deliveries and margins.
- **Programme accounting:** fixed-price defence development and production can generate charges.
- **Commercial cycle:** airline traffic, aircraft production and customer solvency affect original equipment and aftermarket demand.
- **Customer concentration:** Airbus, Boeing and the U.S. government possess substantial bargaining power.
- **Geopolitical/export risk:** sanctions, export controls and programme approvals can delay revenue.
- **Valuation:** approximately 31x current adjusted EPS leaves little room for ordinary execution setbacks.
- **Capital intensity:** working capital, engine concessions and capacity investments can delay accounting earnings conversion.$pf$,
  invalidation = $pf$## Warning — investigate and freeze additions

- Free-cash-flow guidance falls below **$8B** or Pratt-related cash costs extend materially beyond the disclosed plan.
- Pratt adjusted margin falls below **7%** after the current recovery period.
- Commercial aftermarket growth falls below **7%** while airline traffic remains healthy.
- Defence backlog declines for two quarters without conversion into proportional sales.
- Forward P/E remains above **28x** while expected EPS growth falls below 10%.

## Reduce — normally trim 25–50%

- Incremental Pratt charges or customer compensation exceed **$2B** beyond current reserves/plans.
- Adjusted EPS or free-cash-flow guidance is reduced by more than **10%**.
- Supply constraints cause multi-quarter delivery deterioration across at least two segments.
- Raytheon programme charges become recurrent and reduce segment margin below **9%**.
- Aftermarket pricing or shop-visit economics weaken structurally.

## Invalidate — exit unless a documented exception is approved

- A core engine platform suffers a safety or technical defect that permanently impairs fleet economics or market share.
- RTX cannot convert its installed base and backlog into durable free cash flow after abnormal engine costs subside.
- Repeated programme and quality failures demonstrate ineffective engineering or contract controls.
- Commercial and defence franchises both lose material share across a normal cycle.
- Accounting, controls or reserve evidence makes programme profitability unreliable.$pf$,
  competitive_notes = $pf$RTX's moat comes from certified aerospace content, a vast installed base, long-lived engine and avionics programmes, defence intellectual property and global service infrastructure. Aftermarket economics create recurring cash once aircraft and engines enter service.

GE Aerospace, Safran, Rolls-Royce, Honeywell, L3Harris, Lockheed Martin and Northrop compete by product and programme. Boeing, Airbus and government customers retain high bargaining power. RTX should be judged by installed-base utilization, shop economics, programme margin and cash conversion—not backlog alone.$pf$,
  next_diligence = $pf$1. Maintain a Pratt powder-metal ledger covering inspections, aircraft-on-ground, compensation, reserves and quarterly cash use.
2. Split backlog into commercial OE, aftermarket and defence, including expected conversion years.
3. Track Collins, Pratt and Raytheon margins against volume, pricing, productivity and programme charges.
4. Reconcile adjusted EPS to free cash flow after working capital, concessions, capex and restructuring.
5. Compare valuation and expected returns with LMT, NOC and GD before assigning a defence-sleeve weight.
6. Require a higher return hurdle before scaling at a premium multiple.

**Next scheduled review:** Q3 2026 results; earlier following a Pratt technical, reserve or cash-cost update.$pf$,
  source = $pf$Primary sources verified through 15 August 2026:

- [RTX Q2 2026 earnings release and financial tables](https://www.rtx.com/news/news-center/2026/07/23/rtx-reports-q2-2026-results), 23 July 2026.
- [RTX Q2 2026 Form 10-Q filing index](https://www.sec.gov/Archives/edgar/data/101829/000010182926000027/0000101829-26-000027-index.htm), including Pratt obligations, programme accounting, debt and risk disclosures.
- [RTX Q2 2026 earnings presentation](https://investors.rtx.com/static-files/4974fa8e-e918-4e2e-aac6-4da956d6fd50).
- Market-price input: $222.97 close on 14 August 2026; refresh all scenario returns before a new capital decision.

All 24/60-month scenario assumptions, probabilities and implied values are PowerFund calculations, not company guidance or analyst consensus.$pf$
from public.instruments as i
where d.instrument_id = i.id
  and i.symbol = 'RTX';

-- NOC — Northrop Grumman
update public.dossiers as d
set
  status = 'investigate'::public.dossier_status,
  summary = $pf$**Research status:** Primary-source verified through Q2 2026. **Valuation basis:** $585.87 closing price on 14 August 2026.

Northrop offers concentrated exposure to strategic deterrence, space, sensors, aircraft and missile defence. Q2 sales rose 5% to $10.9B, $20B of net awards lifted backlog to a record $104.7B, and adjusted free cash flow increased 54% to $978M. Management raised 2026 sales guidance to $43.75–44.25B and market-to-market-adjusted EPS guidance to $28.60–29.10 while retaining $3.1–3.5B adjusted free-cash-flow guidance. At approximately 20.3x midpoint EPS, valuation is reasonable for a defence diversifier, but B-21, Sentinel and fixed-price development execution remain central risks. A starter position can improve portfolio resilience; scale only as programme margins and cash conversion prove durable.$pf$,
  thesis = $pf$## Investment case

Northrop owns positions in programmes that are difficult to replace: B-21, strategic deterrence, missile defence, space payloads, radars and mission systems. National-security requirements, classified know-how, security clearances, testing infrastructure and long procurement cycles create high barriers. Record backlog provides multi-year demand visibility.

The variant perception is that strategic competition, missile-defence investment and nuclear modernization can sustain better organic growth than historical prime-contractor averages. The counterpoint is that several programmes are complex, capital intensive and subject to fixed-price or constrained-margin contracts; backlog can convert into poor economics if cost estimates or schedules fail.

## Verified operating baseline

- Q2 2026 sales: **$10.88B**, up **5%** year over year and 10% sequentially.
- Q2 operating income: **$1.10B**; operating margin: **10.1%**.
- Q2 diluted EPS: **$7.68**; first-half EPS: **$13.83**.
- Q2 net awards: approximately **$20B**; total backlog reached **$104.69B**, including **$45.95B funded**.
- Q2 adjusted free cash flow: **$978M**, up **54%** year over year.
- 2026 guidance: **$43.75–44.25B sales**, **$28.60–29.10 MTM-adjusted EPS** and **$3.1–3.5B adjusted free cash flow**.
- Defence Systems backlog grew **25%** year over year; Space Systems backlog was approximately **$26.98B**.
- Segment margin was **10.6%**, down from 11.8% a year earlier, so backlog quality and mix require continued scrutiny.

## Valuation scenarios

PowerFund scenarios based on $585.87 on 14 August 2026. EPS is normalized and dividends are excluded.

### 24 months

| Case | Weight | Core assumptions | Implied value | Return / CAGR |
|---|---:|---|---:|---:|
| Bear | 25% | $27 EPS; 16x P/E; programme charges and margin pressure offset backlog | $432 | -26.3% / -14.1% |
| Base | 50% | $34 EPS; 20x P/E; deterrence and defence awards convert steadily | $680 | +16.1% / +7.7% |
| Bull | 25% | $40 EPS; 23x P/E; production ramps and cash execution outperform | $920 | +57.0% / +25.3% |

Probability-weighted working value: approximately **$678**, or **7.6% annualised**, before dividends.

### 60 months

| Case | Weight | Core assumptions | Implied value | Return / CAGR |
|---|---:|---|---:|---:|
| Bear | 25% | $32 EPS; 15x P/E; low growth and recurring development charges | $480 | -18.1% / -3.9% |
| Base | 50% | $45 EPS; 19x P/E; backlog and capital returns compound per share | $855 | +45.9% / +7.9% |
| Bull | 25% | $60 EPS; 22x P/E; strategic programmes scale with improving margins | $1,320 | +125.3% / +17.6% |

Probability-weighted working value: approximately **$878**, or **8.4% annualised**, before dividends.$pf$,
  catalysts = $pf$- B-21 test and production milestones reached without new material charges.
- Sentinel restructuring and contract terms creating an executable schedule and acceptable return.
- Missile-interceptor, air-defence and strategic awards converting the Defence Systems backlog.
- Space growth resuming with stable margins and improved fixed-price execution.
- Adjusted free cash flow reaching $3.1–3.5B as first-half seasonality reverses.
- Share repurchases and dividends supported by cash rather than balance-sheet expansion.
- International and classified bookings diversifying programme concentration.$pf$,
  risks = $pf$- **Programme execution:** B-21, Sentinel and classified programmes can generate material cost growth or charges.
- **Fixed-price development:** inflation, engineering changes and supply disruption can make contract economics unattractive.
- **Government dependence:** budgets, continuing resolutions, protests and appropriations affect awards and cash timing.
- **Space volatility:** programme mix and development charges can cause abrupt margin changes.
- **Supply and labour:** specialized components, cleared engineers and manufacturing capacity constrain production.
- **Backlog quality:** funded and unfunded awards do not guarantee attractive margins.
- **Customer concentration:** the U.S. government controls requirements, contract terms and programme cadence.
- **Opportunity cost:** a defence stabilizer may lag growth benchmarks in strong technology markets.$pf$,
  invalidation = $pf$## Warning — investigate and freeze additions

- Segment operating margin remains below **10%** for two quarters without a favourable mix explanation.
- Adjusted free-cash-flow guidance falls below **$3B**.
- Net awards/book-to-bill falls below **1.0x** for two quarters across multiple segments.
- B-21 or Sentinel costs rise materially beyond disclosed programme baselines.
- Forward P/E exceeds **22x** while expected EPS growth remains below high single digits.

## Reduce — normally trim 25–50%

- New programme charges aggregate above **$1B** within twelve months.
- Sales, EPS or adjusted free-cash-flow guidance is reduced by more than **10%**.
- A core programme is delayed by more than a year with material negative cash consequences.
- Space or Aeronautics margin remains below **8%** for two quarters because of execution rather than mix.
- Backlog growth is dominated by low-margin or unfunded work.

## Invalidate — exit unless a documented exception is approved

- Structural cancellation or loss of a core franchise resets normalized EPS or cash-flow power by more than **15%**.
- Repeated estimate-at-completion charges show programme controls are unreliable.
- Northrop cannot earn acceptable margins on strategic programmes despite rising national-security demand.
- A material security, quality or compliance failure causes debarment or lasting customer distrust.
- Accounting, pension or contract-estimate evidence makes reported earnings unreliable.$pf$,
  competitive_notes = $pf$Northrop competes with Lockheed Martin, RTX, Boeing, General Dynamics, L3Harris and specialized space and missile firms. Its moat is strongest in classified systems, strategic platforms, radars, propulsion and programmes already embedded in national defence architectures.

Government customer power remains substantial. A sole-source or incumbent position can protect revenue but does not guarantee margin. Competitive assessment should focus on technical milestones, programme awards, funded backlog, estimate-at-completion changes and cash conversion.$pf$,
  next_diligence = $pf$1. Maintain a programme dashboard for B-21 and Sentinel covering milestones, contract type, charges, cash and management estimates.
2. Reconcile the $104.7B backlog by funded status, segment, programme, expected conversion year and margin quality.
3. Track Space and Aeronautics margin bridges, including favourable contract adjustments.
4. Stress adjusted free cash flow for pension, tax, working-capital and capex timing.
5. Compare NOC's defence-sleeve role and valuation with LMT, RTX and GD rather than owning all four indiscriminately.
6. Monitor U.S. authorization, appropriations and programme-specific budget documents.

**Next scheduled review:** Q3 2026 results and material B-21/Sentinel budget milestones.$pf$,
  source = $pf$Primary sources verified through 15 August 2026:

- [Northrop Grumman Q2 2026 earnings release](https://investor.northropgrumman.com/static-files/eeecbac8-4b29-4887-81fd-835451a46927), 21 July 2026.
- [Northrop Grumman Q2 2026 Form 10-Q](https://www.sec.gov/Archives/edgar/data/1133421/000113342126000034/noc-20260630.htm), including programme, backlog, pension and contract-risk disclosures.
- [Northrop Grumman Q2 2026 earnings presentation](https://investor.northropgrumman.com/static-files/8820d27b-a4a8-4f60-881c-143b8563171c).
- [Northrop Grumman 2025 Form 10-K](https://www.sec.gov/Archives/edgar/data/1133421/000113342126000003/noc-20251231.htm).
- Market-price input: $585.87 close on 14 August 2026; refresh all scenario returns before a new capital decision.

All 24/60-month scenario assumptions, probabilities and implied values are PowerFund calculations, not company guidance or analyst consensus.$pf$
from public.instruments as i
where d.instrument_id = i.id
  and i.symbol = 'NOC';

-- GD — General Dynamics
update public.dossiers as d
set
  status = 'investigate'::public.dossier_status,
  summary = $pf$**Research status:** Primary-source verified through Q2 2026. **Valuation basis:** $395.78 closing price on 14 August 2026.

General Dynamics combines Gulfstream's commercial-aerospace franchise with submarines, combat vehicles and government IT. Q2 revenue grew 8.1% to $14.1B, EPS increased 13.4% to $4.24, operating cash flow was $1.9B and book-to-bill reached 1.4x. Backlog stood at $136.5B, led by $65.2B in Marine Systems, while Aerospace margin expanded to 14.5%. The mix provides better end-market diversification than a pure defence prime, but Gulfstream cyclicality and submarine execution create distinct risks. At roughly 24x trailing earnings, GD is high quality but not cheap; a starter position is preferable to chasing a full allocation.$pf$,
  thesis = $pf$## Investment case

General Dynamics owns four franchises with different cycles: Gulfstream business jets and services; nuclear submarines and surface ships; combat vehicles and munitions; and government IT/mission services. Marine programmes and installed defence platforms provide long-duration visibility, while Gulfstream offers higher margins and cash upside when deliveries and service demand are strong.

The variant perception is that Gulfstream's new-aircraft cycle, marine backlog and allied defence demand can sustain high-single-digit revenue and low-double-digit EPS growth. The counterpoint is that Marine Systems carries labour, schedule and fixed-price risk, while business-jet demand and customer deposits can reverse in a downturn.

## Verified operating baseline

- Q2 2026 revenue: **$14.09B**, up **8.1%** year over year.
- Q2 operating earnings: **$1.46B**, up **11.9%**; operating margin: **10.4%**, up 40 basis points.
- Q2 diluted EPS: **$4.24**, up **13.4%**.
- Q2 cash from operating activities: **$1.9B**, or **162% of net earnings**.
- Company book-to-bill: **1.4x**, with orders across all four segments.
- Backlog: **$136.5B**; total estimated contract value including options and IDIQ estimates: **$186.9B**.
- Marine Systems backlog: **$65.18B**; Aerospace backlog: **$23.98B**.
- Q2 Gulfstream deliveries: **41 aircraft**, versus 38 a year earlier; Aerospace Q2 operating margin was **14.5%**.
- First-half revenue rose **9.1%** and first-half Aerospace operating earnings increased **20.1%**.

## Valuation scenarios

PowerFund scenarios based on $395.78 on 14 August 2026. Dividends are excluded.

### 24 months

| Case | Weight | Core assumptions | Implied value | Return / CAGR |
|---|---:|---|---:|---:|
| Bear | 25% | $18 EPS; 18x P/E; Gulfstream normalizes and marine margins stall | $324 | -18.1% / -9.5% |
| Base | 50% | $22 EPS; 22x P/E; deliveries, service and defence backlog compound | $484 | +22.3% / +10.6% |
| Bull | 25% | $26 EPS; 25x P/E; Gulfstream and marine execution exceed expectations | $650 | +64.2% / +28.2% |

Probability-weighted working value: approximately **$486**, or **10.8% annualised**, before dividends.

### 60 months

| Case | Weight | Core assumptions | Implied value | Return / CAGR |
|---|---:|---|---:|---:|
| Bear | 25% | $21 EPS; 16x P/E; business-jet cycle and shipyard constraints limit growth | $336 | -15.1% / -3.2% |
| Base | 50% | $31 EPS; 20x P/E; balanced franchises and capital returns compound | $620 | +56.7% / +9.4% |
| Bull | 25% | $40 EPS; 23x P/E; sustained defence demand and Gulfstream share gains | $920 | +132.5% / +18.4% |

Probability-weighted working value: approximately **$624**, or **9.5% annualised**, before dividends.$pf$,
  catalysts = $pf$- Gulfstream G700/G800 production and deliveries raising Aerospace revenue, margin and customer cash receipts.
- Aerospace services expanding the recurring installed-base contribution.
- Columbia- and Virginia-class submarine funding and productivity converting the $65.2B Marine backlog.
- European combat-vehicle and munitions demand supporting Combat Systems bookings.
- Technologies growth stabilizing with better mix and order conversion.
- Cash conversion remaining near or above net income, supporting dividends and repurchases.
- Shipyard labour and supplier investments improving schedule and margin performance.$pf$,
  risks = $pf$- **Business-jet cycle:** corporate confidence, wealth, financing and used-aircraft supply affect orders and deposits.
- **Marine execution:** shipyard labour, suppliers, schedule penalties and contract mix can suppress margin.
- **Government budgets:** submarine, vehicle and IT awards depend on appropriations and priorities.
- **Customer advances:** Aerospace cash flow can reverse if cancellations or delivery delays require refunds.
- **Certification and quality:** new-aircraft or defence-platform issues can delay deliveries.
- **Technology services competition:** government IT has lower barriers and more recompete risk than platform programmes.
- **Valuation:** the current multiple assumes continued Gulfstream and defence execution.
- **Capital intensity:** ships and aircraft require inventory and working capital before delivery.$pf$,
  invalidation = $pf$## Warning — investigate and freeze additions

- Aerospace book-to-bill remains below **0.8x** for two quarters or backlog declines more than **10%**.
- Marine Systems margin remains below **7%** despite revenue growth.
- Operating cash conversion falls below **80% of net income** over a rolling twelve months.
- Gulfstream deliveries miss plan by more than **10%** for non-temporary reasons.
- Forward P/E exceeds **24x** while expected EPS growth falls below high single digits.

## Reduce — normally trim 25–50%

- A major aircraft programme suffers a certification, quality or production delay exceeding twelve months.
- Marine charges or schedule penalties reduce company EPS by more than **10%**.
- Company backlog declines across at least three segments for two quarters.
- Customer deposit refunds or working-capital needs materially weaken free cash flow.
- Defence awards shift structurally away from GD's submarine or combat-vehicle franchises.

## Invalidate — exit unless a documented exception is approved

- Gulfstream loses durable large-cabin market share or cannot earn low-to-mid-teens margins through a cycle.
- Core submarine programmes suffer structural cancellation, reallocation or uneconomic contract reset.
- Repeated quality or programme-control failures make delivery schedules and earnings unreliable.
- GD cannot convert its backlog and customer advances into durable per-share free cash flow.
- Accounting, security or compliance failures cause material debarment or restatement risk.$pf$,
  competitive_notes = $pf$Gulfstream competes primarily with Bombardier and Dassault in large-cabin aircraft, with brand, installed service, range and cabin performance supporting the franchise. Marine Systems competes in highly specialized U.S. naval programmes where shipyard capacity and nuclear expertise are scarce. Combat and Technologies face broader programme-by-programme competition.

GD's mix is a strength, but the moats differ. Gulfstream must be tracked through orders, cancellations, used inventory, deliveries and service; defence franchises through funded backlog, programme margin, schedule and cash.$pf$,
  next_diligence = $pf$1. Build a Gulfstream dashboard covering orders, cancellations, backlog, deliveries, deposits, used inventory and service revenue.
2. Track Marine Systems revenue, margin, hiring, supplier capacity and milestone performance by submarine programme.
3. Reconcile backlog to funded/unfunded status, options and expected conversion years.
4. Monitor customer advances and inventory to understand cash conversion quality.
5. Compare GD's balanced defence/aerospace role with LMT, RTX and NOC before allocating the defence sleeve.
6. Refresh scenarios after Q3 2026 and material U.S. naval-budget updates.

**Next scheduled review:** Q3 2026 results and the next U.S. defence appropriations milestone.$pf$,
  source = $pf$Primary sources verified through 15 August 2026:

- [General Dynamics Q2 2026 earnings release and financial tables](https://investorrelations.gd.com/news/press-release-details/2026/General-Dynamics-Reports-Second-Quarter-2026-Financial-Results/default.aspx), 29 July 2026.
- [General Dynamics Q2 2026 Form 10-Q](https://www.sec.gov/Archives/edgar/data/40533/000004053326000032/gd-20260705.htm), including contract, backlog, customer-advance and programme-risk disclosures.
- [General Dynamics quarterly-results archive](https://investorrelations.gd.com/financial-reports/quarterly-financial-results/default.aspx).
- Market-price input: $395.78 close on 14 August 2026; refresh all scenario returns before a new capital decision.

All 24/60-month scenario assumptions, probabilities and implied values are PowerFund calculations, not company guidance or analyst consensus.$pf$
from public.instruments as i
where d.instrument_id = i.id
  and i.symbol = 'GD';

-- PWR — Quanta Services
update public.dossiers as d
set
  status = 'investigate'::public.dossier_status,
  summary = $pf$**Research status:** Primary-source verified through Q2 2026. **Valuation basis:** $685.78 closing price on 14 August 2026.

Quanta is the scaled execution platform for transmission, distribution, generation interconnection, pipelines and mission-critical infrastructure. Q2 revenue rose 41% to $9.56B, adjusted EPS increased 71% to $4.24, free cash flow reached $886M and backlog grew to $53.44B. Management raised 2026 expectations to $39.3–39.7B revenue, $16.45–16.95 adjusted EPS and $2.0–2.5B free cash flow. The operating momentum is excellent, but the shares trade near 41x midpoint adjusted EPS and acquisition activity complicates organic growth and cash quality. PWR is partly an AI-grid beneficiary, not a clean diversifier. Keep on the watchlist and wait for a wider valuation margin or a controlled starter.$pf$,
  thesis = $pf$## Investment case

Quanta has assembled scarce craft labour, project management, safety systems, engineering and self-perform capability across electric power and underground infrastructure. Utilities and large customers need grid hardening, transmission, generation connections and load-centre infrastructure, but skilled labour and qualified contractors are constrained. Scale, local density and customer relationships allow Quanta to execute programmes that smaller contractors cannot readily absorb.

The variant perception is that grid investment and electrification create a decade-long backlog with pricing and productivity advantages. The opposing case is that construction remains execution-heavy: fixed-price risk, acquisitions, working capital, labour and customer concentration can turn strong backlog into disappointing cash. A premium multiple also converts ordinary normalization into material downside.

## Verified operating baseline

- Q2 2026 revenue: **$9.56B**, versus $6.77B a year earlier.
- Q2 GAAP EPS: **$2.96**; adjusted diluted EPS: **$4.24**, versus $2.48.
- Q2 adjusted EBITDA: approximately **$1.1B**.
- Q2 cash from operations: approximately **$1.1B**; free cash flow: **$886M**.
- Remaining performance obligations: **$33.55B**; total backlog: **$53.44B**, versus $35.84B a year earlier.
- Electric segment backlog: **$43.79B**; Underground and Infrastructure backlog: **$9.65B**.
- 2026 outlook: **$39.3–39.7B revenue**, **$16.45–16.95 adjusted EPS**, **$2.0–2.5B free cash flow** and approximately $3.74–3.86B EBITDA before specified adjustments.
- Quanta completed multiple acquisitions in 2025 and 2026, increasing capability but also amortization, integration and capital-allocation complexity.

## Valuation scenarios

PowerFund scenarios based on $685.78 on 14 August 2026. EPS is adjusted/normalized and dividends are excluded.

### 24 months

| Case | Weight | Core assumptions | Implied value | Return / CAGR |
|---|---:|---|---:|---:|
| Bear | 25% | $18 EPS; 26x P/E; backlog slows and multiple normalizes | $468 | -31.8% / -17.4% |
| Base | 50% | $24 EPS; 34x P/E; grid and load-centre execution sustains compounding | $816 | +19.0% / +9.1% |
| Bull | 25% | $30 EPS; 40x P/E; self-perform platform gains share with strong margins | $1,200 | +75.0% / +32.3% |

Probability-weighted working value: approximately **$825**, or **9.7% annualised**.

### 60 months

| Case | Weight | Core assumptions | Implied value | Return / CAGR |
|---|---:|---|---:|---:|
| Bear | 25% | $22 EPS; 24x P/E; project and acquisition returns normalize | $528 | -23.0% / -5.1% |
| Base | 50% | $38 EPS; 30x P/E; grid capital programmes compound at durable returns | $1,140 | +66.2% / +10.7% |
| Bull | 25% | $55 EPS; 36x P/E; labour scarcity and platform density drive exceptional share gains | $1,980 | +188.7% / +23.6% |

Probability-weighted working value: approximately **$1,197**, or **11.8% annualised**.$pf$,
  catalysts = $pf$- Electric backlog converting into revenue and cash at stable or improving margins.
- Transmission, generation-interconnection and large-load programmes receiving approvals and construction starts.
- 2026 free cash flow reaching the $2.0–2.5B range despite growth and acquisition integration.
- Recently acquired businesses meeting margin and return hurdles while cross-selling into Quanta customers.
- Prefabrication, self-perform and workforce investments increasing productivity and schedule certainty.
- Utility capital plans remaining resilient despite interest rates and regulatory scrutiny.
- Reduced acquisition intensity allowing organic growth and cash conversion to become clearer.$pf$,
  risks = $pf$- **Valuation:** roughly 41x midpoint adjusted EPS creates substantial multiple-compression risk.
- **Project execution:** weather, fixed-price exposure, change orders, permitting and customer delays affect margin and cash.
- **Acquisition dependence:** repeated deals add goodwill, amortization, integration risk and adjusted-EPS complexity.
- **Labour:** skilled-craft scarcity supports the moat but can also cap capacity and increase wages.
- **Customer concentration:** large utilities and technology customers can delay, re-scope or negotiate programmes.
- **Backlog definition:** Quanta includes estimated MSA renewals and non-fixed-price work; backlog is not guaranteed revenue.
- **Working capital:** rapid growth can consume cash and mask weaker project economics.
- **Factor concentration:** grid and load-centre demand overlaps PowerFund's AI-infrastructure exposure.$pf$,
  invalidation = $pf$## Warning — investigate and freeze additions

- Organic revenue growth falls below **8%** while acquisition contribution remains high.
- Electric segment backlog declines for two quarters or book-to-bill falls below **1.0x**.
- Rolling twelve-month free cash flow falls below **70% of adjusted net income**.
- Project write-downs or change-order disputes exceed **2% of annual revenue**.
- Forward valuation exceeds **38x normalized EPS** without upward revisions to organic cash flow.

## Reduce — normally trim 25–50%

- Adjusted EPS or free-cash-flow guidance is reduced by more than **10%**.
- Acquired businesses fail to achieve underwritten margins or require material additional capital.
- Electric operating margin declines by more than 200 basis points for two quarters.
- Working-capital absorption persists despite slower revenue growth.
- A major customer cancels or defers programmes representing more than **5% of backlog**.

## Invalidate — exit unless a documented exception is approved

- Repeated project losses demonstrate that bidding, change-order or operational controls are unreliable.
- Quanta cannot convert strong backlog into durable free cash flow through a normal infrastructure cycle.
- Acquisition-led growth destroys per-share returns or pushes leverage outside a defensible range.
- The skilled-workforce and self-perform advantage erodes, causing sustained share or margin loss.
- Accounting, safety or compliance failures materially impair customer eligibility.$pf$,
  competitive_notes = $pf$Quanta competes with MasTec, MYR Group, EMCOR, specialty contractors and in-house utility teams. Its advantages are scale, safety record, craft workforce, local operating companies, engineering and the ability to self-perform large programmes. Dense customer relationships and scarce labour are practical barriers.

The moat does not eliminate construction risk. Customers remain powerful, contracts vary and acquisitions can hide organic economics. Competitive strength should be measured through organic backlog, margin, safety, cash conversion and return on acquired capital.$pf$,
  next_diligence = $pf$1. Separate organic from acquired revenue, EBITDA and backlog for every quarter.
2. Reconcile RPO and total backlog by fixed price, unit price, MSA estimate, customer and expected conversion year.
3. Track segment margin, project write-downs, change orders and working-capital days.
4. Build an acquisition scorecard comparing announced multiples and synergies with realized cash returns.
5. Map utility and large-load programmes to permits, regulatory approvals, funding and start dates.
6. Classify PWR partly within the AI/grid-capex factor and stress it with VRT, NVT, CEG, VST and EME.

**Next scheduled review:** Q3 2026 results; earlier following a large acquisition, project cancellation or guidance change.$pf$,
  source = $pf$Primary sources verified through 15 August 2026:

- [Quanta Services Q2 2026 earnings release and financial tables](https://investors.quantaservices.com/news-events/press-releases/detail/402/quanta-services-reports-second-quarter-2026-results), 30 July 2026.
- [Quanta Services Q2 2026 Form 10-Q](https://www.sec.gov/Archives/edgar/data/1050915/000105091526000025/pwr-20260630.htm), including acquisition, backlog, contract and working-capital disclosures.
- [Quanta Q2 2026 operational and financial summary](https://investors.quantaservices.com/_assets/_6a0c2a38373dd2a70fec7c01c7dab302/quantaservices/db/894/10545/pdf/PWR%2B06-30-2026%2BER%2BOperational%2Band%2BFinancial%2BSummary%2BvF.pdf).
- Market-price input: $685.78 close on 14 August 2026; refresh all scenario returns before a new capital decision.

All 24/60-month scenario assumptions, probabilities and implied values are PowerFund calculations, not company guidance or analyst consensus.$pf$
from public.instruments as i
where d.instrument_id = i.id
  and i.symbol = 'PWR';

-- EME — EMCOR Group
update public.dossiers as d
set
  status = 'investigate'::public.dossier_status,
  summary = $pf$**Research status:** Primary-source verified through Q2 2026. **Valuation basis:** $836.29 closing price on 14 August 2026.

EMCOR is an exceptional operator in electrical and mechanical construction, building services and industrial services. Q2 revenue rose 19.8% to $5.15B, operating margin expanded to 10.6%, EPS increased 34.8% to $9.06 and remaining performance obligations reached $17.14B, up 43.9%. Management raised 2026 guidance to $20.0–20.5B revenue and $32.00–33.25 EPS. The balance sheet held $924M cash and essentially no debt. Quality and cash optionality are excellent, but AI and data-centre construction now drive a meaningful part of demand, and the shares trade near 25.6x midpoint guidance after strong appreciation. EME is a better balance-sheet risk than PWR but not a true factor diversifier; buy only with valuation and project-mix discipline.$pf$,
  thesis = $pf$## Investment case

EMCOR is a decentralized federation of specialized electrical, mechanical, facilities and industrial-service businesses. Local customer relationships, skilled labour, safety performance, prefabrication and execution capability allow the company to win complex projects in data centres, healthcare, high-tech manufacturing, water and institutional markets. Service and retrofit work adds shorter-duration, recurring demand.

The variant perception is that mission-critical construction and maintenance can sustain structurally higher margins as customers value schedule certainty and scarce labour. The counterpoint is that 10%+ operating margins may reflect a favourable mix of large, capacity-constrained projects. Data-centre concentration, customer bargaining power and eventual supply response can normalize margins even if revenue remains high.

## Verified operating baseline

- Q2 2026 revenue: **$5.15B**, up **19.8%** year over year.
- Q2 operating income: **$547.3M**, up **31.8%**; operating margin: **10.6%**, up 100 basis points.
- Q2 diluted EPS: **$9.06**, up **34.8%**.
- U.S. construction revenue: **$3.96B**, up **28.0%**; U.S. construction operating margin: **13.1%**.
- First-half revenue: **$9.78B**, up 19.7%; first-half EPS: **$15.89**, up 32.9%.
- Remaining performance obligations: **$17.14B**, up **43.9%** year over year and $3.89B from year-end 2025.
- Cash at 30 June 2026: **$924M**; debt excluding leases was effectively zero, with total reported debt approximately **$6M**.
- Updated 2026 guidance: **$20.0–20.5B revenue**, **9.5–9.8% operating margin** and **$32.00–33.25 diluted EPS**.
- Management identified AI infrastructure and digital transformation as major drivers within Network and Communications, alongside diversified strength in other end markets.

## Valuation scenarios

PowerFund scenarios based on $836.29 on 14 August 2026. Dividends are excluded.

### 24 months

| Case | Weight | Core assumptions | Implied value | Return / CAGR |
|---|---:|---|---:|---:|
| Bear | 25% | $32 EPS; 18x P/E; project mix and margins normalize | $576 | -31.1% / -17.0% |
| Base | 50% | $42 EPS; 24x P/E; backlog converts with disciplined execution | $1,008 | +20.5% / +9.8% |
| Bull | 25% | $52 EPS; 28x P/E; mission-critical demand and margins remain exceptional | $1,456 | +74.1% / +31.9% |

Probability-weighted working value: approximately **$1,012**, or **10.0% annualised**.

### 60 months

| Case | Weight | Core assumptions | Implied value | Return / CAGR |
|---|---:|---|---:|---:|
| Bear | 25% | $38 EPS; 17x P/E; data-centre cycle and labour constraints limit growth | $646 | -22.8% / -5.0% |
| Base | 50% | $60 EPS; 22x P/E; diversified execution platform compounds organically and through small deals | $1,320 | +57.8% / +9.6% |
| Bull | 25% | $85 EPS; 26x P/E; high-value project and service share gains persist | $2,210 | +164.3% / +21.5% |

Probability-weighted working value: approximately **$1,374**, or **10.4% annualised**.$pf$,
  catalysts = $pf$- RPO conversion sustaining high-teens revenue growth without margin dilution.
- U.S. electrical and mechanical construction margins remaining above **12%**.
- Data-centre, high-tech manufacturing, healthcare and water demand broadening beyond a few customers.
- Building-services retrofit, controls and fire-life-safety work increasing recurring revenue.
- Bolt-on acquisitions expanding geography and capabilities at disciplined multiples.
- Net cash funding organic investment, acquisitions and repurchases through a downturn.
- Prefabrication and virtual design improving labour productivity and schedule certainty.$pf$,
  risks = $pf$- **Project concentration:** a small number of very large projects can drive revenue, margin and working-capital volatility.
- **AI/data-centre cycle:** customer capex delays or overbuild can reduce Network and Communications activity.
- **Margin normalization:** current double-digit margins may attract competitors or reflect unusually favourable mix.
- **Labour:** electricians, pipefitters and project managers are scarce; wage and capacity pressure can constrain growth.
- **Contract risk:** fixed-price estimates, change orders, delays and customer disputes can create losses.
- **Customer credit:** private-sector projects can be cancelled or customers may fail to pay.
- **Acquisitions:** decentralized businesses require cultural and control discipline.
- **Valuation:** the current multiple offers limited protection from an ordinary construction slowdown.$pf$,
  invalidation = $pf$## Warning — investigate and freeze additions

- RPO growth falls below **5%** or book-to-bill remains below **1.0x** for two quarters.
- U.S. construction operating margin falls below **11%** without a clear mix explanation.
- Network and Communications exceeds a prudent concentration limit without customer-level disclosure.
- Cash conversion falls below **80% of net income** over a rolling twelve months.
- Forward valuation exceeds **27x normalized EPS** while RPO and revisions flatten.

## Reduce — normally trim 25–50%

- Full-year revenue, margin or EPS guidance is cut by more than **10%**.
- Project write-downs or disputes aggregate above **2% of annual operating income**.
- RPO declines by more than **15%** without conversion into comparable revenue and cash.
- U.S. construction margin remains below **10%** for two quarters.
- Acquisitions materially increase debt or fail to achieve underwritten returns.

## Invalidate — exit unless a documented exception is approved

- Repeated project losses demonstrate ineffective bidding, estimation or control systems.
- EMCOR loses its safety, labour or execution advantage and suffers durable customer-share loss.
- The company cannot sustain high-single-digit operating margins through a normal non-residential cycle.
- A major safety, legal or bonding event prevents subsidiaries from bidding on core work.
- Accounting or decentralized-control failures make subsidiary earnings unreliable.$pf$,
  competitive_notes = $pf$EMCOR competes with Quanta, Comfort Systems, MYR Group, MasTec and many regional contractors. Its advantages are skilled labour, local customer relationships, safety, bonding capacity, prefabrication, decentralized accountability and the ability to execute complex projects on schedule.

The market remains fragmented, so acquisition opportunities exist, but local competitors can be aggressive. EMCOR's moat should be measured through win rates, RPO quality, project margins, safety, retention and cash conversion—not revenue growth alone.$pf$,
  next_diligence = $pf$1. Break RPO down by market, customer, project size, contract type, expected conversion and data-centre exposure.
2. Track organic revenue and margin separately from Miller Electric and subsequent acquisitions.
3. Reconcile earnings to cash flow, working-capital movements, change orders and customer advances.
4. Monitor labour headcount, utilization, wage inflation, safety and prefabrication productivity.
5. Compare EME and PWR on organic growth, leverage, valuation, backlog quality and factor concentration.
6. Treat EME as partial AI-infrastructure exposure in mandate and stress calculations despite its diversified end markets.

**Next scheduled review:** Q3 2026 results; earlier following a major project loss, acquisition or data-centre capex change.$pf$,
  source = $pf$Primary sources verified through 15 August 2026:

- [EMCOR Q2 2026 earnings release](https://emcorgroup.com/investor-relations/press-releases/2026-news/emcor-group-inc-reports-second-quarter-2026-results), 30 July 2026.
- [EMCOR Q2 2026 earnings presentation](https://emcorgroup.com/download_file/view/f4d1195c-4f3e-4a08-991d-89aa1d1faa57/1), including segment, RPO, balance-sheet and guidance data.
- [EMCOR Q2 2026 Form 10-Q](https://www.sec.gov/Archives/edgar/data/105634/000010563426000110/eme-20260630.htm), including contract, acquisition, cash and risk disclosures.
- Market-price input: $836.29 close on 14 August 2026; refresh all scenario returns before a new capital decision.

All 24/60-month scenario assumptions, probabilities and implied values are PowerFund calculations, not company guidance or analyst consensus.$pf$
from public.instruments as i
where d.instrument_id = i.id
  and i.symbol = 'EME';

commit;
