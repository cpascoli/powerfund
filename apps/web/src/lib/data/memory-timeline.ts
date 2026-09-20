import {
  utcDay,
  type MemoryEvent,
  type MemoryKind,
} from "@powerfund/domain";

import { listDecisions } from "@/lib/data/decisions";
import { listDecisionOutcomes } from "@/lib/journal/record-outcome";
import {
  hydrateReviewTasks,
  listReviewTaskRows,
  type ReviewTaskRecord,
} from "@/lib/reviews/records";
import { resolveDb, type DbClient } from "@/lib/supabase/db";

const VERSION_PAGE = 1000;

type DossierVersionRow = {
  id: string;
  dossier_id: string;
  version_number: number;
  change_reason: string;
  created_at: string;
};

function firstLine(text: string | null, max = 160): string | null {
  if (text == null) return null;
  const line = text
    .split("\n")
    .map((row) => row.trim())
    // Agent tags and markdown headings are labels, not the sentence.
    .find((row) => row.length > 0 && !row.startsWith("[agent:") && !row.startsWith("#"));
  if (line == null) return null;
  return line.length > max ? `${line.slice(0, max - 1)}…` : line;
}

type Loaded = { events: MemoryEvent[]; details: Map<string, MemoryDetail> };

async function companyMemories(supabase: DbClient): Promise<Loaded> {
  // Paged for the same reason listDecisions is: PostgREST truncates at 1,000
  // without saying so, and 112 versions in five weeks is not a rate that stays
  // comfortable.
  const rows: DossierVersionRow[] = [];
  for (let offset = 0; ; offset += VERSION_PAGE) {
    const { data, error } = await supabase
      .from("dossier_versions")
      .select("id, dossier_id, version_number, change_reason, created_at")
      .order("created_at", { ascending: false })
      .range(offset, offset + VERSION_PAGE - 1);
    if (error) {
      throw new Error(`Failed to load dossier versions: ${error.message}`);
    }
    const page = (data as DossierVersionRow[] | null) ?? [];
    rows.push(...page);
    if (page.length < VERSION_PAGE) break;
  }
  if (rows.length === 0) return { events: [], details: new Map() };

  const { data: dossiers } = await supabase
    .from("dossiers")
    .select("id, instrument_id");
  const instrumentByDossier = new Map(
    ((dossiers as Array<{ id: string; instrument_id: string }> | null) ?? []).map(
      (row) => [row.id, row.instrument_id],
    ),
  );
  const { data: instruments } = await supabase
    .from("instruments")
    .select("id, symbol");
  const symbolById = new Map(
    ((instruments as Array<{ id: string; symbol: string }> | null) ?? []).map(
      (row) => [row.id, row.symbol],
    ),
  );

  const events: MemoryEvent[] = [];
  const details = new Map<string, MemoryDetail>();
  for (const row of rows) {
    const instrumentId = instrumentByDossier.get(row.dossier_id);
    const symbol = instrumentId ? (symbolById.get(instrumentId) ?? null) : null;
    const id = `company:${row.id}`;
    events.push({
      id,
      kind: "company",
      at: row.created_at,
      symbol,
      title: symbol ?? "Dossier",
      summary: firstLine(row.change_reason),
      badge: `v${row.version_number}`,
      future: false,
    });
    details.set(id, {
      id,
      kind: "company",
      at: row.created_at,
      symbol,
      title: `${symbol ?? "Dossier"} version ${row.version_number}`,
      fields: [{ label: "Why it changed", value: row.change_reason }],
      // The immutable snapshot, which is what a review is supposed to read
      // rather than the live dossier.
      href: symbol ? `/explore/${symbol}` : null,
      hrefLabel: symbol ? `${symbol} dossier` : null,
    });
  }
  return { events, details };
}

async function decisionMemories(supabase: DbClient): Promise<Loaded> {
  const decisions = await listDecisions(supabase);
  if (decisions.length === 0) return { events: [], details: new Map() };
  const outcomes = await listDecisionOutcomes(
    supabase,
    decisions.map((row) => row.id),
  );

  const events: MemoryEvent[] = [];
  const details = new Map<string, MemoryDetail>();
  for (const row of decisions) {
    const graded = outcomes.get(row.id) ?? [];
    // The grades are part of the decision memory, not a separate event: "what
    // we did, why, and how it turned out" is one record read together.
    const clocked = graded
      .filter((outcome) => outcome.horizon_days != null)
      .sort((a, b) => (a.horizon_days ?? 0) - (b.horizon_days ?? 0));
    const gradeSummary =
      clocked.length > 0
        ? clocked
            .map((outcome) => `${outcome.horizon_days}d ${outcome.thesis_grade}`)
            .join(" · ")
        : null;
    const id = `decision:${row.id}`;
    events.push({
      id,
      kind: "decision",
      at: row.action_at,
      symbol: row.symbol,
      title: `${row.symbol ?? "—"} · ${row.decision_type}`,
      summary: gradeSummary ?? firstLine(row.thesis),
      badge: row.decision_type,
      future: false,
    });
    details.set(id, {
      id,
      kind: "decision",
      at: row.action_at,
      symbol: row.symbol,
      title: `${row.symbol ?? "—"} · ${row.decision_type}`,
      fields: [
        { label: "Thesis", value: row.thesis },
        ...(row.catalysts ? [{ label: "Catalysts", value: row.catalysts }] : []),
        ...(row.risks ? [{ label: "Risks", value: row.risks }] : []),
        ...(row.invalidation
          ? [{ label: "Invalidation", value: row.invalidation }]
          : []),
        ...(row.sizing_rationale
          ? [{ label: "Sizing", value: row.sizing_rationale }]
          : []),
        ...(row.dossier_version
          ? [
              {
                label: "Believed at",
                value: `Dossier version ${row.dossier_version.number}`,
              },
            ]
          : []),
        // Read together with the decision on purpose: a grade is how the
        // judgement turned out, not a separate memory.
        ...graded.map((outcome) => ({
          label:
            outcome.horizon_days == null
              ? "Grade (off-clock)"
              : `Grade at ${outcome.horizon_days}d`,
          value: `thesis ${outcome.thesis_grade}${
            outcome.timing_grade ? ` · timing ${outcome.timing_grade}` : ""
          }${outcome.sizing_grade ? ` · sizing ${outcome.sizing_grade}` : ""}${
            outcome.risk_management_grade
              ? ` · risk ${outcome.risk_management_grade}`
              : ""
          }\n${outcome.lessons}`,
        })),
      ],
      href: row.symbol ? `/decisions?symbol=${row.symbol}` : "/decisions",
      hrefLabel: "Journal",
    });
  }
  return { events, details };
}

