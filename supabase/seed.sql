insert into public.themes (slug, name, description, is_core, sort_order)
values
  (
    'ai-infrastructure',
    'AI Infrastructure',
    'Compute, networking, memory/storage, data centers, and supply chain behind AI demand.',
    true,
    1
  ),
  (
    'energy',
    'Energy',
    'Power generation, grid, and fuels that constrain AI and electrification.',
    true,
    2
  ),
  (
    'robotics-ai',
    'Robotics and AI',
    'Industrial automation, embodied AI, and robotics commercialization.',
    true,
    3
  ),
  (
    'defence',
    'Defence',
    'Defence programs, drones, autonomy, and related industrial capacity.',
    true,
    4
  ),
  (
    'other',
    'Other',
    'Opportunities outside core themes that clear the evidence bar.',
    false,
    99
  )
on conflict (slug) do update
set
  name = excluded.name,
  description = excluded.description,
  is_core = excluded.is_core,
  sort_order = excluded.sort_order;

-- Starter research universe (watchlist). Not recommendations — process fuel.
with starter (symbol, name, asset_class, theme_slug, notes) as (
  values
    ('NVDA', 'NVIDIA', 'equity', 'ai-infrastructure', 'Accelerators / AI compute'),
    ('AVGO', 'Broadcom', 'equity', 'ai-infrastructure', 'Networking / custom silicon'),
    ('TSM', 'Taiwan Semiconductor', 'equity', 'ai-infrastructure', 'Leading-edge foundry'),
    ('AMD', 'Advanced Micro Devices', 'equity', 'ai-infrastructure', 'GPUs / CPUs'),
    ('ANET', 'Arista Networks', 'equity', 'ai-infrastructure', 'Data-center networking'),
    ('VRT', 'Vertiv', 'equity', 'ai-infrastructure', 'Thermal / power for data centers'),
    ('EQIX', 'Equinix', 'equity', 'ai-infrastructure', 'Interconnection / colo'),
    ('SMCI', 'Super Micro Computer', 'equity', 'ai-infrastructure', 'AI server systems'),
    ('CLS', 'Celestica', 'equity', 'ai-infrastructure', 'AI servers / networking EMS-ODM'),
    ('NBIS', 'Nebius', 'equity', 'ai-infrastructure', 'Specialized AI cloud / neocloud'),
    ('CRDO', 'Credo Technology', 'equity', 'ai-infrastructure', 'High-speed connectivity'),
    ('ALAB', 'Astera Labs', 'equity', 'ai-infrastructure', 'AI rack-scale connectivity'),
    ('IREN', 'IREN', 'equity', 'ai-infrastructure', 'Power + AI cloud buildout'),
    ('CRWV', 'CoreWeave', 'equity', 'ai-infrastructure', 'GPU cloud / neocloud leader'),
    ('MRVL', 'Marvell Technology', 'equity', 'ai-infrastructure', 'Custom AI silicon / optical'),
    ('NVT', 'nVent Electric', 'equity', 'ai-infrastructure', 'Liquid cooling / rack power infrastructure'),
    ('MU', 'Micron Technology', 'equity', 'ai-infrastructure', 'HBM / DRAM / AI memory'),
    ('SKHY', 'SK hynix', 'equity', 'ai-infrastructure', 'HBM / DRAM — house ticker SKHY; Yahoo/KRX listing 000660.KS'),
    ('SNDK', 'Sandisk', 'equity', 'ai-infrastructure', 'NAND / AI storage / HBF optionality'),
    ('LITE', 'Lumentum', 'equity', 'ai-infrastructure', 'Optical interconnect — watch after correction'),
    ('COHR', 'Coherent', 'equity', 'ai-infrastructure', 'Optical / photonics — watch after correction'),
    ('CEG', 'Constellation Energy', 'equity', 'energy', 'Nuclear / clean firm power'),
    ('VST', 'Vistra', 'equity', 'energy', 'Power generation / retail'),
    ('GEV', 'GE Vernova', 'equity', 'energy', 'Grid / generation equipment'),
    ('CCJ', 'Cameco', 'equity', 'energy', 'Uranium fuel cycle'),
    ('ETN', 'Eaton', 'equity', 'energy', 'Electrical / data-center power'),
    ('PWR', 'Quanta Services', 'equity', 'energy', 'Grid infrastructure services'),
    ('HUBB', 'Hubbell', 'equity', 'energy', 'Grid-to-chip electrical infrastructure'),
    ('EME', 'EMCOR Group', 'equity', 'energy', 'Mission-critical electrical / mechanical construction'),
    ('BWXT', 'BWX Technologies', 'equity', 'energy', 'Nuclear manufacturing / fuel — watch valuation'),
    ('POWL', 'Powell Industries', 'equity', 'energy', 'Switchgear / electrical distribution — watch valuation'),
    ('ISRG', 'Intuitive Surgical', 'equity', 'robotics-ai', 'Surgical robotics'),
    ('TER', 'Teradyne', 'equity', 'robotics-ai', 'Automation / test'),
    ('ROK', 'Rockwell Automation', 'equity', 'robotics-ai', 'Industrial automation'),
    ('PATH', 'UiPath', 'equity', 'robotics-ai', 'Software automation'),
    ('NOVT', 'Novanta', 'equity', 'robotics-ai', 'Precision motion / force sensing / robot tooling'),
    ('AMBA', 'Ambarella', 'equity', 'robotics-ai', 'Edge-AI SoCs for robots / drones / vision'),
    ('OUST', 'Ouster', 'equity', 'robotics-ai', 'LiDAR / perception — higher risk'),
    ('LMT', 'Lockheed Martin', 'equity', 'defence', 'Prime contractor'),
    ('RTX', 'RTX', 'equity', 'defence', 'Aerospace & defense'),
    ('NOC', 'Northrop Grumman', 'equity', 'defence', 'Prime / autonomous systems'),
    ('GD', 'General Dynamics', 'equity', 'defence', 'Platforms / munitions'),
    ('AVAV', 'AeroVironment', 'equity', 'defence', 'Loitering munitions / UAS'),
    ('KTOS', 'Kratos Defense', 'equity', 'defence', 'Unmanned / rocket support'),
    ('MRCY', 'Mercury Systems', 'equity', 'defence', 'Secure rugged edge compute / RF'),
    ('TDY', 'Teledyne Technologies', 'equity', 'defence', 'EO/IR sensing / drones / robotics')
),
upserted as (
  insert into public.instruments (symbol, name, asset_class, exchange, status, notes)
  select
    s.symbol,
    s.name,
    s.asset_class::public.asset_class,
    'US',
    'watchlist',
    s.notes
  from starter s
  on conflict (symbol, exchange) do update
    set
      name = excluded.name,
      asset_class = excluded.asset_class,
      status = excluded.status,
      notes = excluded.notes,
      updated_at = timezone('utc', now())
  returning id, symbol
)
insert into public.instrument_themes (instrument_id, theme_id, is_primary)
select
  u.id,
  t.id,
  true
from upserted u
join starter s on s.symbol = u.symbol
join public.themes t on t.slug = s.theme_slug
on conflict (instrument_id, theme_id) do update
  set is_primary = excluded.is_primary;

update public.instruments
set data_symbol = '000660.KS'
where symbol = 'SKHY';

-- Stub dossiers from OpenAI research review (Aug 2026). Verify before capital.
insert into public.dossiers (
  instrument_id,
  status,
  summary,
  thesis,
  catalysts,
  risks,
  invalidation,
  competitive_notes,
  next_diligence,
  source
)
select
  i.id,
  d.status::public.dossier_status,
  d.summary,
  d.thesis,
  d.catalysts,
  d.risks,
  d.invalidation,
  d.competitive_notes,
  d.next_diligence,
  d.source
