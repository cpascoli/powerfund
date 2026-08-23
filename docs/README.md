# Power Fund — Documentation

Intelligence for managing and growing capital in the markets — starting with personal investments, built so the process can later support other investors or a research product.

## Contents

| Doc | Purpose |
|-----|---------|
| [goals.md](./goals.md) | Why Power Fund exists and what success looks like |
| [mandate.md](./mandate.md) | Investment mandate, risk rules, and operating discipline |
| [plan.md](./plan.md) | Phased build plan (Phase 0 → scale) |
| [themes.md](./themes.md) | Priority sectors, why they are one transformation, adjacent watch |
| [ux.md](./ux.md) | Research UI information architecture and viz principles |
| [deploy.md](./deploy.md) | GitHub → Netlify CI and remote Supabase |
| [agent-api.md](./agent-api.md) | Private authenticated API for AI agents (ChatGPT / MCP) |
| [gpt-agent-process.md](./gpt-agent-process.md) | How a GPT should run the book against that API (cadence, Briefing objects, rituals) |

## Reviews

| Review | Scope |
|--------|-------|
| [2026-08-13](./reviews/2026-08-13-full-review.md) | Full audit: intent → architecture → plan → implemented features |
| [2026-08-13 strategy second opinion](./reviews/2026-08-13-strategy-second-opinion.md) | PM/quant review of the AI strategy chat vs live book, mandate, and dossiers |

## Related

- [Architecture](../architecture/README.md) — living design docs as the system is built

## How to use these docs

- Update **mandate** and **themes** when the investment process changes. `themes.md` is the supercycle map: why the four themes are one transformation, and where bottlenecks migrate.
- Update **plan** when scope or sequencing changes.
- The four operator docs (mandate, goals, themes, plan) also render in the app under **Playbook**.
- Put system design, data models, and pipeline decisions under `architecture/` — not here.