function portfolioMemory(task: ReviewTaskRecord): MemoryEvent | null {
  if (task.completed_at == null) return null;
  return {
    id: `portfolio:${task.id}`,
    kind: "portfolio",
    at: task.completed_at,
    symbol: task.symbols[0] ?? null,
    title: task.title,
    summary: firstLine(task.outcome),
    badge: task.scope,
    future: false,
  };
}

function calendarMemory(task: ReviewTaskRecord, today: string): MemoryEvent | null {
  // The date the obligation lands on, by the same precedence Briefing uses.
  const at = task.due_by ?? task.scheduled_for ?? task.not_before;
  if (at == null) return null;
  // A task raised and concluded on the same day is one memory, not two. The
  // obligation is only worth showing separately when it predates the
  // conclusion — that gap is the interesting part, and without this a
  // same-day diagnostic renders twice under one date looking like a bug.
  if (task.completed_at != null && utcDay(task.completed_at) === utcDay(at)) {
    return null;
  }
  return {
    id: `calendar:${task.id}`,
    kind: "calendar",
    at,
    symbol: task.symbols[0] ?? null,
    title: task.title,
    summary: firstLine(task.instructions),
    badge: task.scope,
    future: utcDay(at) > today,
  };
}

export type MemoryTimelineData = {
  events: MemoryEvent[];
  /** Full detail for the overlay, keyed by event id, loaded with the list. */
  details: Map<string, MemoryDetail>;
};

export type MemoryDetail = {
  id: string;
  kind: MemoryKind;
  at: string;
  symbol: string | null;
  title: string;
  /** Label / value pairs rendered in order. Long values wrap as prose. */
  fields: Array<{ label: string; value: string }>;
  /** Where to go to act on or extend this memory. */
  href: string | null;
  hrefLabel: string | null;
};

export async function loadMemoryTimeline(
  client?: DbClient,
): Promise<MemoryTimelineData> {
  const supabase = await resolveDb(client);
  const today = utcDay(new Date().toISOString());

  const [companyLoaded, decisionLoaded, taskRows] = await Promise.all([
    companyMemories(supabase),
    decisionMemories(supabase),
    listReviewTaskRows(supabase),
  ]);
  const tasks = await hydrateReviewTasks(supabase, taskRows);
  const company = companyLoaded.events;
  const decisions = decisionLoaded.events;

  const portfolio = tasks
    .map(portfolioMemory)
    .filter((row): row is MemoryEvent => row != null);
  // A completed task is portfolio memory; its date is still calendar memory,
  // because the obligation existed before the conclusion did.
  const calendar = tasks
    .map((task) => calendarMemory(task, today))
    .filter((row): row is MemoryEvent => row != null);

  const events = [...company, ...decisions, ...portfolio, ...calendar].sort(
    (a, b) => b.at.localeCompare(a.at),
  );

  const details = new Map<string, MemoryDetail>([
    ...companyLoaded.details,
    ...decisionLoaded.details,
  ]);
  for (const task of tasks) {
    details.set(`portfolio:${task.id}`, {
      id: `portfolio:${task.id}`,
      kind: "portfolio",
      at: task.completed_at ?? task.created_at,
      symbol: task.symbols[0] ?? null,
      title: task.title,
      fields: [
        { label: "Scope", value: task.scope },
        { label: "Instructions", value: task.instructions },
        ...(task.outcome ? [{ label: "Outcome", value: task.outcome }] : []),
        ...(task.symbols.length > 0
          ? [{ label: "Names", value: task.symbols.join(", ") }]
          : []),
        ...(task.themes.length > 0
          ? [{ label: "Themes", value: task.themes.map((t) => t.name).join(", ") }]
          : []),
      ],
      href: "/briefing",
      hrefLabel: "Briefing",
    });
    details.set(`calendar:${task.id}`, {
      id: `calendar:${task.id}`,
      kind: "calendar",
      at: task.due_by ?? task.scheduled_for ?? task.not_before ?? task.created_at,
      symbol: task.symbols[0] ?? null,
      title: task.title,
      fields: [
        { label: "Scope", value: task.scope },
        { label: "Status", value: task.status },
        { label: "What to check", value: task.instructions },
        ...(task.symbols.length > 0
          ? [{ label: "Names", value: task.symbols.join(", ") }]
          : []),
      ],
      href: "/calendar",
      hrefLabel: "Calendar",
    });
  }

  return { events, details };
}
