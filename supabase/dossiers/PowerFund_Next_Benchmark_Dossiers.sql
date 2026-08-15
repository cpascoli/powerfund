-- PowerFund benchmark dossier updates — diversification candidates
-- Research as of 2026-08-15
-- Assumes public.instruments has a unique symbol column.
-- Review scenario assumptions and refresh market-price inputs before running.

begin;

do $guard$
begin
  if (select count(*)
      from public.dossiers d
      join public.instruments i on i.id = d.instrument_id
      where i.symbol in ('ISRG', 'LMT', 'BWXT', 'CCJ')) <> 4 then
    raise exception 'Expected one existing dossier for each of ISRG, LMT, BWXT, CCJ';
  end if;
end
$guard$;

-- ISRG — Intuitive Surgical
update public.dossiers as d
set
  status = 'investigate'::public.dossier_status,
  summary = $pf$**Research status:** Primary-source verified through Q2 2026. **Valuation basis:** $394.51 closing price on 14 August 2026.

Intuitive is the cleanest factor diversifier in the proposed group: procedure volumes, recurring instruments, service and lease revenue drive the economics rather than hyperscaler capital expenditure. Q2 revenue grew 19% to $2.89B, combined da Vinci and Ion procedures grew 16%, and approximately 85% of revenue was recurring. The balance sheet held $8.63B of cash and investments. Quality is high, but at roughly 45.3x trailing GAAP EPS the shares still require durable mid-teens procedure growth and sustained premium margins. Approve only a starter position at the current valuation; scale when procedure evidence and valuation jointly improve.$pf$,
  thesis = $pf$## Investment case

Intuitive has built an ecosystem around robotic-assisted surgery rather than merely selling capital equipment. A growing installed base drives recurring instruments and accessories, service and operating-lease revenue; surgeon training, hospital workflow integration, clinical evidence and a broad installed base reinforce adoption. Da Vinci 5 extends the core platform, while Ion and da Vinci SP create additional procedure vectors.

The variant perception is that recurring revenue and procedure density can compound for longer than a conventional medical-device cycle as minimally invasive surgery expands globally. The counterpoint is valuation: the market already recognizes Intuitive's quality, so even good execution can produce mediocre returns if procedure growth normalizes and the multiple compresses.

## Verified operating baseline

- Q2 2026 revenue: **$2.89B**, up **19%** year over year.
- Combined da Vinci and Ion procedures: up approximately **16%**; da Vinci procedures grew **15%** and Ion procedures **36%**.
- Da Vinci placements: **468**, including **246 da Vinci 5** systems; Ion placements: **55**.
- Installed base: **11,710 da Vinci** systems, up **12%**, and **1,096 Ion** systems, up **21%**.
- Q2 recurring revenue was approximately **$2.47B**, or **85%** of total revenue, comprising instruments and accessories, service and operating leases.
- Q2 non-GAAP operating income: **$1.22B**; non-GAAP EPS: **$2.80**. Q2 GAAP EPS was **$2.29**.
- 2026 company outlook: da Vinci procedure growth of **13.5–15.5%**, non-GAAP gross margin of **68–69%**, and non-GAAP operating-expense growth of **11–13%**.
- Cash, cash equivalents and investments at Q2: **$8.63B**.

## Valuation scenarios

These are PowerFund scenarios, not company guidance. They use the 14 August 2026 price of $394.51, normalized EPS assumptions and exclude dividends.

### 24 months

| Case | Weight | Core assumptions | Implied value | Return / CAGR |
|---|---:|---|---:|---:|
| Bear | 25% | $10 normalized EPS; 30x P/E; procedure growth slows and competition compresses the premium | $300 | -24.0% / -12.8% |
| Base | 50% | $14 normalized EPS; 38x P/E; mid-teens procedures and recurring revenue compound | $532 | +34.9% / +16.1% |
| Bull | 25% | $18 normalized EPS; 45x P/E; da Vinci 5, SP and Ion adoption exceed expectations | $810 | +105.3% / +43.3% |

Probability-weighted working value: approximately **$544**, or **17.4% annualised**. The probabilities are research priors, not forecasts.

### 60 months

| Case | Weight | Core assumptions | Implied value | Return / CAGR |
|---|---:|---|---:|---:|
| Bear | 25% | $13 normalized EPS; 28x P/E; mature-market growth and pricing pressure dominate | $364 | -7.7% / -1.6% |
| Base | 50% | $22 normalized EPS; 35x P/E; durable ecosystem with broader global procedure adoption | $770 | +95.2% / +14.3% |
| Bull | 25% | $32 normalized EPS; 42x P/E; multiple platforms expand indications and procedure density | $1,344 | +240.7% / +27.8% |

Probability-weighted working value: approximately **$812**, or **15.5% annualised**.$pf$,
  catalysts = $pf$- Da Vinci procedure growth remaining near or above the 2026 midpoint while system utilization continues to rise.
