insert into public.themes (slug, name, description, is_core, sort_order)
values
  (
    'ai-infrastructure',
    'AI Infrastructure',
    'Compute, networking, data centers, and supply chain behind AI demand.',
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
on conflict (slug) do nothing;

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
    ('CEG', 'Constellation Energy', 'equity', 'energy', 'Nuclear / clean firm power'),
    ('VST', 'Vistra', 'equity', 'energy', 'Power generation / retail'),
    ('GEV', 'GE Vernova', 'equity', 'energy', 'Grid / generation equipment'),
    ('CCJ', 'Cameco', 'equity', 'energy', 'Uranium fuel cycle'),
    ('ETN', 'Eaton', 'equity', 'energy', 'Electrical / data-center power'),
    ('PWR', 'Quanta Services', 'equity', 'energy', 'Grid infrastructure services'),
    ('ISRG', 'Intuitive Surgical', 'equity', 'robotics-ai', 'Surgical robotics'),
    ('TER', 'Teradyne', 'equity', 'robotics-ai', 'Automation / test'),
    ('ROK', 'Rockwell Automation', 'equity', 'robotics-ai', 'Industrial automation'),
    ('PATH', 'UiPath', 'equity', 'robotics-ai', 'Software automation'),
    ('LMT', 'Lockheed Martin', 'equity', 'defence', 'Prime contractor'),
    ('RTX', 'RTX', 'equity', 'defence', 'Aerospace & defense'),
    ('NOC', 'Northrop Grumman', 'equity', 'defence', 'Prime / autonomous systems'),
    ('GD', 'General Dynamics', 'equity', 'defence', 'Platforms / munitions'),
    ('AVAV', 'AeroVironment', 'equity', 'defence', 'Loitering munitions / UAS'),
    ('KTOS', 'Kratos Defense', 'equity', 'defence', 'Unmanned / rocket support')
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
