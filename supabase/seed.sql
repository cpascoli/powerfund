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
    ('SKHY', 'SK hynix', 'equity', 'ai-infrastructure', 'HBM / DRAM ADR — AI memory leader'),
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
      'watch',
      'Robotics picks-and-shovels: precision motion, encoders, force/torque, tool changers, vision — the nervous system and musculature of robots. Interesting physical-AI supplier; valuation not cheap (adjusted mid-40s forward cited).',
      'If industrial/warehouse/humanoid robots scale, OEMs still need qualified sensors, motors and tooling interfaces. Design-in creates switching costs (mechanical, software, safety, calibration). NVIDIA Halos lab participation is a positioning signal, not proof of revenue.',
      'Robotics/semicap/advanced industrial mix acceleration; design-win disclosures; margin expansion on robotics SKUs.',
      'Expensive if growth disappoints. Acquisition accounting noise. Competition across motion/sensing vendors. Physical AI timelines can slip.',
      'Robotics growth stalls; guidance cuts; multiple stays elevated without earnings catch-up.',
      'Moat = component qualification into OEM platforms. Track rather than rush; better as watch until valuation or evidence improves.',
      'Reconcile GAAP vs adjusted EPS; map robotics revenue disclosure; list key OEM exposures.',
      'OpenAI agent expansion screen + Power Fund triage (Aug 2026) — unverified'
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