from (
  values
    (
      'CLS',
      'investigate',
      'Valuation/growth outlier in AI hardware manufacturing: consensus implies very high FY26–27 revenue growth at low forward sales/earnings multiples versus semis. Best forensic candidate in the eight-name AI-infra screen — not automatically the best business.',
      'Celestica is moving up the value chain from commodity EMS into AI servers, 1.6T switching, rack-scale systems and hyperscaler programs. If growth holds and the multiple gap vs proprietary semis partially closes, equity upside can be large from ~$37B-class market cap. Structurally lower margins than ALAB/CRDO are expected; the debate is whether ~1× next-year sales understates durable program wins.',
      'Hyperscaler AI rack/switch program ramps; raised FY26 guidance path; evidence that design wins stick through 2026–27 cycles; margin stability while scaling.',
      'Top-10 customers ~79% of revenue historically; largest customers can rebid programs (Quanta/Wiwynn/Foxconn/Jabil/Accton). Thin manufacturing margins. Growth must normalize. Fresh equity dilution (~$3.45B offering cited Aug 2026) may still be adjusting share-count models. Not a buy-and-forget franchise.',
      'Major hyperscaler program loss; growth decelerates sharply without multiple support; gross margins compress below thesis band; competitive displacement on next hardware generation.',
      'Competitors: Quanta, Wiwynn, Foxconn, Jabil, Flex, Accton; indirect OEM overlap with ANET/Cisco on white-box/custom switching. Moat = engineering + design wins + execution, not structural monopoly. 1y risk lower (qualified programs); 2–5y risk rises each design cycle. Hyperscaler bargaining power is the central durability issue.',
      'Verify top-customer concentration and MSA/volume language in latest 10-K; confirm consensus FY26/FY27 and post-offering share count; map program lifecycle vs Quanta/Wiwynn attack surface.',
      'OpenAI agent screen + Power Fund review (Aug 2026) — unverified consensus'
    ),
    (
      'VRT',
      'investigate',
      'Highest-quality compounder in the screen: power, thermal, liquid cooling and services for AI factories. GPU-agnostic demand (power + heat). Stronger moat than CLS/NBIS; valuation richer but easier to justify on FCF and balance-sheet trajectory.',
      'AI racks raise power density and cooling difficulty. Vertiv sells the electrical + thermal + rack + service stack. Consensus ~$14B → ~$18B revenue with rising FCF and a path toward larger net cash. Prefer as core AI-infra holding over neocloud leverage stories. Not “cheap,” but superior risk-adjusted compounding vs 60–100× semis.',
      'Liquid-cooling adoption; AI power architecture transitions (incl. higher-voltage architectures); share gains vs Schneider/Eaton; service attach and installed-base expansion.',
      'Schneider (Motivair liquid cooling) and Eaton (power / HVDC / NVIDIA reference architectures) are serious strategic threats. Multiple compression if growth normalizes. Still pays a quality premium (~30× forward earnings class in the note).',
      'Sustained share loss in liquid cooling or AI power to Schneider/Eaton; organic growth collapses while multiple stays elevated; service/reliability franchise visibly erodes.',
      'Competitors: Schneider, Eaton, Legrand, Huawei; specialists Delta, STULZ, JCI, Socomec. Moat = full stack + installed base + ~global service footprint; switching costs high vs server EMS. Market still supply-constrained near term — multiple winners can grow. Best 5y durability of CLS/VRT/NBIS set.',
      'Market share vs Schneider/Eaton specifically in liquid cooling and AI power; organic vs price growth mix; service attach rates.',
      'OpenAI agent screen + Power Fund review (Aug 2026) — unverified consensus'
    ),
    (
      'NBIS',
      'investigate',
      'Highest-asymmetry neocloud bet in the screen: extraordinary consensus revenue ramp with extreme capex, negative FCF and rising net debt. Customer contracts (e.g. Microsoft/Meta cited) support near-term demand; long-term economics of independent GPU cloud remain the hard question.',
      'If Nebius scales into a large AI infrastructure platform and monetizes GPU/data-center assets at attractive returns, equity value can re-rate hard from ~$47B-class cap. Thesis is financing + utilization + multi-year contracted demand — not a clean FCF compounder. Size only where 50–70% drawdown is survivable.',
      'Contracted revenue conversion; GPU cluster utilization; evidence of improving unit economics vs CoreWeave; funding without punitive dilution.',
      'Capex tens of $B/year and deeply negative FCF in consensus paths. Competes with CoreWeave/Crusoe/Lambda and AWS/GCP/Azure/Oracle. Custom silicon (Trainium/TPU/Maia) may commoditize rented NVIDIA capacity over 5y. Hyperscalers are both customers and future substitutes. Financing cost and hardware obsolescence can crush equity even if revenue grows.',
      'Contract pipeline stalls; utilization/pricing weakens; financing becomes punitive; unit economics clearly lose to CoreWeave or hyperscaler internal capacity.',
      'Challenger, not incumbent. CoreWeave currently framed as larger specialized AI cloud. Near-term moat = contracts + NVIDIA relationship; 5y risk high as AI compute supply normalizes and cost/token matters more than GPU scarcity. Microsoft as customer and competitor is a double-edged dynamic.',
      'Unit economics per GPU vs CoreWeave/AWS; contract duration and take-or-pay characteristics; detailed capex funding plan and leverage path.',
      'OpenAI agent screen + Power Fund review (Aug 2026) — unverified consensus'
    ),
    (
      'NVT',
      'investigate',
      'Clearest watchlist omission vs Vertiv: liquid cooling, power distribution, enclosures and electrical protection for AI racks. Smaller market cap (~$27B class in research note) and less heroic valuation than many AI-infra names while data-center sales are ramping hard.',
      'As rack power density rises, getting electricity in and heat out becomes a physical constraint (CDUs, cold plates, manifolds, busbars, grounding, cabling). nVent is already shipping liquid-cooling capacity and participating in NVIDIA/Siemens reference architectures. Prefer as under-the-radar complement to VRT (higher-quality incumbent), not a substitute.',
      'Data-center revenue trajectory (> $2B 2026 cited); liquid-cooling attach; share in NVIDIA reference designs; evidence of sticky hyperscaler/OEM programs.',
      'Schneider, Eaton and Vertiv are formidable competitors. Cooling architecture can shift (e.g. less traditional chiller reliance). Multiple compression if growth normalizes.',
      'Sustained DC growth stall; clear share loss in liquid cooling/power to VRT/Schneider/Eaton; architecture shift that strand nVent''s deployed stack.',
      'Moat = physical integration + installed base + qualification, not a pure monopoly. Complements rather than replaces VRT in the book thesis.',
      'Verify DC sales mix and guidance in latest filings; map competitive position vs Vertiv/Schneider liquid cooling; confirm valuation multiples vs growth.',
      'OpenAI agent expansion screen + Power Fund triage (Aug 2026) — unverified'
    ),
    (
      'MRCY',
      'investigate',
      'Most interesting non-obvious defence add: secure rugged high-performance compute and RF/signal processing at the tactical edge. ~$6.5B-class turnaround with strong bookings; GAAP loss means conventional P/E is not the frame.',
      'Military platforms cannot drop in commodity GPUs. Mercury sells qualified silicon-to-systems compute for sensors, EW, missiles and aircraft. Design-in + requalification creates switching costs. Setup = rising edge-AI defence demand + depressed financial history; FY results are a near-term checkpoint.',
      'Bookings/backlog conversion; margin recovery; large CPA/secure-server production orders converting to revenue; clear path to sustainable FCF.',
      'Execution turnaround risk remains elevated. Program timing and DoD budget politics. Competition from primes and other embedded suppliers.',
      'Bookings collapse; margins fail to recover after multiple quarters; loss of key platform design-ins; financing/dilution becomes punitive.',
      'Moat candidates: security certification, ruggedization, program lock-in. Not a prime — subsystem specialist. Higher asymmetry than LMT/RTX/NOC.',
      'Read latest 10-K/10-Q for backlog quality and margin bridge; verify largest programs and customer concentration; assess Aug/FY results vs turnaround thesis.',
      'OpenAI agent expansion screen + Power Fund triage (Aug 2026) — unverified'
    ),
    (
      'HUBB',
      'investigate',
      'Boring-on-purpose electrical infrastructure from grid to chip: connectors, grounding, T&D hardware, protection and power distribution. Quality second-order AI power play; not a 10× lottery ticket.',
      'AI campuses need utility-grade electrical gear with certification, reliability and installed-base relationships. Hubbell monetizes the physical chain between generation/transmission and the rack. Think durable 2–3× compounder potential if DC/utility spend stays elevated — not NBIS-style asymmetry.',
      'Sustained data-center sales growth; utility CapEx cycle; organic growth with stable margins; evidence of share in grid-to-rack SKUs.',
      'Valuation already fair/full (~30× class cited). Not explosive upside. Cyclical utility CapEx; competition across electrical OEMs.',
      'DC growth fades while multiple stays elevated; organic growth turns negative; margin structure breaks.',
      'Moat = certification + utility relationships + installed base. Downside easier to underwrite than neoclouds; upside capped vs speculative AI names.',
      'Verify DC vs utility mix; compare valuation vs ETN/PWR/GEV; confirm organic vs acquisition growth.',
      'OpenAI agent expansion screen + Power Fund triage (Aug 2026) — unverified'
    ),
    (
      'EME',
      'investigate',
      'Non-obvious AI beneficiary: mission-critical electrical/mechanical construction and services for data centers and fabs. Scarcity is skilled labor, bonding capacity and hyperscaler execution track record — organizational moat, not IP.',
      'Even with chips, transformers and cooling equipment secured, someone must build and commission hundreds-of-MW facilities. EMCOR''s backlog and DC/industrial mix make it a picks-and-shovels play on AI factory construction capacity.',
      'Record backlog conversion; DC/semiconductor project mix; margin stability on large projects; evidence of hyperscaler repeat work.',
      'Construction cyclicality and bid risk; labor inflation; project execution miss; valuation already reflecting AI narrative (~25× class cited).',
      'Backlog rolls over without replacement; major project write-downs; DC mix collapses while multiple stays high.',
      'Moat = people + processes + bonding + relationships. Hard to scale quickly — that is the point. Less explosive than silicon, clearer downside than microcaps.',
      'Parse backlog by end-market; review project margin trends; compare vs other specialty contractors.',
      'OpenAI agent expansion screen + Power Fund triage (Aug 2026) — unverified'
    ),
    (
      'NOVT',
      'investigate',
      'Robotics picks-and-shovels upgraded on evidence: Q2 2026 delivered 9% organic growth, bookings +18% YTD (book-to-bill 1.1), and the first significant humanoid servo-drive orders beyond prototyping — hundreds of humanoids for customer training facilities. The quality US-listed vehicle for the robotics theme; valuation remains the gating issue.',
      'If industrial/warehouse/humanoid robots scale, OEMs need qualified precision motion, encoders, force/torque sensing and tooling. Design-in creates switching costs (mechanical, software, safety, calibration). GenAI-linked applications are already ~17% of revenue growing ~25%; humanoid orders moved from prototype to training-center scale in Q2 2026. FY26 raised: revenue ~$1.13–1.14B (>15% reported, up to 7% organic), adj EBITDA $273–278M (+24–26%). Riverpoint Medical (largest acquisition ever, closed Jul 2026) shifts mix toward minimally invasive surgery.',
      'Humanoid servo-drive orders converting to commercial-deployment revenue; robotics/automation growth (+13.5% Q2) sustaining; GenAI-linked ~25% growth through H2; Riverpoint integration; Q3 guide $300–304M revenue with gross margin path to 48%.',
      'Valuation still full; humanoid commercialization timeline uncertain (mgmt: rapidly improving but from a small base); integration risk on largest-ever acquisition; organic growth only up to 7% FY26 — reported growth flattered by M&A; cyclical semicap exposure.',
      'Humanoid/robotics bookings momentum stalls (book-to-bill below 1 for two quarters); organic growth reverts to low single digits with the multiple elevated; Riverpoint integration misses on margin or leverage; loss of key OEM design-ins.',
      'Moat = component qualification into OEM platforms. NVIDIA partnership on humanoid safety is a positioning signal. Better vehicle than pre-profit AMBA/OUST for the robotics sleeve; the deepest robotics component moats (Harmonic Drive, Nabtesco, Keyence) are Japan-listed — NOVT is the practical US expression.',
      'Quantify humanoid order size and margin profile; reconcile GAAP vs adjusted EPS post-acquisition; post-Riverpoint leverage and share count; valuation vs raised FY26 EBITDA.',
      'Q2 2026 earnings call + releases (6 Aug 2026) + PowerFund strategy second opinion — verify multiples before capital'
    ),
    (
      'AMBA',
      'watch',
      'Small-cap (~$3.6B class) edge-AI SoC optionality for robots, drones, vehicles and cameras. Higher-risk / higher-optionality than infrastructure compounders.',
      'Physical AI needs local perception — edge inference, not 100ms round-trips to the cloud. Ambarella sells low-power vision/AI silicon with cited robotics design wins. Thesis is category optionality, not entrenched infrastructure monopoly.',
      'Robotics design-win conversion to revenue; edge-AI mix; gross margin path to sustained profitability.',
      'Competes with much larger semiconductor companies. Still loss-making in the research framing. Product cycles and customer concentration risk.',
      'Design wins fail to convert; cash burn accelerates; larger semis take the sockets.',
      'Weaker structural moat than NVT/HUBB. Classify as speculative robotics/AI sleeve — size only as optionality.',
      'Verify design-win count and lifetime revenue claims; path to GAAP profitability; competitive socket losses/wins.',
      'OpenAI agent expansion screen + Power Fund triage (Aug 2026) — unverified'
    ),
    (
      'OUST',
      'watch',
      'Digital LiDAR + perception (incl. cameras via StereoLabs) for robots, industrial vehicles, infrastructure and counter-UAS. Watchlist, not chase — stock already moved hard in research note.',
      'Potential “eyes of physical AI” if digital LiDAR wins share in autonomy and industrial automation. Improving revenue growth and gross margin cited; category remains competitive and capital hungry.',
      'Sensor shipments; automotive/robotics design wins; path to sustained free cash flow.',
      'Lidar competition; prior valuation spikes; capital needs; technology substitution (cameras/radar).',
      'Gross margins collapse; cash burn forces dilutive raises; major OEM losses.',
      'Higher-risk physical-AI peripheral. Prefer watching for better entry over initiating at momentum prices.',
      'Cash runway and dilution history; customer concentration; competitive win/loss vs Hesai/Luminar/etc.',
      'OpenAI agent expansion screen + Power Fund triage (Aug 2026) — unverified'
    ),
    (
      'TDY',
      'watch',
      'Safer defence sensing pick: Teledyne FLIR EO/IR, thermal, nano-UAS (Black Hornet) and related systems. Picks-and-shovels for autonomous warfare vs betting on a single cheap drone OEM.',
      'High-quality electro-optical/IR sensing and small UAS are recurring inputs across platforms and counter-UAS. Prefer long-term ownership of sensing franchises over predicting which $20k drone airframe wins.',
      'Export/counter-UAS orders; FLIR integration wins; robotics/autonomy attach; steady compound earnings growth.',
      'Not explosive vs KTOS/AVAV-style names. Defence budget politics; ~30×-class valuation leaves less margin of safety.',
      'Sensing franchise share loss; major program cancellations; multiple stays high as growth slows.',
      'Higher quality / lower asymmetry than MRCY. Complements primes and UAS names already on the book.',
      'Segment margins and backlog; Black Hornet / counter-UAS contribution; valuation vs peers.',
      'OpenAI agent expansion screen + Power Fund triage (Aug 2026) — unverified'
    ),
    (
      'SKHY',
      'watch',
      'US-listed ADR for SK hynix — currently framed as the HBM share leader vs Micron/Samsung. Core AI-memory exposure under the AI infrastructure theme (soft memory sleeve cap in mandate).',
      'HBM is an oligopoly bottleneck for AI accelerators. SK hynix has been the share leader with deep NVIDIA relationships. Prefer as memory-core alongside MU rather than treating NAND names as substitutes.',
      'HBM share and pricing; HBM4/HBM4E ramp; DRAM/HBM mix; capital returns vs reinvestment.',
      'Memory cycle risk; Korean ADR liquidity/FX; Samsung competitive response; China capacity over medium term.',
      'HBM pricing collapses; share loss to MU/Samsung; ADR structure or geopolitics impairs access.',
      'Strongest pure HBM story in the US-listed set per research. Still a cycle business — size inside AI-memory soft cap.',
      'Confirm ADR ticker liquidity and filings path; HBM revenue disclosure; competitive share data sources.',
      'OpenAI agent memory screen + Power Fund triage (Aug 2026) — unverified'
    ),
    (
      'MU',
      'watch',
      'Micron: diversified HBM + DRAM + NAND AI-memory play. Challenger on HBM share with broader portfolio than pure HBM leadership narratives.',
      'If Micron keeps taking HBM share while monetizing DRAM/NAND for AI servers and storage, it is a diversified way to own AI memory. Pair with SKHY as core memory sleeve; not a substitute for SNDK''s NAND/HBF bet.',
      'HBM bit growth and margins; data-center mix; CapEx discipline through the cycle.',
      'Classic memory cyclicality; trailing multiples can mislead at peaks; competitive oligopoly dynamics.',
      'HBM ramp disappoints; severe downcycle with stretched balance sheet; structural share loss.',
      'Core memory sleeve candidate with cycle discipline. Counts toward AI infra + soft 15% memory sleeve.',
      'Split HBM vs other memory profits; net cash/debt through cycle; compare valuation vs SKHY on HBM exposure.',
      'OpenAI agent memory screen + Power Fund triage (Aug 2026) — unverified'
    ),
    (
      'SNDK',
      'watch',
      'Sandisk: AI NAND/storage + High Bandwidth Flash (HBF) optionality. After a sharp drawdown from ATH, research framed ~starter-zone valuation — still verify cycle vs structural earnings.',
      'AI data-center SSD demand and long-term customer agreements may raise the earnings floor vs old NAND boom/bust. HBF (with SK hynix via OCP) is a wildcard inference-memory tier. Bet is structurally higher earnings power, not that current peak margins are permanent.',
      'Investor Day / LTA detail; HBF sample and design timeline; DC NAND pricing/mix; FCF conversion.',
      'NAND pricing mean-reversion; weaker moat than HBM oligopoly; Kioxia is both partner and competitor; Chinese NAND capacity.',
      'LTAs fail to protect pricing; HBF slips or is irrelevant; normalized EPS collapses toward prior-cycle levels while multiple stays optimistic.',
      'Higher-beta memory/storage sleeve. Prefer smaller size than SKHY/MU until HBF and LTA durability are clearer.',
      'Read Investor Day materials; stress-test EPS at mid-cycle margins; map competitive set (Samsung, Kioxia, Solidigm, MU).',
      'OpenAI agent memory screen + Power Fund triage (Aug 2026) — unverified'
    ),
    (
      'BWXT',
      'watch',
      'Exceptional nuclear/defence manufacturing moat (naval reactors, fuel, microreactors) — but research flags valuation already discovered. Watch for better entry, do not chase.',
      'US naval nuclear and advanced reactor manufacturing is extremely hard to displace. Thesis quality is high; timing is the issue after a large re-rating.',
      'Pullback with thesis intact; Project Pele / microreactor milestones; fuel/manufacturing backlog.',
      'Paying peak narrative multiples; program delays; political budget risk.',
      'Multiple stays elevated as growth normalizes; major program setback.',
      'Strong watchlist, weak chase candidate at cited valuation.',
      'Revisit on 20–30% drawdown; verify backlog and segment margins.',
      'OpenAI agent expansion screen + Power Fund triage (Aug 2026) — unverified'
    ),
    (
      'POWL',
      'watch',
      'Powell: switchgear and electrical distribution with explosive AI data-center order growth cited — market has noticed. Excellent bottleneck, less obvious entry.',
      'Electrical distribution equipment is scarce relative to AI campus buildout. Record orders/backlog support the thesis; valuation after the rally requires patience.',
      'Order intake durability; backlog conversion margins; evidence of multi-year DC program coverage.',
      'Late-cycle multiple; customer concentration; competition from larger electrical OEMs.',
      'Orders cliff; margin miss on rush jobs; multiple compression with growth.',
      'Monitor for correction; do not treat as fresh underfollowed idea.',
      'Order book quality vs one-off spikes; peer valuation vs HUBB/ETN.',
      'OpenAI agent expansion screen + Power Fund triage (Aug 2026) — unverified'
    ),
    (
      'LITE',
      'watch',
      'Optical connectivity bottleneck for AI clusters — strategically important, already aggressively discovered in price per research note. Watchlist after correction only.',
      'AI scale-up needs high-speed optics. Lumentum is a core way to own that bottleneck, but chasing after multi-bagger moves violates the parabolic filter.',
      'Pullback with hyperscaler optics demand intact; share in next-gen optical modules.',
      'Crowded trade; valuation; competition from COHR and others; CapEx pause risk.',
      'AI optics demand air-pocket; share loss; multiple collapse.',
      'Own the theme idea; wait for price. Counts toward AI infra concentration if initiated.',
      'Re-enter only with valuation discipline; map vs COHR product cycles.',
      'OpenAI agent expansion screen + Power Fund triage (Aug 2026) — unverified'
    ),
    (
      'COHR',
      'watch',
      'Coherent: photonics/optics for AI interconnect — same “great bottleneck, late tape” bucket as LITE. Watch, do not chase.',
      'Optical and photonic components are central to AI networking. Business quality may be fine; entry timing is the mandate issue after a huge re-rating.',
      'Meaningful drawdown with orders still growing; clearer earnings power vs trailing multiple noise.',
      'Stretched valuation; cyclical optics; competitive module market.',
      'Demand pause; inventory correction; multiple remains disconnected from mid-cycle earnings.',
      'Pair with LITE on the optical watchlist; initiate only with margin of safety.',
      'Normalize earnings power; compare product exposure vs LITE; wait for better risk/reward.',
      'OpenAI agent expansion screen + Power Fund triage (Aug 2026) — unverified'
    ),
    (
      'CCJ',
      'investigate',
      'Full nuclear fuel-cycle exposure (uranium mining + 49% of Westinghouse): the best diversifier inside the mandate — loads on nuclear buildout and fuel contracting, not directly on hyperscaler capex sentiment. Q2 2026 optically weak (prior-year Westinghouse Dukovany one-time), but pricing is strengthening: realized $93.13/lb (+15%), FY26 realized-price guidance raised to $91–96/lb.',
      'Structural uranium deficit + western supply discipline + nuclear restart/newbuild cycle. Contract book: >28M lb/yr average deliveries over five years; new market-related contracts carry floors in the high-$70s and ceilings near $160 (escalated). Long-term price in the mid-$90s and likely heading to three digits before replacement-rate contracting has even begun. Westinghouse adds AP1000/AP300/eVinci optionality (91-reactor pipeline; conditional $17.5B DOE support). Net cash balance sheet (~$116M net cash, $1.1B cash).',
      'Term price momentum toward $100+; contracting cycle reaching replacement rate; Westinghouse newbuild awards (Dukovany-style contributions); production execution at McArthur River / Cigar Lake; utilities re-contracting as data-center PPAs raise coverage needs.',
      'Operational disruptions are routine (Key Lake and Cigar Lake outages in 2026); quarterly delivery lumpiness confuses the tape; uranium spot corrections; Westinghouse project timing; Kazatomprom supply response; FX.',
      'Long-term uranium price rolls over materially with contracting stalling; sustained production misses break unit economics; Westinghouse pipeline fails to convert (no new AP1000-class orders in 18–24 months); balance sheet re-levers without offsetting growth.',
      'Western fuel-cycle champion vs Kazatomprom; geopolitics favor western supply. Enrichment (Centrus, Urenco) is a separate bottleneck not covered here. Counts as a genuine diversifier under mandate rule 10 — correlation to the AI-capex complex is indirect (nuclear policy, utility contracting).',
      'Contract book sensitivity to spot vs term pricing; 2027+ delivery commitments vs production plan; Westinghouse EBITDA seasonality; Inkai JV status.',
      'Q2 2026 results + call (Aug 2026) + PowerFund strategy second opinion — verify before capital'
    ),
    (
      'CEG',
      'investigate',
      'Largest US clean-power fleet (nuclear + Calpine gas) monetizing the scarcity of firm clean energy. Q2 2026 adj operating EPS $2.55 (+34%), FY26 guidance raised to $11.50–12.50. Signed 920 MW of new 15–20yr nuclear PPAs with investment-grade customers (incl. 176 MW Walmart) starting 2029–2032. The premium-quality expression of the generation side of the #1 theme.',
      'Data-center and electrification demand reprices firm clean power, and CEG owns the scarce asset: a ~93% capacity-factor nuclear fleet, now paired with Calpine dispatchable gas. Long-term PPAs (~1GW signed within the contemplated range) convert scarcity into visible contracted earnings; the Crane restart (2027) adds capacity; $2.2B of YTD buybacks compound per-share value.',
      'PJM/FERC large-load rule clarity unlocking further data-center contracts; additional nuclear PPAs and uprates; Crane restart milestones into 2027; Calpine integration synergies; capacity auction pricing.',
      'Premium multiple prices much of this in — run the crowding checklist before entry; regulatory gating on colocation/large-load rules; heavy planned nuclear outage schedules; $19.1B long-term debt post-Calpine; policy risk on ZEC-style programs; new PPAs start 2029+ so visibility is not near-term earnings.',
      'PPA pipeline stalls for two-plus quarters on regulatory deadlock; Crane restart slips materially or overruns; power/capacity prices roll over while the multiple stays premium; Calpine integration misses on synergies or leverage.',
      'vs VST: CEG is the premium-quality nuclear-PPA franchise; VST is cheaper with more merchant/ERCOT torque and has already corrected. Owning one of the two is the decision — owning both doubles the same power-price/policy factor.',
      'Valuation vs the 2027–29 contracted earnings bridge; PJM capacity auction exposure; post-Calpine debt ladder; explicit risk/reward comparison vs VST at current prices.',
      'Q2 2026 results + call (Aug 2026) + PowerFund strategy second opinion — verify before capital'
    ),
    (
      'VST',
      'investigate',
      'Merchant power + retail with nuclear/gas/solar fleet: the higher-torque, cheaper way to own the generation theme. Q2 2026 ongoing adj EBITDA +31% to $1.77B; FY26 guidance reaffirmed ($6.8–7.6B EBITDA) with results expected at or above midpoint. Roughly $700M of additional 2027 midpoint opportunity from pending Cogentrix + 20-yr Meta nuclear PPAs sits outside guidance. Trading ~36% below its 52-week high (Aug 2026) — the rare theme name that already had its correction.',
      'Same demand thesis as CEG with more operating leverage and a discount. Hedges (~100% of 2026, ~94% of 2027) plus the nuclear PTC floor protect the downside; Meta PPAs, Cogentrix, and the Helix data-center platform (founding investor alongside KKR/NVIDIA/KIA, up to $1B commitment, preferred power partner) provide contracted upside layers. More than $10B of available cash across 2026–27 funds buybacks plus growth.',
      'Cogentrix close and guidance re-baseline at the Q3 call; Meta PPA contributions from 2027; ERCOT tightening as data centers energize (mgmt sees 12–15GW of real DC demand by 2030); Helix deal flow; further PJM nuclear contracting.',
      'ERCOT forward curves are soft and the torque works both ways; Q2 revenue missed estimates on hedge/mix noise; GAAP earnings noisy from hedge marks; retail margin compression; Helix growth capex discipline (up to $1B).',
      'The 2027 midpoint opportunity ($7.4–7.8B) is abandoned; Meta/Cogentrix fail to close or contribute; the ERCOT data-center demand thesis breaks (load fails to materialize by 2028); the hedge book rolls onto materially lower curves with no offsetting contracts.',
      'vs CEG: less PPA franchise value, more commodity/merchant torque, better entry after the drawdown. NRG and Talen are the other merchant expressions. The Helix/NVIDIA alignment is an unusual strategic hook for a power name.',
      'EBITDA sensitivity to ERCOT curves; Meta PPA economics; Cogentrix funding structure; buyback pace vs growth commitments.',
      'Q2 2026 results + call (Aug 2026) + PowerFund strategy second opinion — verify before capital'
    ),
    (
      'GEV',
      'investigate',
      'The generation-equipment bottleneck itself: gas turbines (116GW backlog + slot reservations, mostly sold out through 2030), grid equipment (Electrification backlog $40.6B, +69% YoY), and nuclear (BWRX-300). Q2 2026 orders +88% organic, total backlog $176B, and FY26 free-cash-flow guidance raised massively to $11.5–12.5B. The most direct listed expression of "you cannot build power plants fast enough."',
      'Whoever wins AI, someone must generate the electricity — GEV sells the turbines, transformers and switchgear with multi-year lead times, funded by customer down payments (negative working capital makes it an FCF machine: $13.1B cash). Capacity expansion from 20GW to 30GW/yr of turbine output by 2030 converts backlog to revenue at improving margins. Data-center Electrification orders exceed $5B YTD, double all of 2025.',
      'Year-end gas backlog at or above 125GW (street looks for 130–140GW); Electrification margin expansion; the $200B backlog target for 2027; wind losses shrinking; SMR (BWRX-300) orders; continued buybacks.',
      'Massively rerated since 2024 — the crowding checklist matters most here of the five; slot reservations can defer or cancel if the capex cycle pauses (the 2000–02 bottleneck-supplier analogy applies to exactly this name); wind still losing ~$275M/quarter; execution risk scaling turbine output by 50%.',
      'Gas order/slot momentum stalls or cancellations appear; Electrification book-to-bill drops below 1; data-center orders roll over; FCF guidance cut; margin expansion stalls while the multiple stays at peak.',
      'Gas-turbine oligopoly with Siemens Energy and Mitsubishi Power (both non-US-listed — the watchlist gap flagged in the second opinion). Transformer competition: Hitachi Energy, Hyundai Electric, Prolec (now consolidated into GEV). Oligopoly + lead times = pricing power while the cycle lasts; the moat is cyclical, not structural.',
      'Backlog quality (deposit and cancellation terms on slots); wind path to breakeven; valuation vs mid-cycle (not peak) FCF; slot-to-order conversion rates.',
      'Q2 2026 results + call (22 Jul 2026) + PowerFund strategy second opinion — verify before capital'
    ),
    (
      'PWR',
      'investigate',
      'The labor bottleneck: grid, generation, and data-center balance-of-plant construction at scale. Q2 2026 revenue $9.56B (+41%), record total backlog $53.4B, FY26 guidance raised across all metrics (revenue $39.3–39.7B, adj EPS $16.45–16.95). Management: the 765kV corridor programs and utility mega-projects are "just starting" and mostly not yet in backlog.',
      'Skilled craft labor, MSA relationships, and execution track record cannot be replicated quickly — the same organizational-moat logic as EME at several times the scale, with deeper utility T&D exposure. Data-center/tech work is already 15–20% of revenue, much of it book-and-burn under MSAs that never appears in backlog (so reported backlog understates demand). The Hyosung HICO JV adds domestic transformer manufacturing. 1.7x levered with a Moody''s upgrade.',
      'NiSource program entering backlog from H2 2026; 765kV/345kV transmission corridor awards through the decade; continued guidance raises; data-center balance-of-plant expansion; transformer JV ramp.',
      'The multiple already reflects the narrative (same caveat as HUBB/EME in house view); project execution and bid risk at mega-scale; labor cost inflation; steady acquisition cadence obscures organic trends; state-level data-center permitting pauses.',
      'Backlog rolls over without corridor-program replacement; margin misses on large fixed-price work; data-center mix shrinks while the multiple stays elevated; FCF conversion (55–60% of EBITDA target) breaks down on M&A.',
      'vs EME (already on watchlist): PWR is bigger, more utility T&D and generation, more M&A-driven; EME is the focused mission-critical electrical specialist. Owning both doubles the construction-labor factor — pick per entry price. MYR, Primoris, MasTec are smaller comps.',
      'Organic vs acquired growth split; fixed-price vs cost-plus mix; corridor program timing; EV/EBITDA vs EME and MYR.',
      'Q2 2026 results + call (30 Jul 2026) + PowerFund strategy second opinion — verify before capital'
    )
) as d (
  symbol,
  status,
  summary,
  thesis,
  catalysts,
  risks,
  invalidation,
  competitive_notes,
  next_diligence,
  source
)
join public.instruments i
  on i.symbol = d.symbol
 and i.exchange = 'US'