- Continued da Vinci 5 placements, international clearances and evidence of improved hospital economics or clinical outcomes.
- Ion procedure growth and utilization converting the installed base into a meaningful recurring-revenue contributor.
- Da Vinci SP indication expansion and adoption without cannibalising attractive multi-port economics.
- Recurring revenue maintaining mid-teens growth and roughly 85% of the revenue mix.
- Non-GAAP gross margin holding near 68–69% despite tariffs, product-launch costs and a growing lease base.
- Capital returns that reduce dilution while preserving the net-cash balance sheet.$pf$,
  risks = $pf$- **Valuation:** roughly 45.3x trailing GAAP EPS leaves limited protection from an ordinary growth slowdown.
- **Competition:** Medtronic, Johnson & Johnson, CMR Surgical and other entrants can increase pricing pressure and lengthen replacement cycles.
- **Procedure adoption:** clinical preferences, hospital budgets, reimbursement or alternative therapies can slow procedures and utilization.
- **Product and regulatory risk:** recalls, adverse-event evidence, manufacturing-quality problems or delayed clearances can damage the ecosystem.
- **Lease exposure:** usage-based arrangements improve customer economics but shift utilization and asset-recovery risk onto Intuitive.
- **Platform transition:** da Vinci 5 trade-ins and launch costs can create placement, revenue and margin volatility.
- **Geographic and trade risk:** China exposure, tariffs, export restrictions and localized competitors can affect growth and supply.
- **Multiple compression:** excellent fundamental performance does not ensure acceptable returns from a premium starting valuation.$pf$,
  invalidation = $pf$## Warning — investigate and freeze additions

- Combined procedure growth falls below **12%** without a clearly temporary calendar or healthcare-system cause.
- Da Vinci utilization stops improving, recurring-revenue growth falls below **12%**, or da Vinci 5 placements slow materially.
- Non-GAAP gross margin falls below **67%** or operating expenses persistently outgrow revenue.
- Forward valuation exceeds roughly **50x normalized EPS** while procedure and EPS revisions flatten.

## Reduce — normally trim 25–50%

- Combined procedure growth remains below **10%** for two quarters or management reduces full-year procedure guidance by more than 300 basis points.
- Recurring-revenue growth remains below **10%** for two quarters, indicating weaker utilization or pricing.
- Non-GAAP gross margin remains below **65%** for two quarters without a credible temporary launch or tariff explanation.
- A major competitor wins material reference accounts or tenders with demonstrated procedure, price or workflow superiority.
- A product-quality, recall or regulatory event creates material remediation costs or slows system use.

## Invalidate — exit unless a documented exception is approved

- Procedure volumes stagnate or decline because robotic-assisted surgery loses demonstrated clinical or economic value.
- Sustained installed-base churn, system removals or competitive conversions show that training, workflow and ecosystem switching costs have broken.
- A material safety, regulatory or quality failure causes a prolonged suspension of a core platform or lasting surgeon distrust.
- Intuitive cannot sustain at least high-single-digit recurring-revenue growth and mid-60s gross margins through a normal healthcare cycle.
- Accounting, controls or lease-residual evidence makes reported recurring economics unreliable.$pf$,
  competitive_notes = $pf$Intuitive's moat combines a large installed base, surgeon training, procedure-specific instruments, service infrastructure, clinical evidence and integration into hospital workflows. The recurring instrument model strengthens with procedure volume, and the installed base produces data and feedback that support product improvement.

Competition is increasing. Medtronic, Johnson & Johnson, CMR Surgical and regional systems can compete on capital price, open architecture or hospital procurement relationships. Conventional laparoscopy and non-surgical treatment are also substitutes. The moat should therefore be measured through procedure growth, utilization, retention, pricing and competitive conversions—not by system placements alone.$pf$,
  next_diligence = $pf$1. Track quarterly da Vinci and Ion procedure growth, utilization and installed-base growth separately by major geography.
2. Reconcile recurring revenue to instruments, service and fixed/usage-based leases; measure recurring revenue per installed system.
3. Map da Vinci 5 placement, trade-in and lease economics, including gross margin and capital intensity versus Xi.
4. Build a competitor scorecard covering clearances, procedure breadth, clinical evidence, placements, pricing and hospital conversions.
5. Monitor adverse-event, recall and regulatory databases alongside company disclosures.
6. Refresh normalized EPS and scenario multiples after Q3 2026; do not scale solely because the share price falls.

**Next scheduled review:** Q3 2026 results; earlier following a material competitor clearance, safety event or procedure-guidance change.$pf$,
  source = $pf$Primary sources verified through 15 August 2026:

