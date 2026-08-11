# Architecture

Living documentation for how Power Fund is designed and built. Update these docs as decisions are made — prefer short, current truth over speculative essays.

## Purpose

- Record system shape, boundaries, and tradeoffs.
- Give future work (and future contributors) a map.
- Keep product/mandate docs in [`docs/`](../docs/README.md) separate from engineering design.

## Contents

| Doc | Purpose |
|-----|---------|
| [overview.md](./overview.md) | System context and components |
| [stack.md](./stack.md) | Languages, apps, and services |
| [data-model.md](./data-model.md) | Schema and core entities |
| [decisions/](./decisions/) | Architecture Decision Records (ADRs) |

Product UX / IA for the research frontend: [`docs/ux.md`](../docs/ux.md).

Add as they become real:

- `pipelines.md` — ingestion and scoring flows
- `security.md` — secrets, access, and data handling

## Conventions

1. Document **what we chose and why**, not every alternative we skimmed.
2. When a decision is superseded, mark it clearly and link to the replacement.
3. Keep diagrams simple (Mermaid is fine).
4. Label targets as **planned** vs **implemented**.

## Current status

Phase 1 scaffold: monorepo, Supabase schema, research UI shell, worker stub.