on conflict (instrument_id) do update
  set
    status = excluded.status,
    summary = excluded.summary,
    thesis = excluded.thesis,
    catalysts = excluded.catalysts,
    risks = excluded.risks,
    invalidation = excluded.invalidation,
    competitive_notes = excluded.competitive_notes,
    next_diligence = excluded.next_diligence,
    source = excluded.source,
    updated_at = timezone('utc', now());

-- Full researched dossier refresh (2026-08-14).
-- Priority is portfolio-specific: mandate fit + current evidence + crowding,
-- not a permanent ranking of business quality.
insert into public.dossiers (
  instrument_id,
  status,
  summary,
  thesis,
  catalysts,
  risks,
  invalidation,
  competitive_notes,
  next_diligence,
  source
)
select
  i.id,
  d.status::public.dossier_status,
  d.summary,
  d.thesis,
  d.catalysts,
  d.risks,
  d.invalidation,
  d.competitive_notes,
  d.next_diligence,
  d.source
from (
  values
    (
      'CEG',
      'investigate',
      $$Priority 1/23. Best direct generation/PPA candidate for the next tranche and currently below its 200-day average. Q2 adjusted operating EPS was $2.55; FY26 guidance rose to $11.50–12.50. Calpine broadens the fleet but adds leverage and integration risk.$$,
      $$Constellation owns scarce firm power: the largest US nuclear fleet plus Calpine gas, geothermal, storage and retail. Another 920 MW of 15–20 year nuclear PPAs gradually converts merchant exposure into visible contracted earnings; Crane is targeted for a 2027 restart.$$,
      $$Further nuclear PPAs and uprates; Crane restart milestones; Calpine synergies; PJM capacity pricing; closing the $860M Brazos Valley divestiture.$$,
      $$About $19.1B of long-term debt post-Calpine; nuclear outage/NRC risk; undisclosed PPA economics; gas and retail volatility; Crane delay or cost overrun; policy intervention in wholesale power.$$,
      $$Reduce or exit if Crane slips beyond 2028 or cost rises >25%; owned nuclear capacity factor is below 90% for two non-outage-season quarters; Calpine is not accretive during 2027; leverage misses the stated path; or new PPAs require unattractive capex/returns.$$,
      $$CEG has a larger nuclear/PPA franchise than VST; regulated utilities are safer but cannot monetize scarcity as directly. Calpine diversifies operations, not necessarily financial risk. Do not own CEG and VST as if they were independent factors.$$,
      $$Model PPA strike/escalation and termination terms; plant-level license/outage/capex schedule; Calpine regional hedge profile; Crane downside case; leverage reduction vs adjusted EPS accretion.$$,
      $$Constellation Q2 2026 results and 8-K (2026-08-06); PowerFund research 2026-08-14$$
    ),
    (
      'NOC',
      'investigate',
      $$Priority 2/23. Best current defence-prime setup for diversification: strategic nuclear-modernization programs, roughly 19x forward earnings, and price below the 200-day average. Q2 sales rose 5% to $10.9B; backlog reached $104.7B.$$,
      $$B-21, Sentinel, TACAMO, missile defence and restricted space align with priorities likely to survive budget changes. Q2 awards included $7.6B for Sentinel and $4.3B of restricted work; FY26 sales/EPS guidance increased.$$,
      $$B-21 production acceleration; Sentinel ramp; GPI/IBCS/MESA awards; restricted-space conversion; Mission Systems margins near 15%; backlog converting into growth above 5%.$$,
      $$B-21/Sentinel concentration and cost/schedule risk; recurring estimate-at-completion charges; restricted-program opacity; segment margin fell to 10.6%; budget support does not guarantee margin protection.$$,
      $$Invalidate on additional material B-21/Sentinel charges; segment margin below 10.5% through 2027; FY26 adjusted FCF below $3.1B; program resets that cut guidance; or backlog rising while book-to-cash conversion deteriorates.$$,
      $$More concentrated than LMT/RTX but better positioned in long-duration strategic systems. B-21 is effectively sole-source; Sentinel incumbency is deep but oversight is intense. Less commercial-cycle exposure than GD/RTX.$$,
      $$Quantify B-21 lot economics and Sentinel re-baseline; funded vs unfunded backlog; restricted-program cash conversion; separate operating improvement from below-line EPS effects.$$,
      $$Northrop Grumman Q2 2026 release/slides (2026-07-21); PowerFund research 2026-08-14$$
    ),
    (
      'CCJ',
      'investigate',
      $$Priority 3/23. Most differentiated factor exposure: Tier-1 uranium mines, fuel services and 49% of Westinghouse. Price is below its 200-day average, but ~70x forward earnings means this is strategic scarcity, not a defensive-value stock.$$,
      $$Western uranium security, disciplined contracting and reactor-service exposure are hard to replicate. Contracts average >28M lb/year through 2030; Q2 realized uranium pricing rose 15% to C$93.13/lb and FY26 price/revenue guidance increased.$$,
      $$Long-term contracting at higher floors/escalators; uranium/conversion pricing; McArthur/Key Lake and Cigar Lake execution; Westinghouse new-build/service wins; western enrichment policy and utility inventory rebuilding.$$,
      $$Mine disruptions and rising cash costs; lumpy Westinghouse earnings; Kazakhstan/Inkai and FX exposure; spot purchases to meet commitments; exceptional expectations already embedded in valuation.$$,
      $$Invalidate if 2026 attributable output falls below 19.5M lb without force majeure; cash cost remains >C$60/lb as prices weaken; long-term uranium stays below US$75/lb for six months with weak contracting; post-2028 deliveries shrink without replacement; or Westinghouse trailing EBITDA turns negative.$$,
      $$Kazatomprom is lower-cost but geopolitically exposed; Orano is the closest integrated peer but not similarly investable. Smaller miners offer more beta but lack Cameco's assets, conversion capacity, balance sheet and Westinghouse.$$,
      $$Model contract floors/ceilings by delivery year; produced vs purchased pounds; normalize Westinghouse excluding one-offs; mine-by-mine costs/reliability; track conversion/enrichment separately from spot uranium.$$,
      $$Cameco Q2 2026 results/MD&A (2026-07-31); PowerFund research 2026-08-14$$
    ),
    (
      'EME',
      'investigate',
      $$Priority 4/23. Best operating evidence/backlog balance: Q2 revenue +19.8%, EPS +34.8%, and RPOs +43.9% to $17.14B, about 95% organic growth. Strong business, but price is in the 97th percentile of its five-year history.$$,
      $$EMCOR is one of few scaled contractors able to deliver complex electrical/mechanical data centres, fabs, healthcare and water infrastructure. The moat is labor organization, bonding capacity, customer trust and project selection—not IP.$$,
      $$Conversion of $13.02B of RPO expected within 12 months; network/communications growth; broad water/healthcare bookings; selective bidding and cost-plus mix; accretive specialist acquisitions.$$,
      $$Larger projects raise execution and labor risk; only 75–76% of RPO expected to burn within a year vs ~85% historically; guaranteed-maximum-price exposure; permitting/interconnection delays; peak construction margins.$$,
      $$Invalidate if RPO declines sequentially for two quarters; network RPO falls >15% YoY without replacement; US electrical/mechanical margin is below 10% for two quarters; material charges take consolidated margin below 8.5%; or trailing cash conversion is below 75%.$$,
      $$Competes with Quanta, Comfort Systems, Southland and regional firms. Scale, bonding, skilled labor and combined electrical/mechanical delivery narrow the field. It owns execution scarcity, not equipment scarcity.$$,
      $$RPO by end market/customer/contract type; hyperscaler concentration; reconcile slower burn with 2027 revenue; change-order/GMP exposure; normalized margins vs FIX/PWR.$$,
      $$EMCOR Q2 2026 results and 10-Q (2026-07-30); PowerFund research 2026-08-14$$
    ),
    (
      'LMT',
      'investigate',
      $$Priority 5/23. Best balance of funded defence scale, valuation and cash generation. Q2 sales rose 11% to $20.1B, FCF was $2.9B and guidance increased; $230.4B backlog is real but unusually concentrated in a $35B THAAD award.$$,
      $$Missile defence, munitions and F-35 sustainment provide durable demand. FY26 guidance calls for $79.75–81.75B sales and $7.0–7.2B FCF; roughly 19x forward earnings is below the defence-tech scarcity multiples.$$,
      $$THAAD/PAC-3/PrSM/NGI rate increases; F-35 delivery normalization; funded Golden Dome production; international F-16/missile orders; FCF above the raised floor.$$,
      $$THAAD is ~15% of backlog; fixed-price/classified-program charges; F-35 concentration and acceptance timing; capacity investment before revenue; budget categories may not map to LMT contracts.$$,
      $$Invalidate on two quarters of segment margin below 10%; FY26 FCF below $7B without a timing reversal; new material reach-forward losses; H2 F-35 deliveries failing to recover; or THAAD/munitions backlog not producing sustained MFC growth by FY27.$$,
      $$Broadest integrated missile/aircraft/space portfolio. RTX has stronger commercial aerospace diversification; NOC has more B-21/nuclear modernization. Scale and incumbency protect cash flows but limit transformative growth.$$,
      $$Funded content and annual production assumptions behind THAAD; F-35 cadence/cash/lot profitability; remaining loss reserves; FCF normalized for pension and working capital.$$,
      $$Lockheed Martin Q2 2026 results/tables (2026-07-23); PowerFund research 2026-08-14$$
    ),
    (
      'BWXT',
      'investigate',
      $$Priority 6/23. Scarce naval-nuclear and commercial-nuclear supplier with $8.4B backlog (+~40%) and price below its 200-day average. Strategic quality is high; ~34–40x forward earnings still demands patience.$$,
      $$BWXT has sole-source-like US naval propulsion positions and qualified nuclear manufacturing barriers. Q2 revenue was $902M; Government Operations adjusted EBITDA margin was 20.9%; FY26 revenue/EBITDA/FCF guidance increased.$$,
      $$Columbia/Virginia production; commercial life extensions; PCG/Kinectrics integration; medical-sale proceeds; advanced-reactor work moving from demonstrations to funded repeat production.$$,
      $$Scarcity premium; commercial margin diluted by expansion; capex may approach 7% of sales; long-cycle quality/execution risk; AI-power narrative can price revenue years early.$$,
      $$Invalidate if Government Operations margin falls below 19%; FY26 FCF misses $345M; commercial organic growth remains weak ex-acquisitions; integrations create excess charges; or advanced-reactor awards lack a production path by 2028.$$,
      $$A critical qualified supplier, not a prime or power merchant. Rolls-Royce, Curtiss-Wright and specialists compete in pieces, but not across the full naval franchise. Current earnings remain government/naval—not data-centre SMRs.$$,
      $$Split funded government/commercial/options backlog; medical-sale proceeds/stranded cost; post-acquisition capex and FCF; identify advanced-reactor contracts with repeat manufacturing economics.$$,
      $$BWXT Q2 2026 results (2026-08-03); PowerFund research 2026-08-14$$
    ),
    (
      'AVAV',
      'investigate',
      $$Priority 7/23. Credible autonomy/loitering-munition platform after a large retracement and below its 200-day average, but reported growth is acquisition-heavy and the BlueHalo integration still has to earn the valuation.$$,
      $$Combat-proven Switchblade plus BlueHalo creates a broader autonomy, counter-UAS, space, cyber and directed-energy portfolio. FY26 revenue reached $1.98B and funded backlog $1.2B; FY27 guidance implies ~10% growth.$$,
      $$Switchblade/autonomy awards; BlueHalo cross-selling and synergies; allied replenishment; counter-UAS production programs; return to GAAP profitability.$$,
      $$FY26 growth was mostly acquired; $265M net loss and $241M goodwill impairment; ~$2.49B goodwill and ~$729M debt; large GAAP/adjusted EPS gap; funded backlog covers only just over half of guidance.$$,
      $$Invalidate if FY27 organic growth is below mid-single digits; funded backlog falls below ~$1B or rolling book-to-bill <1; another impairment/control failure appears; adjusted EBITDA margin misses ~14%; or BlueHalo produces no visible cross-sell awards by FY28.$$,
      $$Competes with primes, Anduril, Shield AI, Teledyne FLIR and low-cost drone vendors. Battlefield evidence is an advantage, but platform incumbency is shallower than at the primes and procurement can shift quickly.$$,
      $$Acquisition-adjusted revenue/bookings; backlog conversion by program; recurring GAAP adjustments; BlueHalo purchase accounting and control remediation.$$,
      $$AeroVironment FY26/Q4 results (2026-06-29); PowerFund research 2026-08-14$$
    ),
    (
      'GD',
      'investigate',
      $$Priority 8/23. High-quality diversification across submarines, combat systems, IT and Gulfstream. Q2 revenue rose 8.1% to $14.1B and backlog reached $136.5B, but the stock is near a five-year high and already prices shipyard/Gulfstream recovery.$$,
      $$Columbia/Virginia demand and Gulfstream margin recovery provide internal improvement without requiring a new program. Company book-to-bill was 1.4x and first-half FCF about $3.6B.$$,
      $$G700/G800 deliveries; Marine productivity; vehicle/munitions awards; half the backlog converting by end-2027; debt reduction and cash conversion.$$,
      $$Marine margin only 7.3%; labor/supplier execution; Gulfstream cyclicality; $50.4B potential value is options/IDIQ, not backlog; valuation ~22–24x leaves little room.$$,
      $$Invalidate if Marine margin fails to approach high single digits in 2027; 2026 Gulfstream deliveries miss ~160 or Aerospace margin <14%; rolling FCF conversion <90%; firm backlog quality weakens; or submarine schedules slip again.$$,
      $$Unique nuclear-shipbuilding plus business-jet mix. More cyclical but more diversified than LMT/NOC. BWXT supplies naval nuclear components; it is not a shipyard competitor.$$,
      $$Firm vs potential backlog and escalation clauses; ship-by-ship milestones/margin sensitivity; Gulfstream deposits/cancellations; normalize first-half working capital.$$,
      $$General Dynamics Q2 2026 results/materials (2026-07-29); PowerFund research 2026-08-14$$
    ),
    (
      'HUBB',
      'investigate',
      $$Priority 9/23. Focused North American grid-component franchise with Q2 organic growth of 10%, utility book-to-bill ~1.2x and data-centre sales +~65%. Quality is high, but five-year price percentile is 96% and NSI acquisition leverage reduces defensiveness.$$,
      $$Certified, critical utility hardware represents little of total project cost, supporting pricing and entrenched channel relationships. FY26 guidance implies 9–11% organic growth and adjusted EPS $20.25–20.55.$$,
      $$Transmission/substation build; 2027 order conversion; data-centre growth and NSI cross-sell; NSI synergies/deleveraging; price/productivity offsetting tariffs.$$,
      $$Pro-forma leverage ~2.9x and debt ~$4.8B; Q2 adjusted margin down 50 bp; Grid Automation only ~1% growth; overlap with crowded electrical names; distributor inventory and input costs.$$,
      $$Invalidate if utility book-to-bill <1 for two quarters; organic Utility growth turns negative despite capex; adjusted margin <22% outside temporary integration; leverage >2.5x at end-2027; or NSI misses accretion/synergies.$$,
      $$Entrenched niche utility components vs broader Eaton/ABB/Schneider systems. Less turbine/HVDC upside than GEV but more focused component economics. Owning HUBB+GEV+EME is one grid/data-centre factor.$$,
      $$Separate organic vs NSI effects; NSI margins/synergies/debt plan; replacement vs new-load utility orders; distributor inventory; valuation/incremental margins vs ETN/NVT.$$,
      $$Hubbell Q2 2026 results/10-Q (2026-07-28/29); NSI filing; PowerFund research 2026-08-14$$
    ),
    (
      'TSM',
      'investigate',
      $$Priority 10/23. Best AI-industry control point and broadest winner-agnostic exposure, but price is in the 98th percentile and 19% above its 200-day average. Q2 revenue was $40.2B (+33.7%) with 67.7% gross margin.$$,
      $$Near-monopoly economics at leading-edge logic, advanced packaging and process integration. The 2nm ramp and AI/HPC mix can extend above-industry growth regardless of which accelerator designer wins.$$,
      $$Q3 revenue delivery; 2nm ramp; CoWoS capacity; FY26 USD revenue growth slightly above 40%; customer prepayments supporting expansion.$$,
      $$Irreducible Taiwan tail risk; $60–64B capex and future overcapacity; 2nm/overseas-fab margin dilution; rising AI concentration; extreme current crowding.$$,
      $$Invalidate on material share loss for two nodes; 2nm yield delays that move customers; gross margin <55% absent FX while utilization is high; AI/HPC growth <15% while capex stays >$55B; or material Taiwan disruption.$$,
      $$Samsung and Intel Foundry are alternatives but lack TSMC's combined yield, scale, packaging and ecosystem. Customer self-fabrication is a longer-term threat. Geopolitics—not competition—is the dominant unhedgeable risk.$$,
      $$Capacity-prepayment/cancellation protection; normalized overseas-fab margins; CoWoS supply; ADR value under blockade/sanctions/geographic-diversification cases.$$,
      $$TSMC Q2 2026 release/transcript (2026-07-16); PowerFund research 2026-08-14$$
    ),
    (
      'AVGO',
      'investigate',
      $$Priority 11/23. High-quality custom-ASIC/networking exposure plus VMware cash flow. Q2 FY26 revenue was $22.2B (+48%) with $10.3B FCF, but the stock is at the 98th percentile of its five-year range.$$,
      $$Broadcom is the premier custom accelerator/networking partner for hyperscalers seeking alternatives to merchant GPUs. VMware adds recurring high-margin cash flow that supports debt reduction and capital returns.$$,
      $$New custom-accelerator customers and ramps; OpenAI processor deployment; VMware cross-sell; deleveraging; Q3 results on 2026-09-02.$$,
      $$Few-customer AI concentration; in-sourcing/product-transition risk; VMware attrition/regulatory pushback; acquisition debt; large GAAP/non-GAAP gap from ~$2B quarterly amortization.$$,
      $$Invalidate if AI semiconductor growth <20% while customer capex rises; a major ASIC generation is cancelled; VMware recurring revenue contracts; FCF <35% of revenue for two quarters; or net leverage stops declining.$$,
      $$Marvell is the closest custom-silicon rival; NVIDIA owns merchant accelerated computing; hyperscaler silicon teams are customer and competitor. Broadcom's scale and software cash flow are superior to narrow connectivity names.$$,
      $$Revenue/backlog by ASIC customer; VMware seat contraction vs price; value semiconductor/software separately on GAAP cash economics; debt maturity path.$$,
      $$Broadcom Q2 FY2026 results and FY2026 10-Q; PowerFund research 2026-08-14$$
    ),
    (
      'RTX',
      'investigate',
      $$Priority 12/23. Strong operating momentum and genuine diversification, but it is the most crowded large prime: near the top of its five-year range and ~16% above the 200-day average. Q2 sales +14%, adjusted EPS +21%, backlog $289B.$$,
      $$Pratt aftermarket, Collins content and Raytheon missile demand provide three engines. FY26 guidance rose to $95–96B sales and $8.5–8.75B FCF. This is aerospace/defence—not a pure defence stock.$$,
      $$GTF aircraft-on-ground reduction; higher-margin shop visits; Patriot/AMRAAM/classified conversion; commercial production recovery; international replenishment.$$,
      $$~28–30x forward earnings; long-tail GTF powder-metal remediation; ~60% commercial backlog; Boeing/Airbus constraints; adjusted metrics exclude economically relevant costs.$$,
      $$Invalidate if GTF AOG stops declining or cash cost rises; FY26 FCF < $8.5B; Collins aftermarket falls to low-single-digit growth; Raytheon margin <11.5% despite growth; or estimates stop rising while P/E >25x.$$,
      $$Best commercial installed-base economics in the group; Raytheon competes with LMT in missiles. Engine aftermarket is durable but adds product-liability risk absent from pure primes.$$,
      $$GTF reserves/reimbursements/cash outflow; price-volume-aftermarket bridge; funded defence backlog/export timing; sum-of-parts for Collins/Pratt/Raytheon.$$,
      $$RTX Q2 2026 results/materials (2026-07-23); PowerFund research 2026-08-14$$
    ),
    (
      'EQIX',
      'investigate',
      $$Priority 13/23. Durable interconnection compounder and lower-beta AI infrastructure, but still crowded: 97th percentile and ~15% above the 200-day average. Q2 revenue was $2.63B (+16%); normalized AFFO/share +18%.$$,
      $$Dense interconnection ecosystems create switching costs. Global footprint benefits from hybrid cloud and distributed inference; xScale JVs share hyperscaler development capital.$$,
      $$Record interconnection adds; double-digit recurring revenue; xScale growth; raised 2026/2029 outlook; easing financing costs.$$,
      $$$5–6B annual capex and rate sensitivity; one-time xScale fees flattered Q2; power/construction constraints; hyperscaler self-build; REIT financing dependence.$$,
      $$Invalidate if normalized MRR growth <6%; AFFO/share declines two quarters; churn rises or interconnection adds turn negative; development yields fall below cost of capital; leverage rises as occupancy/bookings weaken.$$,
      $$Digital Realty is the closest global peer; hyperscalers dominate wholesale campuses. EQIX differentiates through interconnection density, not lowest-cost bulk capacity.$$,
      $$Strip one-time xScale fees; same-store occupancy/churn/power pass-through; JV guarantees; AFFO after recurring maintenance capex and stock compensation.$$,
      $$Equinix Q2 2026 results/8-K (2026-07-29); PowerFund research 2026-08-14$$
    ),
    (
      'GEV',
      'watch',
      $$Priority 14/23. Best power-equipment momentum, hardest entry: Q2 orders +88%, backlog $176B, but price is 94th percentile and ~23% above its 200-day average at ~49x forward earnings.$$,
      $$GEV owns two acute bottlenecks: large gas turbines and grid equipment. Gas backlog/reservations reached 116 GW; Electrification equipment backlog $40.6B; service installed base supports margins.$$,
      $$Reservation-to-order conversion; capacity ramp to 24 GW in 2028/30 GW in 2030; service growth; HVDC/transformer awards; Prolec integration; wind losses shrinking.$$,
      $$Slot reservations may cancel; customers face permitting/interconnection/gas constraints; capacity execution; Wind lost $275M EBITDA in Q2; FCF is boosted by customer advances; near-flawless execution priced.$$,
      $$Invalidate if gas backlog/reservations fall two quarters or cancellations >10%; 2028 capacity misses >10%; Electrification book-to-bill <1 twice; Wind loss >$600M in 2026; or Power/Electrification margins <15% while growing.$$,
      $$Gas turbines are an oligopoly with Siemens Energy/Mitsubishi. Grid competitors include Siemens, Hitachi Energy, ABB, Schneider. Breadth is useful but embeds wind liabilities absent from purer names.$$,
      $$Firm orders vs refundable reservations; backlog margins/escalators; normalize FCF for advances; supplier/capacity capex; standalone Wind liability; implied 2030 earnings.$$,
      $$GE Vernova Q2 2026 results/8-K (2026-07-22); PowerFund research 2026-08-14$$
    ),
    (
      'ANET',
      'watch',
      $$Priority 15/23. Elite Ethernet franchise with Q2 revenue +37.7% and 45.4% GAAP operating margin, but the most crowded setup in the group: ~100th percentile and ~38% above its 200-day average.$$,
      $$EOS software, reliability and cloud engineering relationships create switching costs. Ethernet is gaining credibility for scale-out and scale-up AI fabrics; enterprise/campus is a second engine.$$,
      $$1.6T and liquid-cooled fabrics; Q3 ~$3.3B revenue; scale-up Ethernet wins; customer diversification beyond Microsoft/Meta.$$,
      $$Microsoft/Meta concentration; hyperscaler timing and internal networking; NVIDIA Spectrum-X/InfiniBand; white-box competition; ~44x forward earnings/18x sales tolerates no stumble.$$,
      $$Invalidate if growth <15% for two quarters while capex remains strong; gross margin <60% or operating margin <38%; customer spending falls without replacement; AI wins remain confined to two customers; or EOS attach weakens.$$,
      $$Cisco has enterprise breadth; NVIDIA owns integrated GPU/networking; white box competes on price. Arista's defence is EOS consistency and cloud-scale operating experience.$$,
      $$Current Microsoft/Meta concentration; AI vs traditional cloud mix; prove scale-up wins in production; wait for valuation/downside protection.$$,
      $$Arista Q2 2026 results (2026-08-04) and concentration filings; PowerFund research 2026-08-14$$
    ),
    (
      'NVDA',
      'watch',
      $$Priority 16/23. Strongest AI operating platform, but a >$5T consensus holding at ~100th percentile and ~16% above its 200-day average. Q1 FY27 revenue was $81.6B (+85%); Data Center $75.2B.$$,
      $$CUDA, networking, systems and developers create a platform moat beyond GPUs. Architecture cadence sustains performance-per-dollar leadership; the multiple is supportable only if hyperscaler capex and estimates hold.$$,
      $$Blackwell scale; Vera Rubin transition; inference/sovereign/enterprise demand; networking and software monetization.$$,
      $$Top-three direct customers were 21%/17%/16%; $119B supply commitments; China/export controls; hyperscaler ASICs; neocloud financing/circular demand; product-transition inventory.$$,
      $$Invalidate if Data Center sequential growth is negative twice outside transition; gross margin settles <68%; CSP capex falls >15% as inventory rises; CUDA workload share erodes; or commitments outgrow revenue while inventory >100 days.$$,
      $$AMD is the merchant competitor; customer ASICs are the larger economic threat. NVIDIA's networking/software integration is its strongest defence. It adds no diversification to the current book.$$,
      $$End consumption vs ODM/neocloud shipments; utilization and inference economics; commitments/inventory/prepayments by architecture; China downside.$$,
      $$NVIDIA Q1 FY2027 results/10-Q (2026-05-20); PowerFund research 2026-08-14$$
    ),
    (
      'KTOS',
      'watch',
      $$Priority 17/23. Strong organic defence-tech growth and price below its 200-day average, but valuation (~68–96x forward earnings) assumes opportunities become high-rate programs. Q2 revenue +30.5%; funded backlog $1.57B.$$,
      $$Kratos self-funds low-cost engines, Valkyrie and hypersonic/rocket capacity where primes wait for customer funding. FY26 guidance rose, but current GAAP economics do not yet support the option value.$$,
      $$Valkyrie program-of-record; 3,000-engine output in 2027; hypersonic/space/propulsion awards; customer funding replacing self-funding; 2027 margin improvement.$$,
      $$Q2 operating loss; FY26 FCF use $85–105M; $250–275M investment partly for opportunities, not orders; Unmanned backlog flat; 1.0x book-to-bill; $15B bid pipeline is not backlog.$$,
      $$Invalidate if Valkyrie fails to reach ~1.5/month in 2027; Unmanned rolling book-to-bill <1 or backlog falls twice; FCF use >$105M without awards; engine demand trails built capacity; or 2027 EBITDA margin misses +100 bp.$$,
      $$Nimble and willing to self-fund; competes with primes, General Atomics, Anduril and others. Prime partnerships can accelerate adoption but leave KTOS with supplier economics.$$,
      $$Committed orders vs opportunity inventory/capex; Valkyrie unit economics/cancellation; contracted engine volume; backlog duration/margin/funding; value established operations separately from options.$$,
      $$Kratos Q2 2026 results (2026-08-04); PowerFund research 2026-08-14$$
    ),
    (
      'IREN',
      'watch',
      $$Priority 18/23. Power/site optionality with real Microsoft/NVIDIA validation and price below its 200-day average, but current revenue/cash flow do not yet validate the planned AI-cloud capital structure.$$,
      $$Scarce grid-connected land can be converted into GPU capacity; Horizon 1 was accepted by Microsoft on 2026-08-13. The thesis is project delivery and contract economics—not contracted-ARR headlines.$$,
      $$Horizon 2–4 delivery; ramp toward $3.7B contracted ARR; 480 MW 2026 capacity; FY26 results 2026-08-27; financing at attractive project returns.$$,
      $$Q3 revenue only $145M with $248M net loss; construction/GPU/power/financing risk; Microsoft/NVIDIA concentration; NVIDIA share rights; residual bitcoin volatility.$$,
      $$Invalidate if Horizon 2–4 slips >1 quarter; capacity fails acceptance; funding drives project returns <12%; contracted ARR misses $3B by end-2026; or debt rises without proportional commissioned capacity.$$,
      $$CoreWeave has more scale/software; hyperscalers self-build. IREN's differentiator is power access and vertical site development, not a proven cloud moat.$$,
      $$Contract cash-flow waterfalls incl GPU refresh/debt; termination/availability/customer-credit clauses; reconcile contracted ARR with GAAP backlog/revenue timing.$$,
      $$IREN Q3 FY2026 update and Horizon acceptance 8-K (2026-05-07/08-13); PowerFund research 2026-08-14$$
    ),
    (
      'ALAB',
      'watch',
      $$Priority 19/23. Exceptional rack-connectivity growth and economics, but concentration and entry risk are extreme: Q2 revenue +104%, gross margin >73%, price 94th percentile and ~50% above its 200-day average.$$,
      $$PCIe/CXL retimers and Scorpio fabric switches address rack-scale bottlenecks; Scorpio broadens Astera beyond retimers. Net cash and high margins fund focused R&D.$$,
      $$Scorpio X/P production; PCIe 6.0 mix; optical/custom design wins; Scorpio becoming the largest family.$$,
      $$Four direct customers were 29%/25%/15%/13%; top-three end customers 86% in 2025; foundry/packaging dependence; short cycles; unusual Q2 tax benefit; valuation requires perfect execution.$$,
      $$Invalidate if Scorpio is not largest family in Q3; growth <30% before diversification; gross margin <68%; a top customer cuts >25% without replacement; or integrated accelerators reduce attach.$$,
      $$Broadcom/Marvell/Credo have broader portfolios; hyperscalers can design custom silicon. Astera's edge is focused system-level execution and early qualifications.$$,
      $$Map invoiced to end customers; normalize Q2 tax/earnings; establish whether Scorpio wins span customers/platforms; refresh valuation after extension.$$,
      $$Astera Labs Q2 2026 results/10-Q (2026-08-04); PowerFund research 2026-08-14$$
    ),
    (
      'CRDO',
      'watch',
      $$Priority 20/23. Outstanding AEC growth but one of the most crowded/concentrated names: FY26 revenue tripled to $1.34B; price ~99th percentile and ~56% above the 200-day average.$$,
      $$AECs solve power/density/reliability inside AI clusters; strong cash and high margins fund optics/DSP/chiplet expansion. Customer concentration improved but remains the core risk.$$,
      $$800G/1.6T AEC ramps; ZeroFlap optics/OmniConnect; broader hyperscaler adoption; reduced original-customer concentration.$$,
      $$Top ten customers ~90% of sales; two >10%; few cluster architectures; copper reach limits and optical substitution; ~80x trailing earnings embeds hypergrowth.$$,
      $$Invalidate if quarterly growth <25% before diversification; largest end customer returns >50%; gross margin <62%; AEC content per rack falls at 1.6T; or optical products are immaterial by FY28.$$,
      $$Astera competes in retimers/fabrics; Marvell/Broadcom in DSP/optics; optical vendors in transceivers. Credo's edge is low-power SerDes/AEC specialization.$$,
      $$Current end-customer—not contract manufacturer—percentages; AEC content under alternative rack topologies; optics revenue milestones; normalized valuation.$$,
      $$Credo FY2026 results/10-K (2026-06-01); PowerFund research 2026-08-14$$
    ),
    (
      'MRVL',
      'watch',
      $$Priority 21/23. Credible AI optics/switching/custom-silicon recovery, but weaker economics and execution visibility. Q1 FY27 revenue +28%; price ~98th percentile and ~58% above its 200-day average.$$,
      $$Broad portfolio across custom compute, electro-optics, DSP and switching can outgrow legacy carrier/storage. Celestial AI adds scale-up optionality if integration works.$$,
      $$Q2 ~$2.7B guidance; 1.6T optics/51.2T switching; custom ramps; Q2 results 2026-08-27; Investor Day 2026-10-06.$$,
      $$Broadcom scale advantage; large GAAP/non-GAAP gap; acquisition/dilution risk; project delays; AI growth may not convert into GAAP profits.$$,
      $$Invalidate if data-centre growth <20% while peers >30%; Q2 misses midpoint >5%; non-GAAP gross margin <56%; GAAP profit stays negligible after AI exceeds half of sales; or major ASIC ramps slip >2 quarters.$$,
      $$Broadcom has greater ASIC scale; NVIDIA owns integrated systems; Credo/Astera attack focused niches. Breadth helps, but has not yet produced peer economics.$$,
      $$Bridge recurring GAAP adjustments; customer/program concentration and economics; Celestial AI assumptions; wait for results and de-crowding.$$,
      $$Marvell Q1 FY2027 results/10-Q (2026-05-28); PowerFund research 2026-08-14$$
    ),
    (
      'SMCI',
      'watch',
      $$Priority 22/23. AI-server demand is real, but accounting and working-capital quality remain unresolved. Q4 sales were $11.1B and gross margin jumped to 17.5%; price is still ~23% above its 200-day average.$$,
      $$Fast time-to-market, liquid cooling and building-block designs win accelerator ramps. The equity may be inexpensive only if audited margins and cash conversion prove repeatable.$$,
      $$Audited FY26 10-K; backlog delivery; sustained gross margin >14%; inventory/receivable normalization; control remediation.$$,
      $$March inventory $11.1B and receivables $8.4B; Q3 operating cash outflow $6.6B; abrupt margin jump needs audit; related-party suppliers/prior filing issues; low differentiation.$$,
      $$Invalidate if 10-K is delayed/qualified or reveals new weaknesses; gross margin <10%; inventory+receivables >60% of trailing sales; rolling four-quarter OCF negative; or revenue reversal/channel/related-party issues emerge.$$,
      $$Dell/HPE/ODMs and internal hyperscaler designs have stronger balance sheets or captive demand. SMCI competes on speed/customization, not durable software.$$,
      $$Do not rely on unaudited Q4 before 10-K; trace deposits/cancellation, receivable aging and inventory ownership; review Ablecom/Compuware and remediation.$$,
      $$Supermicro unaudited Q4/FY2026 results (2026-08-11) and Q3 10-Q; PowerFund research 2026-08-14$$
    ),
    (
      'CRWV',
      'watch',
      $$Priority 23/23. Genuine $104B backlog and strategic GPU demand, but common equity is the fragile residual beneath extreme leverage. Q2 revenue was $2.58B; net loss $626M and net interest expense $640M.$$,
      $$Purpose-built AI cloud and scarce GPUs attract top customers; backlog can create visibility if facilities deliver. Software/orchestration may differentiate beyond rental, but cost of capital is structural.$$,
      $$Backlog conversion; 1.5 GW active capacity; lower borrowing costs; customer diversification; utilization and delivery execution.$$,
      $$Top customers 45%/20%; debt around $24.9B at Q1; massive negative FCF/refinancing; GPU obsolescence faster than debt/leases; backlog contingent on delivery/performance.$$,
      $$Invalidate if backlog falls ex-delivery; interest remains >20% of revenue after 2027; net debt/annualized revenue fails below 2x; top-two concentration remains >60% after 2027; utilization <75% or financing exceeds project returns.$$,
      $$AWS/Azure/Google/Oracle have cheaper capital and integrated services; IREN/other neoclouds compete on capacity. CoreWeave has specialization/speed but a structurally worse funding base.$$,
      $$Analyze each SPV/lien/guarantee/cross-default; match contract duration to GPU life/debt/leases; take-or-pay vs performance-terminable backlog; equity downside in refinancing cases.$$,
      $$CoreWeave Q2 2026 results (2026-08-11) and Q1 10-Q; PowerFund research 2026-08-14$$
    )
) as d (
  symbol,
  status,
  summary,
  thesis,
  catalysts,
  risks,
  invalidation,
  competitive_notes,
  next_diligence,
  source
)
join public.instruments i
  on i.symbol = d.symbol
 and i.exchange = 'US'