- [Intuitive Q2 2026 earnings release and financial tables](https://isrg.intuitive.com/news-releases/news-release-details/intuitive-announces-second-quarter-earnings-6/), 16 July 2026.
- [Intuitive Q2 2026 Form 10-Q](https://www.sec.gov/Archives/edgar/data/1035267/000103526726000058/isrg-20260630.htm), including recurring revenue, installed base, leasing, tariffs and operating risks.
- [Intuitive 2025 Form 10-K](https://www.sec.gov/Archives/edgar/data/1035267/000103526726000010/isrg-20251231.htm), including competition, regulation and product-risk disclosures.
- Market-price input: $394.51 close on 14 August 2026; refresh all scenario returns before a new capital decision.

All 24/60-month scenario assumptions, probabilities and implied values are PowerFund calculations, not company guidance or analyst consensus.$pf$
from public.instruments as i
where d.instrument_id = i.id
  and i.symbol = 'ISRG';

-- LMT — Lockheed Martin
update public.dossiers as d
set
  status = 'investigate'::public.dossier_status,
  summary = $pf$**Research status:** Primary-source verified through Q2 2026. **Valuation basis:** $608.68 closing price on 14 August 2026.

Lockheed Martin is primarily a portfolio stabilizer and defence-factor diversifier, not the highest-upside candidate. Q2 sales rose 11% to $20.1B, free cash flow was $2.9B, new orders were $65B and backlog reached a record $230.4B. Management raised 2026 guidance to $79.75–81.75B sales, $29.95–30.65 EPS and $7.0–7.2B free cash flow. At approximately 20.1x midpoint EPS guidance, the valuation is reasonable relative to recent execution but not cheap for a mid-single-digit long-term grower. A starter position can improve portfolio resilience; additions should depend on cash conversion and the absence of renewed programme losses.$pf$,
  thesis = $pf$## Investment case

Lockheed Martin owns long-duration positions in aircraft, missiles and fire control, rotary and mission systems, and space. Its programmes sit inside allied defence architectures, with high certification barriers, classified know-how, installed fleets, sustainment revenue and multi-year procurement cycles. Record backlog and munitions production ramps provide visibility that is largely independent of hyperscaler capital expenditure.

The variant perception is that sustained allied rearmament, missile-defence demand and F-35 production/sustainment can support better growth and cash flow than the market historically assigns to a mature prime contractor. The counterpoint is programme accounting: fixed-price development and classified contracts can create abrupt reach-forward losses, while government budgets and customer approvals control timing.

## Verified operating baseline

- Q2 2026 sales: **$20.1B**, up **11%** year over year, with growth across all four segments.
- Q2 GAAP EPS: **$7.94**; first-half GAAP EPS: **$14.38**.
- Q2 cash from operations: **$3.24B**; free cash flow: **$2.92B**. First-half free cash flow was **$2.63B**.
- Q2 new orders: approximately **$65B**; total backlog: **$230.4B**, up from **$193.6B** at year-end 2025.
- Missiles and Fire Control Q2 sales grew **19%**, led by PAC-3, THAAD and PrSM production ramps; segment margin was **14.5%**.
- 2026 company outlook: **$79.75–81.75B sales**, **$29.95–30.65 diluted EPS**, and **$7.0–7.2B free cash flow**.
- Q2 comparisons benefited from the absence of approximately **$1.6B** of prior-year reach-forward programme losses; normalized progress must be judged beyond this base effect.

## Valuation scenarios

PowerFund scenarios based on $608.68 on 14 August 2026; dividends are excluded, making the return cases conservative relative to total return.

### 24 months

| Case | Weight | Core assumptions | Implied value | Return / CAGR |
|---|---:|---|---:|---:|
| Bear | 25% | $30 EPS; 16x P/E; budget timing and programme losses offset backlog | $480 | -21.1% / -11.2% |
| Base | 50% | $36 EPS; 20x P/E; munitions and sustainment support steady compounding | $720 | +18.3% / +8.8% |
| Bull | 25% | $42 EPS; 23x P/E; production ramps and cash conversion exceed expectations | $966 | +58.7% / +26.0% |

Probability-weighted working value: approximately **$722**, or **8.9% annualised**, before dividends.

### 60 months

| Case | Weight | Core assumptions | Implied value | Return / CAGR |
|---|---:|---|---:|---:|
| Bear | 25% | $34 EPS; 15x P/E; low growth and recurring contract charges | $510 | -16.2% / -3.5% |
| Base | 50% | $48 EPS; 19x P/E; backlog converts with disciplined capital returns | $912 | +49.8% / +8.4% |
| Bull | 25% | $62 EPS; 22x P/E; defence budgets and international demand stay structurally higher | $1,364 | +124.1% / +17.5% |

Probability-weighted working value: approximately **$925**, or **8.7% annualised**, before dividends. The value of LMT to PowerFund is lower factor correlation and downside resilience, not a standalone path to doubling NAV.$pf$,
  catalysts = $pf$- Conversion of the $230.4B backlog into sales, margin and cash without new material reach-forward losses.
- PAC-3, THAAD, PrSM and other munitions production ramps sustaining double-digit Missiles and Fire Control growth.
- F-35 production and sustainment deliveries normalizing, with international orders supporting fleet duration.
- Allied defence-budget growth and incremental missile-defence or classified awards.
- Delivery of the raised $7.0–7.2B free-cash-flow outlook and resumption of disciplined repurchases.
- Closing and integration of the proposed Ultra Maritime acquisition without balance-sheet or return dilution.
- Segment margin stability as supply chains and labour capacity expand.$pf$,
  risks = $pf$- **Programme accounting:** fixed-price development and classified contracts can create large, abrupt reach-forward losses.
- **Government dependence:** appropriations, continuing resolutions, export approvals and procurement priorities can delay awards and cash.
- **F-35 concentration:** production, sustainment, technical or political changes in the programme can materially affect Aeronautics.
- **Execution:** munitions ramps require labour, components, supplier capacity and working capital at high quality standards.
- **Cash-flow timing:** customer advances, milestone receipts, pension and tax timing can make quarterly free cash flow volatile.
- **Geopolitical and policy risk:** de-escalation or budget reallocation can slow demand even when backlog remains high.
- **Acquisition risk:** large transactions can divert capital and management attention or reduce returns.
- **Opportunity cost:** a stabilizing defence prime may lag growth benchmarks during strong technology-led markets.$pf$,
  invalidation = $pf$## Warning — investigate and freeze additions

- Backlog declines for two quarters without conversion into proportionate revenue and cash.
- Business-segment operating margin falls below approximately **10.5%** or favourable contract adjustments mask weaker underlying execution.
- 2026/2027 free-cash-flow expectations fall below **$6.5B** or working capital absorbs materially more cash than planned.
- Forward P/E exceeds roughly **22x** while expected EPS growth remains mid-single digit or lower.

## Reduce — normally trim 25–50%

- Full-year sales, EPS or free-cash-flow guidance is reduced by more than **10%**.
- New reach-forward losses aggregate above **$1B** within twelve months or recur across multiple programmes.
- F-35 deliveries or sustainment economics reset materially below the production plan without offsetting awards.
- Bookings and backlog show broad weakness across at least two segments rather than procurement timing in one programme.
- A major acquisition raises leverage or lowers expected per-share free cash flow without a credible strategic return.

## Invalidate — exit unless a documented exception is approved

- Structural loss, cancellation or insourcing of a core franchise causes a greater-than-15% reset to normalized EPS or free-cash-flow power.
- Repeated programme losses demonstrate that contract-estimation and execution controls are unreliable.
- Allied defence demand and U.S. procurement plans enter a multi-year decline that backlog cannot offset.
- Lockheed cannot convert backlog into at least high-single-digit segment margins and durable free cash flow.
- Accounting, controls, sanctions or legal evidence materially undermines reported programme economics.$pf$,
  competitive_notes = $pf$Lockheed competes with RTX, Northrop Grumman, General Dynamics, Boeing, L3Harris and international primes, but competition is programme-specific. Its advantages include classified intellectual property, certification, installed platforms, long programme lives, sustainment, government relationships and the capital required to deliver at scale.

The moat is strongest after a programme enters production and sustainment; it is weaker during new competitions and fixed-price development. Customer power remains high because national governments control budgets, contracting terms and export approvals. The dossier should therefore track programme profitability and cash conversion, not treat backlog as guaranteed value.$pf$,
  next_diligence = $pf$1. Reconcile backlog growth to funded versus unfunded awards, expected delivery years and advance payments.
2. Track F-35 production, sustainment, cash milestones and programme margin separately from other Aeronautics work.
3. Maintain a programme-loss ledger covering classified, helicopter and development contracts; compare initial estimates with subsequent charges.
4. Track MFC capacity, deliveries and margins for PAC-3, THAAD and PrSM against announced production ramps.
5. Model free cash flow after pension, tax, capital expenditure, acquisitions, dividends and repurchases.
6. Refresh scenarios after Q3 2026 and after any material budget, F-35 or Ultra Maritime update.

**Next scheduled review:** Q3 2026 results and the next material U.S. defence appropriations update.$pf$,
  source = $pf$Primary sources verified through 15 August 2026:

- [Lockheed Martin Q2 2026 earnings release and financial tables](https://investors.lockheedmartin.com/news-releases/news-release-details/lockheed-martin-reports-second-quarter-2026-financial-results/), 23 July 2026.
- [Lockheed Martin Q2 2026 Form 10-Q](https://investors.lockheedmartin.com/static-files/21ba3d1e-4093-4848-8606-dac82add19ce), including segment drivers, backlog, cash flow and programme risks.
- [Lockheed Martin 2025 Form 10-K](https://investors.lockheedmartin.com/static-files/13d6ed3e-54da-4278-8996-46008b7f0912), including competition, government dependence and contract-accounting risks.
- Market-price input: $608.68 close on 14 August 2026; refresh all scenario returns before a new capital decision.

All 24/60-month scenario assumptions, probabilities and implied values are PowerFund calculations, not company guidance or analyst consensus.$pf$
from public.instruments as i
where d.instrument_id = i.id
  and i.symbol = 'LMT';

-- BWXT — BWX Technologies
update public.dossiers as d
set
  status = 'investigate'::public.dossier_status,
  summary = $pf$**Research status:** Primary-source verified through Q2 2026. **Valuation basis:** $173.22 closing price on 14 August 2026.

BWXT is a scarce hybrid of U.S. naval nuclear propulsion and commercial nuclear services. Q2 revenue grew 18% to $901.6M, including 9% organic growth, while backlog reached $8.40B. Management raised 2026 guidance to about $3.8B revenue, $662–672M adjusted EBITDA, $4.70–4.80 non-GAAP EPS and $345–360M free cash flow. The Government franchise has unusually high barriers to entry, but at about 36.5x midpoint 2026 non-GAAP EPS the current price discounts considerable success. Treat BWXT as a smaller discovery position until organic growth, acquisition integration and valuation provide a stronger margin of safety.$pf$,
  thesis = $pf$## Investment case

BWXT supplies nuclear components and fuel for U.S. naval propulsion, where classified designs, regulatory requirements, specialized facilities and decades of qualification create formidable barriers. Commercial Operations adds nuclear manufacturing, engineering, refurbishment, fuel handling and services. The combination provides exposure to defence procurement and the nuclear-energy cycle without relying primarily on uranium prices.

The variant perception is that naval awards, life-extension work, new-build activity and advanced-reactor programmes can lengthen the growth runway beyond the market's historical view of BWXT as a slow government contractor. The counterpoint is that recent commercial growth includes acquisitions and the shares already capitalize much of the nuclear renaissance.

## Verified operating baseline

- Q2 2026 revenue: **$901.6M**, up **18%**; company presentation reported **9% organic growth**.
- Q2 adjusted EBITDA: **$155.5M**, up **7%**; non-GAAP EPS: **$1.07**, up **5%**.
- Government Operations revenue: **$601.3M**, up **2%**; adjusted EBITDA margin was approximately **21%**.
- Commercial Operations revenue: **$302.5M**, up **72%**, including **33% organic growth**; adjusted EBITDA margin was **11.9%**.
- Q2 free cash flow: **$115.0M**.
- Backlog at 30 June 2026: **$8.40B**, including **$6.80B Government** and **$1.60B Commercial**; approximately 55% is expected to convert by the end of 2027.
- Announced U.S. Naval Nuclear Propulsion Program contracts exceeded **$1.4B**.
- 2026 company outlook: approximately **$3.8B revenue**, **$662–672M adjusted EBITDA**, **$4.70–4.80 non-GAAP EPS**, and **$345–360M free cash flow**.
- The Precision Components Group acquisition closed 1 July 2026; the medical-business sale was announced at a value of up to $800M and remains an execution item until completed.

## Valuation scenarios

PowerFund scenarios based on $173.22 on 14 August 2026; dividends excluded.

### 24 months

| Case | Weight | Core assumptions | Implied value | Return / CAGR |
|---|---:|---|---:|---:|
| Bear | 25% | $5 non-GAAP EPS; 25x P/E; acquisition mix fades and valuation normalizes | $125 | -27.8% / -15.1% |
| Base | 50% | $6.50 non-GAAP EPS; 32x P/E; naval and commercial backlogs convert | $208 | +20.1% / +9.6% |
| Bull | 25% | $8 non-GAAP EPS; 38x P/E; nuclear new-build and defence awards accelerate | $304 | +75.5% / +32.5% |

Probability-weighted working value: approximately **$211**, or **10.4% annualised**.

### 60 months

| Case | Weight | Core assumptions | Implied value | Return / CAGR |
|---|---:|---|---:|---:|
| Bear | 25% | $6.50 EPS; 23x P/E; government growth slows and advanced nuclear remains small | $150 | -13.4% / -2.8% |
| Base | 50% | $10 EPS; 30x P/E; durable naval franchise plus commercial nuclear compounding | $300 | +73.2% / +11.6% |
| Bull | 25% | $15 EPS; 36x P/E; new-build, services and advanced reactors scale successfully | $540 | +211.7% / +25.5% |

Probability-weighted working value: approximately **$323**, or **13.2% annualised**.$pf$,
  catalysts = $pf$- Conversion of the $8.40B backlog, particularly the more than $1.4B of recently announced naval nuclear awards.
- Government Operations maintaining approximately 20% or better adjusted EBITDA margins during capacity expansion.
- Commercial Operations sustaining organic growth after separating acquisition contributions.
- Successful PCG integration and evidence of a durable U.S. commercial nuclear-component opportunity.
- Completion of the medical-business sale on attractive terms and disciplined redeployment of proceeds.
- Utility refurbishment, new-build, fuel and service awards in Canada and the U.S.
- Advanced-reactor and TRISO programmes moving from research milestones into funded production.$pf$,
  risks = $pf$- **Valuation:** about 36.5x midpoint 2026 non-GAAP EPS assumes a long and successful nuclear investment cycle.
- **Government concentration:** U.S. appropriations, Navy procurement schedules and classified programme timing drive a large share of value.
- **Backlog quality:** awards can be unfunded, modified, delayed or cancelled; backlog is not equivalent to revenue or cash.
- **Fixed-price execution:** cost inflation, labour shortages and engineering changes can reduce margins or create losses.
- **Acquisition and divestiture risk:** PCG and prior acquisitions must integrate while the medical sale changes mix and reported growth.
- **Commercial project timing:** utility outages, refurbishments and new-build decisions are lumpy and politically sensitive.
- **Regulatory and safety risk:** nuclear quality failures can create severe operational, legal and reputational damage.
- **Advanced-nuclear optionality:** early-stage reactor and fuel opportunities may take longer, require more capital or never scale.$pf$,
  invalidation = $pf$## Warning — investigate and freeze additions

- Organic revenue growth falls below **5%** or Commercial growth depends mainly on acquisitions.
- Government adjusted EBITDA margin falls below **19%**, backlog declines sequentially, or funded-award timing weakens.
- Free-cash-flow guidance falls below **$325M** or working capital and capex materially outgrow the plan.
- Forward P/E exceeds roughly **40x non-GAAP EPS** without corresponding organic estimate revisions.

## Reduce — normally trim 25–50%

- Revenue, adjusted EBITDA, EPS or free-cash-flow guidance is cut by more than **10%**.
- Government revenue declines for two quarters and naval awards do not replenish backlog.
- Total backlog falls more than **10%** from $8.40B without conversion into proportionate revenue and cash.
- PCG or other acquisitions dilute per-share free cash flow, or the medical sale closes materially below expected value.
- Fixed-price charges, quality costs or schedule delays reduce normalized consolidated margin below approximately **14% adjusted EBITDA**.

## Invalidate — exit unless a documented exception is approved

- BWXT loses or structurally impairs its qualified U.S. naval nuclear franchise.
- A major safety, regulatory or quality event suspends production or disqualifies a core facility for an extended period.
- Government procurement enters a multi-year decline and Commercial Operations cannot offset it with profitable organic growth.
- Acquisitions and advanced-nuclear investments consume capital without producing acceptable per-share cash returns.
- Contract accounting, controls or backlog evidence makes reported earnings power unreliable.$pf$,
  competitive_notes = $pf$BWXT's strongest moat is in U.S. naval nuclear components and fuel, where classified work, security clearances, licensing, high capital requirements and a qualification history dating to the 1950s limit direct competition. Commercial Operations faces a broader set of capable nuclear suppliers and engineering firms, including Framatome, Westinghouse, Cameco, Doosan, AECON and AtkinsRéalis.

The defence franchise deserves a premium; the commercial and advanced-reactor optionality should be valued with more caution. Acquisitions can expand capability, but they do not automatically inherit the same barriers as naval work. Track organic commercial margins and contract wins separately from acquired revenue.$pf$,
  next_diligence = $pf$1. Split backlog into funded/unfunded, Government/Commercial, expected conversion year and fixed-price exposure.
2. Separate quarterly organic growth from Kinectrics, A.O.T., PCG and other acquisition contributions.
3. Track Government contract adjustments, margin and capital expenditure during the naval capacity build.
4. Model PCG purchase economics and the medical divestiture, including taxes, stranded costs and use of proceeds.
5. Assign probability and capital requirements to advanced-reactor, TRISO and new-build opportunities rather than including them fully in the base case.
6. Refresh scenarios after Q3 2026 or the medical-sale closing; require a valuation or earnings revision before scaling.

**Next scheduled review:** Q3 2026 results; earlier on a material naval award, divestiture update or nuclear-quality event.$pf$,
  source = $pf$Primary sources verified through 15 August 2026:

- [BWXT Q2 2026 earnings release and financial tables](https://investors.bwxt.com/static-files/0cf6f9a9-4adb-454c-846e-fb5ba9290932), 3 August 2026.
- [BWXT Q2 2026 earnings presentation](https://investors.bwxt.com/static-files/cb8cc9f8-464b-488e-8a2d-034d787057c9), including organic growth, segment margins and naval awards.
- [BWXT Q2 2026 Form 10-Q/A](https://investors.bwxt.com/static-files/44ff127c-f67c-4d5e-a948-d84ab645b7cb), including backlog, segment revenue and contract risks.
- [BWXT 2025 Form 10-K](https://investors.bwxt.com/static-files/1f0aba30-45d0-48cb-9c4e-d9e36be06584), including competition, customer concentration and nuclear regulatory risks.
- Market-price input: $173.22 close on 14 August 2026; refresh all scenario returns before a new capital decision.

All 24/60-month scenario assumptions, probabilities and implied values are PowerFund calculations, not company guidance or analyst consensus.$pf$
from public.instruments as i
where d.instrument_id = i.id
  and i.symbol = 'BWXT';

-- CCJ — Cameco
update public.dossiers as d
set
  status = 'investigate'::public.dossier_status,
  summary = $pf$**Research status:** Primary-source verified through Q2 2026. **Valuation basis:** US$97.74 closing price on 14 August 2026; operating figures are in Canadian dollars unless stated otherwise.

Cameco provides the most direct new factor exposure in the group: uranium contracting, fuel services and a 49% interest in Westinghouse. First-half uranium adjusted EBITDA rose 5% to C$676M, 2026 consolidated revenue guidance increased to C$3.32–3.57B, and the uranium realized-price outlook increased to C$91–96/lb. However, Q2 showed the volatility behind the theme: uranium sales volume fell 18%, gross profit fell 27%, purchased pounds were materially more expensive than produced pounds, and Cameco's share of Westinghouse adjusted EBITDA fell 54% year over year. The long-term nuclear thesis is credible, but the current US$42.5B market value prices substantial success. Keep CCJ to a small discovery position and require either a better entry or stronger contract/production evidence before scaling.$pf$,
  thesis = $pf$## Investment case

Cameco combines tier-one uranium production in stable jurisdictions, conversion and fuel services, long-term utility contracts, and a 49% interest in Westinghouse. This creates exposure across the nuclear fuel cycle rather than to spot uranium alone. Contract discipline can preserve uncommitted resources for better pricing, while Westinghouse adds a large installed reactor service and fuel base plus new-build optionality.

The variant perception is that security-of-supply concerns, utility contracting and new reactor demand will sustain stronger uranium and fuel-cycle economics for longer than prior cycles. The counterpoint is that the stock already reflects a powerful nuclear renaissance, while realized prices can lag spot markets, production is operationally concentrated, and Westinghouse new-build work is capital- and execution-intensive.

## Verified operating baseline

- First-half 2026 uranium adjusted EBITDA: **C$676M**, up **5%**; Q2 uranium adjusted EBITDA was **C$252M**, down **28%** because of delivery timing and lower planned volumes.
- Q2 uranium sales volume: **7.1M lb**, down **18%**; average realized price: **C$93.13/lb**, up **15%**.
- Q2 uranium gross profit: **C$158M**, down **27%**; unit cost of sales rose **26%** to **C$70.81/lb**.
- 2026 outlook: **19.5–21.5M lb** owned uranium production, **29–32M lb** sales, and consolidated revenue of **C$3.32–3.57B**.
- 2026 uranium realized-price outlook: **C$91–96/lb**; uranium revenue outlook: **C$2.70–2.91B**.
- Cameco's share of Westinghouse Q2 adjusted EBITDA: **C$163M**, down **54%**; 2026 company outlook for its share remains **US$370–430M**.
- At Q2, cash and short-term investments were approximately **C$1.11B**, debt **C$1.00B**, and net cash approximately **C$116M**.
- At year-end 2025, uranium long-term commitments totaled about **230M lb**, averaging approximately **28M lb annually** over the following five years; fuel-services contracted volume was about **83M kgU of UF6**.

## Valuation scenarios

PowerFund share-price scenarios based on US$97.74 on 14 August 2026. Direct share values are used because CCJ combines Canadian-dollar mining/fuel economics and equity-accounted Westinghouse earnings; dividends are excluded.

### 24 months

| Case | Weight | Core assumptions | Implied value | Return / CAGR |
|---|---:|---|---:|---:|
| Bear | 25% | Uranium retreats below US$65/lb; production and Westinghouse miss; multiple compresses | $65 | -33.5% / -18.5% |
| Base | 50% | Uranium holds roughly US$90–110/lb; contracts reprice and operations meet plan | $115 | +17.7% / +8.5% |
| Bull | 25% | Uranium exceeds US$120/lb; supply stays tight and AP1000/new-build work advances | $160 | +63.7% / +27.9% |

Probability-weighted working value: approximately **$114**, or **7.9% annualised**.

### 60 months

| Case | Weight | Core assumptions | Implied value | Return / CAGR |
|---|---:|---|---:|---:|
| Bear | 25% | Supply responds; uranium normalizes to US$60–70/lb; project setbacks persist | $60 | -38.6% / -9.3% |
| Base | 50% | Contracting supports attractive realized prices; fuel services and Westinghouse compound | $145 | +48.4% / +8.2% |
| Bull | 25% | Durable Western supply deficit plus successful reactor build cycle | $230 | +135.3% / +18.7% |

Probability-weighted working value: approximately **$145**, or **8.2% annualised**. At today's price, CCJ is more useful as a small factor diversifier and asymmetric nuclear option than as a large base-case return engine.$pf$,
  catalysts = $pf$- New long-term uranium and conversion contracts at prices and terms that improve portfolio realized-price sensitivity.
- Owned production meeting the 19.5–21.5M lb outlook with lower reliance on high-cost market purchases.
- Cigar Lake and McArthur River/Key Lake operating reliably after maintenance or third-party processing disruptions.
- Uranium realized prices moving toward or above the C$91–96/lb outlook while unit costs normalize.
- Westinghouse delivering the US$370–430M 2026 adjusted-EBITDA range for Cameco's share.
- Definitive U.S. AP1000 agreements, additional international new-build awards, or higher-margin fuel/service contracts.
- Distributions from Westinghouse and JV Inkai converting equity earnings into parent cash.$pf$,
  risks = $pf$- **Valuation:** the current market value embeds a strong uranium price, successful contracting and meaningful Westinghouse growth.
- **Commodity cycle:** uranium prices and contracting can reverse as supply, inventories, enrichment or policy conditions change.
- **Operational concentration:** Cigar Lake, McArthur River/Key Lake and third-party mills create outage and logistics risk.
- **Cost mismatch:** market purchases and product loans can cost substantially more than internally produced pounds.
- **Contract structure:** ceilings and delivery timing can cause realized prices and cash flow to lag spot-market enthusiasm.
- **Kazakhstan exposure:** JV Inkai production, transport, dividends and regulation add geopolitical and timing risk.
- **Westinghouse execution:** new-build projects require financing, partners, permits and disciplined project delivery; equity earnings do not equal parent cash.
- **Currency and regulation:** U.S.-dollar sales, Canadian-dollar costs, environmental obligations, tax disputes and nuclear policy affect results.$pf$,
  invalidation = $pf$## Warning — investigate and freeze additions

- Owned production tracks below the **19.5M lb** low end or unit cost of sales remains above **C$70/lb** without a temporary maintenance explanation.
- Contracting slows, realized-price sensitivity deteriorates, or market purchases exceed plan without offsetting economics.
- Westinghouse's expected 2026 contribution moves below **US$370M adjusted EBITDA** for Cameco's share.
- The share price rises faster than uranium contract prices and cash-flow revisions, expanding the valuation disconnect.

## Reduce — normally trim 25–50%

- Uranium production, sales-volume or realized-price guidance is reduced by more than **10%**.
- A core operation suffers an outage that materially impairs twelve-month delivery coverage or forces uneconomic replacement purchases.
- Uranium gross margin remains below **20%** for two quarters despite supportive market prices.
- Westinghouse misses its annual adjusted-EBITDA range by more than **15%** or consumes material incremental owner capital.
- Net debt rises materially to fund operating shortfalls, acquisitions or new-build exposure rather than value-accretive capacity.

## Invalidate — exit unless a documented exception is approved

- A multi-year impairment or loss of a tier-one uranium asset prevents Cameco from meeting contract commitments economically.
- Contract discipline breaks: long-duration volumes are committed at terms that destroy upside or require structurally loss-making purchases.
- Westinghouse experiences a major project loss, regulatory failure or capital requirement that materially impairs Cameco's investment.
- Nuclear policy, reactor closures and utility contracting enter a structural multi-year reversal rather than a cyclical pause.
- Accounting, reserve, environmental, tax or joint-venture evidence makes reported asset value or cash conversion unreliable.$pf$,
  competitive_notes = $pf$Cameco's advantage is the combination of large, high-grade Canadian resources, licensed conversion/fuel capability, a long utility contracting history, and Westinghouse's reactor-service and fuel footprint. Few public companies provide comparable exposure across uranium, conversion, fabrication, services and reactor technology.

Competition and customer alternatives still matter. Kazatomprom is the largest low-cost uranium producer, Orano spans mining and fuel-cycle services, and utilities can use inventories, secondary supplies and alternative contract structures. Cameco's scarcity value is real, but commodity economics and customer bargaining power remain; the company should not be valued as a monopoly or as a simple proxy for spot uranium.$pf$,
  next_diligence = $pf$1. Build a five-year contract-delivery model showing base-escalated versus market-related pricing, ceilings/floors and annual volume ranges.
2. Reconcile owned production, Inkai purchases, market purchases, product loans, inventory and deliveries by quarter.
3. Track Cigar Lake and McArthur River/Key Lake production, unit costs, maintenance and third-party processing constraints.
4. Separate Westinghouse core services/fuel EBITDA from new-build milestones; track distributions, capex and owner funding.
5. Stress-test CCJ at uranium prices of US$60, $80, $100 and $130/lb with Canadian-dollar and purchase-cost sensitivities.
6. Refresh scenarios after Q3 2026 and every material contracting, production or AP1000 update; keep discovery sizing until the base-case return clears PowerFund's hurdle.

**Next scheduled review:** Q3 2026 results; earlier following a production outage, major contract, Westinghouse funding request or uranium-price dislocation.$pf$,
  source = $pf$Primary sources verified through 15 August 2026:

- [Cameco Q2 2026 results release](https://www.cameco.com/media/news/cameco-reports-2026-second-quarter-results), 31 July 2026.
- [Cameco Q2 2026 MD&A and financial statements](https://www.cameco.com/sites/default/files/documents/2026-Q2-MDA-FS-Notes_0.pdf), including production, realized prices, costs, outlook, balance sheet and Westinghouse results.
- [Cameco 2025 annual report](https://www.cameco.com/invest/financial-information/annual-reports/2025), including long-term uranium and conversion commitments and Westinghouse strategy.
- Market-price input: US$97.74 close on 14 August 2026; refresh all scenario returns before a new capital decision.

All 24/60-month scenario assumptions, probabilities and implied values are PowerFund calculations, not company guidance or analyst consensus.$pf$
from public.instruments as i
where d.instrument_id = i.id
  and i.symbol = 'CCJ';

do $verify$
begin
  if (select count(*)
      from public.dossiers d
      join public.instruments i on i.id = d.instrument_id
      where i.symbol in ('ISRG', 'LMT', 'BWXT', 'CCJ')
        and d.status = 'investigate'::public.dossier_status
        and d.summary like '%Primary-source verified through Q2 2026%') <> 4 then
    raise exception 'Post-update verification failed for one or more of ISRG, LMT, BWXT, CCJ';
  end if;
end
$verify$;

commit;