on conflict (instrument_id) do update
  set
    status = excluded.status,
    summary = excluded.summary,
    thesis = excluded.thesis,
    catalysts = excluded.catalysts,
    risks = excluded.risks,
    invalidation = excluded.invalidation,
    competitive_notes = excluded.competitive_notes,
    next_diligence = excluded.next_diligence,
    source = excluded.source,
    updated_at = timezone('utc', now());

-- Remaining researched dossier refresh (2026-08-14).
-- Priority is specific to PowerFund's current factor exposure and entry setup.
insert into public.dossiers (
  instrument_id,
  status,
  summary,
  thesis,
  catalysts,
  risks,
  invalidation,
  competitive_notes,
  next_diligence,
  source
)
select
  i.id,
  d.status::public.dossier_status,
  d.summary,
  d.thesis,
  d.catalysts,
  d.risks,
  d.invalidation,
  d.competitive_notes,
  d.next_diligence,
  d.source
from (
  values
    (
      'ISRG',
      'investigate',
      $$Priority 1/6. Exceptional surgical-robotics franchise and the cleanest factor diversifier in the remaining list. Q2 revenue grew 19% to $2.89B, combined procedures 16%, and recurring revenue was 85% of sales. At ~$401 the stock was 16% below its 200-day average, though ~35.5x forward earnings is still demanding.$$,
      $$The moat is an ecosystem: 11,710 da Vinci systems, surgeon training, workflow integration, clinical evidence, service density and proprietary per-procedure instruments. Procedure growth and utilization monetize the installed base through consumables, leases and service. Da Vinci 5, Ion and SP create distinct growth vectors; Q2 Ion procedures rose 36% and SP procedures 61%. The balance sheet held $8.63B of cash/investments.$$,
      $$Da Vinci 5 international approvals and force-feedback instruments; Japanese reimbursement additions; SP indications and Japan stapler rollout; Ion international/diagnostic expansion; lower-cost XiR/refurbished systems; further procedure and utilization growth.$$,
      $$Absolute valuation still leaves limited room for low-teens growth; Medtronic Hugo and J&J Ottava introduce credible competition; US procedure growth moderated to 12% and bariatric volumes declined; China tender/pricing pressure; 54% of Q2 placements were leases, moving utilization/residual-value risk onto ISRG; inventory reached $2.03B; sole-source components and tariff effects.$$,
      $$Reduce or exit if da Vinci procedure growth is below 10% for two quarters or FY26 below 13.5%; utilization declines >3% YoY twice while installed base grows >8%; normalized non-GAAP gross margin is below 67% twice; inventory grows >25% while systems revenue grows <5% twice; or placements decline >15% twice alongside sub-10% procedures. Do not add above ~45x forward earnings without at least 15% forward-EPS estimate growth.$$,
      $$Hugo and Ottava begin with narrower indications and tiny US fleets. ISRG's defence is its installed base, ~70 multi-port instruments, training, service and procedure data. The likely long-term threat is hospital bundling/price compression from Medtronic or J&J, not abrupt displacement. China is more vulnerable to domestic competitors and procurement policy.$$,
      $$Split placements into new sites, replacements and trade-ins; procedures per installed system by platform/geography; operating-lease ROIC and residual values; competitor installations/indications/consumable pricing; reconcile inventory with lease placements; track China tenders and pricing limits.$$,
      $$Intuitive Q2 2026 earnings release (2026-07-16), Q2 10-Q (2026-07-21), 2025 10-K; market data through 2026-08-13; PowerFund research 2026-08-14$$
    ),
    (
      'ROK',
      'investigate',
      $$Priority 2/6. Genuine earnings recovery with better factor diversification than the semiconductor names, but not a cheap entry: Q3 organic sales rose 10%, adjusted EPS 22%, and enterprise margin expanded 280 bp to 22.3%. At ~$446, ROK was in the 95th percentile of its five-year range and ~7.5% above its 200-day average.$$,
      $$Rockwell's North American Allen-Bradley/Logix installed base, distributor network and switching costs support pricing and upgrades. Software & Control grew 18% organically with 34.8% margin; semiconductor, data-centre and warehouse demand can drive growth without a broad factory-capex recovery. Automotive, life sciences and process recovery remain optionality, not a base-case fact.$$,
      $$FY26 delivery at the top of 7.5–9.5% organic growth and $13.00–13.30 adjusted EPS; FY27 mid-single-digit growth without a broad rebound; Lifecycle book-to-bill returning above 1; 15%+ Software & Control growth; Clearpath/Production Logistics profitability; automotive/life-science project activity becoming named orders.$$,
      $$~34x FY26 adjusted earnings; strongest verticals still overlap AI/semiconductor capex; Lifecycle organic sales fell 2% and book-to-bill was 0.97; no broad food/beverage or process recovery; negative price/cost; margin help from restructuring and Sensia dissolution; $3.26B debt and $4.5B goodwill/intangibles.$$,
      $$Reduce or exit if FY26 organic growth is below 7.5% or adjusted EPS below $13; enterprise margin below 20.5% in either of the next two quarters; Lifecycle book-to-bill below 0.95 twice or 0.90 once; Software & Control growth below 8% with software ARR below 5%; FY27 guidance below 3% organic growth or 5% EPS growth; or next-12-month RPO falls >10% from $820M by Q2 FY27.$$,
      $$Rockwell is strongest in North American discrete automation. Siemens is broader globally and in engineering software; Schneider pairs automation with electrical distribution; ABB has broader motion/robotics; Emerson and Honeywell are stronger in process control. Pure-play focus creates upside leverage but fewer offsets in a downturn.$$,
      $$Obtain backlog by segment beyond RPO; isolate Sensia's margin contribution; track distributor sell-through vs restocking; identify named automotive/life-science orders; compare normalized EBIT/FCF with Siemens, Schneider, ABB and Emerson; wait for a better valuation or stronger revisions.$$,
      $$Rockwell Automation Q3 FY2026 release, presentation and 10-Q (2026-08-04), FY2025 10-K; market data through 2026-08-13; PowerFund research 2026-08-14$$
    ),
    (
      'ETN',
      'watch',
      $$Priority 3/6. Excellent backlog-supported electrification compounder, but currently one of the most crowded names: Q2 revenue was $8.53B (+14% organic), firm backlog $24.1B, and Electrical book-to-bill ~1.2. At ~$453, ETN was at the 99.8th percentile and 21% above its 200-day average, with material overlap to VRT/NVT.$$,
      $$ETN can compound through data-centre power/cooling, grid electrification and aerospace. Electrical plus Aerospace provide broader earnings than a data-centre pure play; Boyd Thermal fills a cooling gap and the Mobility separation should raise growth/margin mix. The underwrite is the firm $24.1B backlog—not the quoted 307 GW industry pipeline, most of which is unpermitted and not Eaton orders.$$,
      $$Electrical and Aerospace backlog conversion; sustained data-centre order growth; Boyd cross-selling and margin improvement; Mobility separation and ~$1.1B distribution in Q1 2027; aerospace aftermarket/Ultra PCS integration; higher-voltage DC and solid-state transformer adoption; capacity additions easing bottlenecks.$$,
      $$Crowding and ~30x forward earnings; non-firm data-centre announcements may cancel; gross debt rose to ~$20.6B after Boyd/Ultra PCS; interest expense nearly tripled; wider GAAP/non-GAAP gap; Electrical Americas margin remained below prior year despite growth; competition from Schneider, Vertiv, ABB and Siemens; direct AI-capex factor overlap.$$,
      $$Reduce or exit if combined Electrical book-to-bill is below 1.0 twice or backlog turns negative YoY by Q2 2027; data-centre orders decline twice or revenue growth is below 10% by H1 2027; segment margin is below 22% twice; FY26 FCF below $3.9B; gross debt fails to fall at least $2B by end-2027; or Boyd annualized revenue falls below $1.6B without margin progress.$$,
      $$ETN's advantage is qualification and breadth from utility equipment through rack-level power/cooling. Schneider has the closest end-to-end portfolio; VRT is more concentrated in data-centre thermal infrastructure; ABB is strong in medium voltage and automation. Breadth lowers company risk but does not make ETN independent of the hyperscaler-capex factor.$$,
      $$Track quarterly data-centre revenue/orders consistently; split hyperscaler/colo/enterprise exposure; isolate Boyd revenue, backlog and margin; reconcile firm backlog with the 307 GW industry pipeline; compare ETN/VRT/NVT correlations and capex-pause stress; reassess after de-extension.$$,
      $$Eaton Q2 2026 earnings release, presentation and 10-Q (2026-07-31/August), Q1 2026 end-market presentation; market data through 2026-08-13; PowerFund research 2026-08-14$$
    ),
    (
      'PATH',
      'watch',
      $$Priority 4/6. Capital-light automation turnaround with improving profitability, but the stock moved ~57% in three weeks without a new earnings print and sat 31% above its 200-day average. Q1 FY27 revenue grew 17% to $418M, ARR 12% to $1.901B and net retention was 109%. Wait for the 2026-09-03 Q2 report.$$,
      $$UiPath can combine deterministic automation, agents, document processing, testing and cross-application orchestration for regulated enterprises. Q1 evidence included AI in 16 of the top 20 deals and larger AI expansions; customers above $1M ARR rose to 374. Governance and auditability may be more defensible than standalone agents. The thesis requires ARR/retention/cohort proof—not customer anecdotes.$$,
      $$Q2 revenue guidance of $395–400M and ARR $1.929–1.934B; FY27 guidance of $1.776–1.781B revenue and $2.058–2.063B ARR; Maestro/agentic/IXP/Test Cloud production conversion; WorkFusion integration; larger-customer expansion; potential short-covering after a strong print.$$,
      $$Total customers were flat; 109% net retention is modest; Microsoft can bundle Power Automate while ServiceNow, Salesforce, Automation Anywhere and AI-native tools compete; computer-use agents may commoditize RPA; ARR is invoiced value, not revenue/backlog; Q1 SBC was 12.7% of revenue; dual-class founder control; rally makes the September print binary.$$,
      $$Reduce/pass if Q2 ARR is below $1.929B or FY27 ARR guidance below $2.058B; net retention below 105% twice; net-new ARR below $40M twice or $180M for FY27; >$100K customers fail to grow twice; GAAP operating margin turns negative while SBC exceeds 15% twice; or FY27 operating cash flow less capex is below $300M. Do not initiate full size >25% above the 200-day average without a beat and guidance raise.$$,
      $$UiPath is strongest in complex, regulated, cross-application automation. Microsoft is the structural threat through bundling; ServiceNow and Salesforce are stronger when workflows stay inside their systems. UiPath must prove multi-vendor orchestration improves retention and contract size rather than merely generating pilots.$$,
      $$Request agentic/Maestro ARR, production-customer counts and renewal rates; organic ARR ex-WorkFusion/FX; gross retention and account cohorts; Microsoft/ServiceNow win-loss data; owner earnings after SBC and buybacks; WorkFusion acquired ARR/retention; reassess after September 3.$$,
      $$UiPath Q1 FY2027 release (2026-05-28), Q1 10-Q (2026-06-04), FY2026 10-K, Q2 reporting-date notice (2026-08-06); market data through 2026-08-13; PowerFund research 2026-08-14$$
    ),
    (
      'TER',
      'watch',
      $$Priority 5/6. Exceptional AI-test momentum but a parabolic, concentrated entry: Q2 revenue doubled to $1.329B, Semiconductor Test rose 128% and non-GAAP operating margin reached 33.7%. At ~$411, TER was at the 99th percentile, 37% above its 200-day average and up ~269% YoY.$$,
      $$AI accelerators require more test insertions, longer test times, power handling and HBM/DRAM testing. Teradyne is broadening from mobile SoC into compute, memory, system-level test, photonics and interconnect. Peak volumes produce excellent incremental margins; Product Test and Robotics add options. More than 60% of Q2 revenue was AI-driven, so this is AI infrastructure—not a portfolio-diversifying robotics position.$$,
      $$Q3 above the $1.2–1.3B guide; memory revenue exceeding Q2's $212M; merchant-GPU qualifications; ATE market expansion and share gains; MultiLane/Omny photonics wins; Robotics sustaining >20% growth; FY27 guidance confirming growth against difficult comparisons.$$,
      $$~42x forward earnings after a 2026 surge; limited hard backlog and cancellable orders; >60% AI exposure; specifying/purchasing-customer concentration; compute/memory lumpiness and peak margins; Advantest competition; lower-margin memory mix; Robotics is only 7.5% of revenue and faces major robot OEMs.$$,
      $$Reduce/pass if Q3 revenue is below $1.2B or EPS below $1.85; Q4 revenue below $1.15B; non-GAAP gross margin below 58% twice or operating margin below 27% once before Q2 2027; Semiconductor Test below $950M twice; FY27 guidance below 10% revenue growth or no EPS growth; Robotics below $90M twice; or a material >10% customer loss occurs.$$,
      $$Teradyne's test qualifications and installed platforms create switching costs, but Advantest is at least as exposed to leading-edge compute/memory. Cohu/SPEA compete in niches. Product Test faces Keysight/Rohde & Schwarz/Anritsu. Universal Robots has cobot ecosystem strength, but robotics is not the current earnings engine.$$,
      $$Determine TER vs Advantest share by compute/HBM/DRAM/merchant GPU; identify >10% customers and cadence; normalize margins by segment; test WFE-to-ATE purchase lag; verify merchant-GPU qualifications; track Robotics units/ASPs/channel inventory; wait for a meaningful pullback or 2027 order proof.$$,
      $$Teradyne Q2 2026 release (2026-07-28), Q2 10-Q (2026-07-31), earnings presentation/call, FY2025 10-K; market data through 2026-08-13; PowerFund research 2026-08-14$$
    ),
    (
      'AMD',
      'watch',
      $$Priority 6/6. Genuine data-centre inflection but the worst current entry setup: Q2 revenue reached $11.54B (+50%) and Data Center $6.72B (+107%), yet at ~$483 AMD was 50% above its 200-day average and up ~176% YoY. Helios upside is offset by unproven customer economics, warrants and partner commitments.$$,
      $$EPYC provides a mature server-share route while Instinct/Helios offers hyperscalers a credible second platform to NVIDIA. Helios' memory capacity may suit inference, but the thesis requires named gigawatt agreements to convert into profitable, repeatable deployments while holding mid-50s gross margin. Customer commitments alone are insufficient after economic concessions.$$,
      $$Meta/OpenAI initial deployments; Helios availability at major CSPs; Anthropic's first gigawatt in H1 2027; EPYC Venice share gains; MI500/Helios 500 in 2027; ROCm production adoption; gross margin above 56% as Data Center mix rises.$$,
      $$NVIDIA CUDA/networking moat and custom ASICs; future concentration in Meta/OpenAI/Anthropic; Meta/OpenAI warrants could create ~20% maximum dilution; $4.1B lease guarantees, $30.3B purchase/cloud commitments and up to $5B investments; TSMC/export-control risk; annual roadmap execution; extreme crowding/beta.$$,
      $$Reduce/pass if Data Center revenue declines sequentially twice or FY27 growth is below 40%; Data Center margin below 28% twice or company non-GAAP gross margin below 54% by Q2 2027; Meta/OpenAI first deployments slip beyond Q1 2027 or Anthropic beyond Q3 2027; MI500 is not shipping by Q4 2027; matched testing shows Helios >15% worse total cost/token than Rubin; or commitments grow faster than revenue while Data Center sequential growth is below 5% twice.$$,
      $$AMD is the credible second merchant platform with open standards, high memory capacity and CPU/GPU/networking integration. NVIDIA retains major advantages in CUDA, NVLink/NCCL, developers and proven cluster operations; hyperscaler ASICs threaten stable inference workloads. Warrants demonstrate commitment but also that AMD shared substantial economics to win anchors.$$,
      $$Build customer deployment schedules separating binding purchases from up-to frameworks; model warrant dilution by milestone; split EPYC and Instinct gross profit; track independent Helios/Rubin utilization and cost; audit guarantees/investments/commitments by counterparty; measure production ROCm adoption; wait for de-extension or hard deployment evidence.$$,
      $$AMD Q2 2026 release/presentation (2026-08-04), Q2 10-Q (2026-08-05), Helios roadmap, Meta/OpenAI agreement filings; market data through 2026-08-13; PowerFund research 2026-08-14$$
    )
) as d (
  symbol,
  status,
  summary,
  thesis,
  catalysts,
  risks,
  invalidation,
  competitive_notes,
  next_diligence,
  source
)
join public.instruments i
  on i.symbol = d.symbol
 and i.exchange = 'US'
on conflict (instrument_id) do update
  set
    status = excluded.status,
    summary = excluded.summary,
    thesis = excluded.thesis,
    catalysts = excluded.catalysts,
    risks = excluded.risks,
    invalidation = excluded.invalidation,
    competitive_notes = excluded.competitive_notes,
    next_diligence = excluded.next_diligence,
    source = excluded.source,
    updated_at = timezone('utc', now());

-- Index proxies for mandate benchmarks. No theme on purpose: research
-- lists drop unthemed names, and `is_benchmark` keeps them off the public
-- watchlist even if someone tags them later.
insert into public.instruments (
  symbol, name, asset_class, exchange, status, is_benchmark, notes
)
values
  (
    'SPY',
    'SPDR S&P 500 ETF Trust',
    'etf',
    'US',
    'watchlist',
    true,
    'Success benchmark: investable S&P 500 total-return proxy. Not a research name.'
  ),
  (
    'QQQ',
    'Invesco QQQ Trust',
    'etf',
    'US',
    'watchlist',
    true,
    'Style benchmark: investable Nasdaq-100 total-return proxy. Not a research name.'
  )
on conflict (symbol, exchange) do update
  set
    is_benchmark = true,
    notes = excluded.notes,
    updated_at = timezone('utc', now());

insert into public.benchmarks (role, instrument_id, label)
select
  v.role::public.benchmark_role,
  i.id,
  v.label
from (
  values
    ('success', 'SPY', 'S&P 500 total return (SPY)'),
    ('style', 'QQQ', 'Nasdaq-100 total return (QQQ)')
) as v(role, symbol, label)
join public.instruments i
  on i.symbol = v.symbol
 and i.exchange = 'US'
on conflict (role) do update
  set
    instrument_id = excluded.instrument_id,
    label = excluded.label;

-- Live cash (NAV = cash + MTM). Do not overwrite an existing row.
insert into public.portfolio_state (cash, notes)
select
  greatest(
    0,
    250000 - coalesce(
      (select sum(quantity * avg_cost) from public.positions where status = 'open'),
      0
    )
  ),
  'PowerFund allocated NAV $250k. BTC/gold are outside this book.'
where not exists (select 1 from public.portfolio_state);

-- This-week starter stubs (idempotent per open queue item).
insert into public.planned_actions (
  instrument_id,
  action_type,
  planned_usd,
  window_label,
  rationale
)
select
  i.id,
  'buy',
  v.planned_usd,
  v.window_label,
  v.rationale
from (
  values
    ('CLS', 4500::numeric, 'this week', 'AI infra EMS-ODM starter stub; add on thesis-intact weakness.'),
    ('NVT', 4500::numeric, 'this week', 'Cooling / rack power starter; pair with CLS, not a quota.'),
    ('MRCY', 2500::numeric, 'this week', 'Defence edge compute starter; keep small until thesis earns size.'),
    ('NBIS', 1000::numeric, 'this week', 'Optional neocloud stub; skip if tape is crowded.')
) as v(symbol, planned_usd, window_label, rationale)
join public.instruments i
  on i.symbol = v.symbol
 and i.exchange = 'US'
where not exists (
  select 1
  from public.planned_actions p
  where p.instrument_id = i.id
    and p.status in ('pending', 'deferred')
);
