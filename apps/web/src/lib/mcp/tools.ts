import { z } from "zod";

import type { AgentScope } from "@/lib/api/agent/scopes";

import type { Json, PowerFundAgentClient, WriteOptions } from "./agent-client";
import {
  actorName,
  ASSET_CLASSES,
  DECISION_TYPES,
  dossierChanges,
  isoDate,
  isoDateTime,
  PLANNED_ACTION_AGENT_STATUSES,
  PLANNED_ACTION_TYPES,
  QUALITY_GRADES,
  RESEARCH_KINDS,
  REVIEW_AGENT_STATUSES,
  REVIEW_OUTPUT_KINDS,
  REVIEW_PRIORITIES,
  REVIEW_QUEUE_STATUSES,
  REVIEW_SCOPES,
  reviewTrigger,
  symbol,
  THESIS_GRADES,
  uuid,
} from "./schemas";

/**
 * The PowerFund MCP tool surface.
 *
 * REST is the application interface and keeps one operation per resource.
 * These tools are the agent's interface: named for what the agent is trying to
 * do, described by *when* to use them, and grouped so that a tool never mixes
 * operations of different risk. Reads are separate from writes; every write
 * maps to exactly one REST write, because each is a distinct thing the
 * operator approves. The one composite tool, `get_review_context`, only reads.
 *
 * There is deliberately no tool for fills, cash, transactions or SQL — the
 * REST API has no path to them either, and a human books every fill.
 */

export type ToolAnnotations = {
  readOnlyHint: boolean;
  destructiveHint: boolean;
  idempotentHint: boolean;
  openWorldHint: boolean;
};

export type ToolContext = {
  client: PowerFundAgentClient;
  /** Idempotency options for this call's write, derived by the server. */
  write: WriteOptions;
};

export type PowerFundTool<Shape extends z.ZodRawShape = z.ZodRawShape> = {
  name: string;
  title: string;
  description: string;
  inputSchema: Shape;
  /** Every scope listed is required. Checked before the call, and again by REST. */
  scopes: readonly AgentScope[];
  annotations: ToolAnnotations;
  /** Backing REST operationIds, for the catalog and the drift test. */
  operations: readonly string[];
  handler: (args: z.infer<z.ZodObject<Shape>>, ctx: ToolContext) => Promise<Json>;
};

function defineTool<Shape extends z.ZodRawShape>(tool: PowerFundTool<Shape>) {
  return tool as unknown as PowerFundTool;
}

/**
 * Reads. `openWorldHint` is false everywhere: every tool touches only
 * PowerFund's own store, never the open internet.
 *
 * `readOnlyHint: true` is literal. The REST reads behind get_fund_state and
 * list_reviews latch fired review triggers (pending → due) by default; these
 * tools ask for `evaluate=preview`, which reports a fired trigger as due
 * without writing it. The latch runs after each bars ingest instead
 * (packages/db review-triggers.ts). tools.test.ts runs every read tool
 * against a recording client, and agent-client.test.ts checks the preview
 * path writes nothing.
 */
const READ: ToolAnnotations = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: false,
};

/** An append: a new row, nothing existing is changed or lost. */
const APPEND: ToolAnnotations = {
  readOnlyHint: false,
  destructiveHint: false,
  idempotentHint: false,
  openWorldHint: false,
};

/**
 * Closes something for good: there is no supported path back. Completing a
 * review is refused a second time, and no endpoint reopens it, so the call
 * is destructive in the sense that matters: it cannot be undone.
 */
const FINALIZE: ToolAnnotations = {
  readOnlyHint: false,
  destructiveHint: true,
  idempotentHint: false,
  openWorldHint: false,
};

/** Changes an existing row in a way that can withdraw or overwrite intent. */
const MODIFY: ToolAnnotations = {
  readOnlyHint: false,
  destructiveHint: true,
  idempotentHint: true,
  openWorldHint: false,
};

function compact<T extends Record<string, unknown>>(value: T): T {
  return Object.fromEntries(
    Object.entries(value).filter(([, next]) => next !== undefined),
  ) as T;
}

function list(values: readonly string[] | undefined): string | undefined {
  return values && values.length > 0 ? values.join(",") : undefined;
}

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

const getFundState = defineTool({
  name: "get_fund_state",
  title: "Get fund state and what is due",
  description:
    "Start here for the daily briefing sweep and for 'what is due today?'. Returns the mandate and capital phase, cash, holdings, flags (including the kill-switch diagnostic), the open deployment queue, due and upcoming review tasks, recent decisions and current dossier version pointers, plus the watchlist and themes unless include_watchlist is false. Use get_portfolio for position-level marks and get_performance for returns.",
  inputSchema: {
    recent_decisions: z
      .number()
      .int()
      .min(1)
      .max(50)
      .optional()
      .describe("How many recent journal rows to include. Default 20."),
    include_watchlist: z
      .boolean()
      .optional()
      .describe("Include the research universe and themes. Default true; set false for a smaller snapshot."),
  },
  scopes: ["powerfund:state:read"],
  annotations: READ,
  operations: ["getFundState"],
  handler: (args, { client }) =>
    client.getFundState(compact({ ...args, evaluate: "preview" })),
});

const getPortfolio = defineTool({
  name: "get_portfolio",
  title: "Get the portfolio book",
  description:
    "Use when judging exposure, position size, weights, cash or cap headroom, or before proposing an allocation. Returns the ledger-derived book: NAV, cash, invested cost against the capital-phase cap, each position's quantity, cost, last close and last_close_session, and mandate flags. Check price_data_through before treating marks as current. Returns are not here; use get_performance.",
  inputSchema: {},
  scopes: ["powerfund:portfolio:read"],
  annotations: READ,
  operations: ["getPortfolio"],
  handler: (_args, { client }) => client.getPortfolio(),
});

const getPerformance = defineTool({
  name: "get_performance",
  title: "Get performance vs SPY and QQQ",
  description:
    "Use for the scoreboard: NAV and deployed-capital time-weighted returns against SPY and QQQ, current and maximum unitized drawdowns, and dollar contribution by ticker, theme and factor. Returns are percent; pnl_usd is dollars. Optional from/to window. Per-decision returns are on get_journal instead.",
  inputSchema: {
    from: isoDate.optional().describe("Inclusive start, YYYY-MM-DD. Omit for since inception."),
    to: isoDate.optional().describe("Inclusive end, YYYY-MM-DD. Omit to include today's mark."),
  },
  scopes: ["powerfund:portfolio:read"],
  annotations: READ,
  operations: ["getPerformance"],
  handler: (args, { client }) => client.getPerformance(compact({ ...args })),
});

const getRiskSnapshot = defineTool({
  name: "get_risk_snapshot",
  title: "Get the Workbench risk snapshot",
  description:
    "Use for the quarterly book review, factor or correlation questions, and 'what does the capex stress say?'. Returns the exact Workbench → Risk calculations, read-only: pairwise return correlations with their window and method, AI-capex / AI-memory / diversifier and theme concentration against the caps, and the standing hyperscaler-capex −20% stress (NAV impact, by holding, by theme, by factor, with its assumptions). Quote these numbers; do not recompute them. Check price_data_through first.",
  inputSchema: {
    universe: z
      .enum(["holdings", "all"])
      .optional()
      .describe("holdings (default): pairs of held names. all: also investigate / active_thesis names in the Workbench matrix."),
    min_abs_correlation: z
      .number()
      .min(0)
      .max(1)
      .optional()
      .describe("Only pairs with |correlation| at or above this, e.g. 0.6. Omit for every pair."),
  },
  scopes: ["powerfund:portfolio:read"],
  annotations: READ,
  operations: ["getRiskSnapshot"],
  handler: (args, { client }) => client.getRiskSnapshot(compact({ ...args })),
});

const getResearchInbox = defineTool({
  name: "get_research_inbox",
  title: "Get the research inbox",
  description:
    "Use for 'what is in the research inbox?' and watchlist hygiene. Returns the Briefing Research tab exactly as the UI derives it: names needing a first dossier, dossiers past their next_review_at, and dossiers whose 14-day diligence clock has lapsed. This is a backlog, not the daily sweep. An item clears only when update_dossier moves the clock that kind uses.",
  inputSchema: {
    kinds: z
      .array(z.enum(RESEARCH_KINDS))
      .min(1)
      .optional()
      .describe("Restrict to these kinds. Omit for all."),
  },
  scopes: ["powerfund:dossier:read"],
  annotations: READ,
  operations: ["getResearchInbox"],
  handler: (args, { client }) =>
    client.getResearchInbox(compact({ kind: list(args.kinds) })),
});

const getDossier = defineTool({
  name: "get_dossier",
  title: "Get a company dossier",
  description:
    "Use when asked for a company's dossier, thesis, kill criteria or research status, and before any update_dossier (you need current_version for expected_version). Returns instrument metadata, the live dossier, its current version number, and last_close with last_close_session; price_data_stale means the last completed US session is missing. For a full re-underwrite or reassessment, prefer get_review_context, which includes this.",
  inputSchema: { symbol },
  scopes: ["powerfund:dossier:read"],
  annotations: READ,
  operations: ["getCompanyDossier"],
  handler: (args, { client }) => client.getCompanyDossier(args.symbol),
});

const listDossierVersions = defineTool({
  name: "list_dossier_versions",
  title: "List dossier versions",
  description:
    "Use to see how a thesis has changed over time: returns immutable version headers (number, change_reason, created_at) without bodies. Then fetch the versions you need with get_dossier_version and compare them yourself; there is no diff.",
  inputSchema: { symbol },
  scopes: ["powerfund:dossier:read"],
  annotations: READ,
  operations: ["getDossierVersions"],
  handler: (args, { client }) => client.getDossierVersions(args.symbol),
});

const getDossierVersion = defineTool({
  name: "get_dossier_version",
  title: "Get one dossier version",
  description:
    "Use to answer 'what did we believe when we made that decision?': returns the dossier exactly as it stood at one version. Pass the version number, or the dossier_version.id pinned on a journal entry. Never use the live dossier as a stand-in for a past belief.",
  inputSchema: {
    symbol,
    // A model sends a version number as 3 as often as "3"; accept both
    // rather than refuse an obviously meaningful request.
    version: z
      .union([z.number().int().min(1), z.string().trim().min(1)])
      .describe("Version number such as 3, or a dossier_version UUID from a journal entry."),
  },
  scopes: ["powerfund:dossier:read"],
  annotations: READ,
  operations: ["getDossierVersion"],
  handler: (args, { client }) => client.getDossierVersion(args.symbol, String(args.version)),
});

const getJournal = defineTool({
  name: "get_journal",
  title: "Read the decision journal",
  description:
    "Use for 'what did we decide about X and why?', last week's hold before a weekly holding review, and the grading worklist (horizon_due=true). Each entry has the pinned dossier_version, 30/90/180-day returns vs SPY from its anchor, and any recorded outcomes. An entry's id is its decision_id; the pinned dossier_version.id is a different id.",
  inputSchema: {
    symbol: symbol.optional(),
    decision_type: z
      .enum([...DECISION_TYPES, "material"])
      .optional()
      .describe("Filter to one type. 'material' means enter, add, reduce and exit."),
    date_from: isoDateTime.optional().describe("Inclusive lower bound on action_at."),
    date_to: isoDateTime.optional().describe("Inclusive upper bound on action_at."),
    before: isoDateTime.optional().describe("Page backwards: rows older than this action_at."),
    limit: z.number().int().min(1).max(100).optional().describe("Page size. Default 50."),
    graded: z
      .boolean()
      .optional()
      .describe("false: never graded at all. Not the grading worklist; use horizon_due for that."),
    horizon_due: z
      .boolean()
      .optional()
      .describe("true: decisions with an elapsed 30/90/180-day horizon still owed a grade."),
  },
  scopes: ["powerfund:journal:read"],
  annotations: READ,
  operations: ["getJournal"],
  handler: (args, { client }) => client.getJournal(compact({ ...args })),
});

const getCalibrationStatus = defineTool({
  name: "get_calibration_status",
  title: "Get the decision-grading worklist",
  description:
    "Use to scope and then reconcile a grading run (ritual 12): the whole worklist of decisions owed a 30/90/180-day grade, split by decision class, what has already been recorded, and which decisions can never be graded (no_fill). Read it again after a batch of record_decision_outcome calls to confirm every grade landed on the intended decision.",
  inputSchema: {},
  scopes: ["powerfund:journal:read"],
  annotations: READ,
  operations: ["getCalibrationStatus"],
  handler: (_args, { client }) => client.getCalibrationStatus(),
});

const listPlannedActions = defineTool({
  name: "list_planned_actions",
  title: "List the deployment queue",
  description:
    "Use to see intended trades — pending and deferred buy/add/reduce/sell — and to find a planned_action_id before update_planned_action. These are intentions, not executions: a human books every fill in the PowerFund UI.",
  inputSchema: {},
  scopes: ["powerfund:deployment:read"],
  annotations: READ,
  operations: ["getPlannedActions"],
  handler: (_args, { client }) => client.getPlannedActions(),
});

const listReviews = defineTool({
  name: "list_reviews",
  title: "List review tasks and review history",
  description:
    "The catalyst calendar and the book's review record. Open statuses are the work queue (use status ['due'] for what is due now); status ['completed'] is what the book concluded — the prior beliefs to load before a comparable review. symbols matches any review linked to the name but never reaches scope=portfolio reviews; ask for scope 'portfolio' separately. symbols and themes together are a union. If truncated is true, raise limit or narrow the window.",
  inputSchema: {
    status: z
      .array(z.enum(REVIEW_QUEUE_STATUSES))
      .min(1)
      .optional()
      .describe("Default ['open']."),
    scope: z.enum(REVIEW_SCOPES).optional(),
    symbols: z.array(symbol).min(1).optional(),
    themes: z
      .array(z.string().trim().min(1))
      .min(1)
      .optional()
      .describe("Theme slugs or names, e.g. ai-infrastructure."),
    completed_since: z
      .string()
      .optional()
      .describe("ISO date or date-time on completed_at. A bare date is the start of that UTC day."),
    completed_before: z.string().optional(),
    limit: z.number().int().min(1).max(500).optional().describe("Default 100."),
    order: z
      .enum(["asc", "desc"])
      .optional()
      .describe("Defaults to newest first for completed-only queries, oldest first otherwise."),
  },
  scopes: ["powerfund:reviews:read"],
  annotations: READ,
  operations: ["getReviewQueue"],
  handler: (args, { client }) =>
    client.getReviewQueue(
      compact({
        status: list(args.status),
        scope: args.scope,
        symbol: list(args.symbols),
        theme: list(args.themes),
        completed_since: args.completed_since,
        completed_before: args.completed_before,
        limit: args.limit,
        order: args.order,
        evaluate: "preview",
      }),
    ),
});

type ReviewQueueBody = { tasks?: unknown[]; truncated?: boolean };
type PlannedActionRow = { symbol?: unknown };

const getReviewContext = defineTool({
  name: "get_review_context",
  title: "Load the prior-beliefs pack for a review",
  description:
    "Use FIRST when re-underwriting a name, reassessing a trigger or planned add, running a weekly holding review, asking what conditions remain before allocating, or completing any company/theme review. Loads all three memories in one call: the live dossier and recent journal for the symbol, completed reviews linked to the symbol or theme, the book-level portfolio review chain (which symbol filters can never reach), open reviews on the name, and open planned actions for it. Read-only. State previous belief → new evidence → updated belief before writing anything.",
  inputSchema: {
    symbol: symbol.optional().describe("Ticker to load. Give symbol, theme, or both."),
    theme: z
      .string()
      .trim()
      .min(1)
      .optional()
      .describe("Theme slug or name, for a theme review."),
    history_limit: z
      .number()
      .int()
      .min(1)
      .max(20)
      .optional()
      .describe("Completed reviews to load per chain. Default 5."),
    journal_limit: z
      .number()
      .int()
      .min(1)
      .max(50)
      .optional()
      .describe("Journal entries for the symbol. Default 10."),
  },
  scopes: [
    "powerfund:dossier:read",
    "powerfund:journal:read",
    "powerfund:reviews:read",
    "powerfund:deployment:read",
  ],
  annotations: READ,
  operations: [
    "getCompanyDossier",
    "getJournal",
    "getReviewQueue",
    "getPlannedActions",
  ],
  handler: async (args, { client }) => {
    if (!args.symbol && !args.theme) {
      throw new ToolInputError("Give a symbol, a theme, or both.");
    }
    const historyLimit = args.history_limit ?? 5;
    const upper = args.symbol?.toUpperCase();

    // Every section is required. A context pack missing one memory is the
    // partial chain of reasoning the historical review gate exists to
    // prevent, so any failure fails the whole call rather than returning
    // what happened to load.
    const [dossier, journal, linkedHistory, portfolioChain, openReviews, queue] =
      await Promise.all([
        args.symbol ? client.getCompanyDossier(args.symbol) : null,
        args.symbol
          ? client.getJournal({ symbol: args.symbol, limit: args.journal_limit ?? 10 })
          : null,
        client.getReviewQueue(
          compact({
            status: "completed",
            symbol: args.symbol,
            theme: args.theme,
            limit: historyLimit,
          }),
        ),
        client.getReviewQueue({
          status: "completed",
          scope: "portfolio",
          limit: historyLimit,
        }),
        client.getReviewQueue(
          compact({
            status: "open",
            symbol: args.symbol,
            theme: args.theme,
            // Show fired triggers as due without recording it: a pure read.
            evaluate: "preview",
          }),
        ),
        args.symbol ? client.getPlannedActions() : null,
      ]);

    const plannedRows = Array.isArray((queue as { actions?: unknown } | null)?.actions)
      ? (queue as { actions: PlannedActionRow[] }).actions
      : [];

    return compact({
      symbol: upper,
      theme: args.theme,
      reading_order:
        "journal (last belief) → linked_review_history (catalysts) → portfolio_review_chain (book-level beliefs) → dossier (current thesis). State previous belief → new evidence → updated belief.",
      dossier: dossier ?? undefined,
      journal: journal ?? undefined,
      linked_review_history: linkedHistory as ReviewQueueBody,
      portfolio_review_chain: portfolioChain as ReviewQueueBody,
      open_reviews: openReviews as ReviewQueueBody,
      open_planned_actions:
        upper == null
          ? undefined
          : plannedRows.filter(
              (row) => String(row.symbol ?? "").toUpperCase() === upper,
            ),
    });
  },
});

// ---------------------------------------------------------------------------
// Writes. Each is one REST write the operator approves; none books a fill.
// ---------------------------------------------------------------------------

const updateDossier = defineTool({
  name: "update_dossier",
  title: "Update a company dossier",
  description:
    "Write research to the live dossier after the user approves the change: a re-underwrite, a first dossier (version 1) for a new name, refreshed scenarios, or advancing next_review_at. Call get_dossier first and pass its current version as expected_version; a stale version is refused rather than overwriting newer work. A new immutable version is created only if the content actually changed. Every earlier version is kept. `source` is rendered as Markdown on the PowerFund website. Use descriptive Markdown links (`[title](URL)`) for external sources. URLs supplied in `research_sources` are not automatically rendered into `source`.",
  inputSchema: {
    symbol,
    expected_version: z
      .number()
      .int()
      .min(0)
      .nullable()
      .describe(
        "current_version.number from get_dossier (0 if the dossier exists with no version). null only when get_dossier returned no dossier at all — a first write, which also needs changes.summary.",
      ),
    change_reason: z
      .string()
      .trim()
      .min(1)
      .describe("Why this write is happening, e.g. 'Q3 print re-underwrite'."),
    changes: dossierChanges,
    research_sources: z
      .array(z.string())
      .optional()
      .describe(
        "URLs or citations consulted, recorded in the change reason only. Not rendered on the website and not copied into source: put every cited document in changes.source as [title](URL).",
      ),
    actor_name: actorName,
  },
  scopes: ["powerfund:dossier:write"],
  // Overwrites live text; nothing is lost because versions are immutable,
  // but it does replace what the dossier currently says.
  annotations: { ...MODIFY, idempotentHint: true },
  operations: ["updateDossier"],
  handler: (args, { client, write }) =>
    client.updateDossier(
      args.symbol,
      compact({
        // A first write must omit it: the database compares against a NULL
        // current version, and 0 would be refused as a conflict.
        expected_version: args.expected_version ?? undefined,
        change_reason: args.change_reason,
        changes: args.changes,
        research_sources: args.research_sources,
        actor_name: args.actor_name,
      }),
      write,
    ),
});

const recordDecision = defineTool({
  name: "record_decision",
  title: "Record a journal decision",
  description:
    "Append a decision to the journal after the user approves it: this week's hold (which is what completes a weekly holding review), or an enter/add/reduce/exit/watch conclusion. The current dossier version is pinned automatically. This records a judgement; it does not trade. Journal rows are never edited — a new conclusion is a new row. One name per call.",
  inputSchema: {
    symbol,
    decision_type: z.enum(DECISION_TYPES),
    thesis: z.string().trim().min(1).describe("The conclusion and why."),
    catalysts: z.string().optional(),
    risks: z.string().optional(),
    invalidation: z.string().optional().describe("Kill criteria as they stand now."),
    sizing_rationale: z.string().optional(),
    action_at: isoDateTime.optional().describe("When the decision was made. Default now."),
    actor_name: actorName,
  },
  scopes: ["powerfund:journal:append"],
  annotations: APPEND,
  operations: ["createDecision"],
  handler: (args, { client, write }) => client.createDecision(compact({ ...args }), write),
});

const recordDecisionOutcome = defineTool({
  name: "record_decision_outcome",
  title: "Grade a past decision",
  description:
    "Append a structured grade to a journal decision (ritual 12, or an off-clock observation on exit) once the user has approved the grade or the batch. decision_id is the journal entry's id — not its dossier_version.id. horizon_days is required: 30, 90 or 180 for a clocked grade, null for an off-clock note. Grade on evidence available at the horizon cutoff, not today. Grades are append-only and one per decision per horizon.",
  inputSchema: {
    decision_id: uuid("Journal decision (the entry's id)"),
    horizon_days: z
      .union([z.literal(30), z.literal(90), z.literal(180), z.null()])
      .describe("30, 90 or 180 for a clocked grade; null for an off-clock observation."),
    thesis_grade: z.enum(THESIS_GRADES),
    timing_grade: z.enum(QUALITY_GRADES).optional(),
    sizing_grade: z.enum(QUALITY_GRADES).optional(),
    risk_management_grade: z.enum(QUALITY_GRADES).optional(),
    lessons: z
      .string()
      .trim()
      .min(1)
      .describe("Behaviour to repeat or change. Not a P&L restatement."),
    actor_name: actorName,
  },
  scopes: ["powerfund:journal:append"],
  annotations: APPEND,
  operations: ["recordDecisionOutcome"],
  handler: (args, { client, write }) => {
    const { decision_id, ...body } = args;
    // horizon_days must be sent even when null: absent and null differ.
    return client.recordDecisionOutcome(
      decision_id,
      { ...compact(body), horizon_days: args.horizon_days },
      write,
    );
  },
});

const createPlannedAction = defineTool({
  name: "create_planned_action",
  title: "Queue an intended trade",
  description:
    "Queue an intended buy/add/reduce/sell after the user approves it and, for buy or add, after the dossier/data-integrity gate has passed. Send exactly one of planned_usd or target_weight_pct. This is an intention on the deployment queue only: it never books a fill, and the mandate gate may still refuse it. A human confirms every fill in the PowerFund UI.",
  inputSchema: {
    symbol,
    action_type: z.enum(PLANNED_ACTION_TYPES).describe("buy for a first entry, add for a later tranche."),
    planned_usd: z.number().positive().optional().describe("Dollar size."),
    target_weight_pct: z
      .number()
      .positive()
      .max(100)
      .optional()
      .describe("Alternative to planned_usd; converted using current NAV."),
    window_label: z.string().optional().describe("Entry condition, e.g. price_below:290."),
    due_by: isoDate.optional(),
    rationale: z.string().trim().min(1).describe("Why, in plain text. No [agent:…] tag."),
    actor_name: actorName,
  },
  scopes: ["powerfund:deployment:write"],
  annotations: APPEND,
  operations: ["createPlannedAction"],
  handler: async (args, { client, write }) => {
    // Exactly one sizing: with both, the API silently prefers planned_usd;
    // with neither, it refuses later with a less useful message.
    if ((args.planned_usd == null) === (args.target_weight_pct == null)) {
      throw new ToolInputError("Give exactly one of planned_usd or target_weight_pct.");
    }
    return client.createPlannedAction(compact({ ...args }), write);
  },
});

const updatePlannedAction = defineTool({
  name: "update_planned_action",
  title: "Revise, defer or cancel an intended trade",
  description:
    "Change an open planned action after the user approves it: defer it when the window no longer holds, cancel it when the thesis is done, or revise its size, window, due date or rationale. Get the id from list_planned_actions or get_review_context. It cannot confirm or book a fill.",
  inputSchema: {
    planned_action_id: uuid("Planned action"),
    status: z.enum(PLANNED_ACTION_AGENT_STATUSES).optional(),
    action_type: z.enum(PLANNED_ACTION_TYPES).optional(),
    planned_usd: z.number().positive().optional(),
    target_weight_pct: z.number().positive().max(100).optional(),
    window_label: z.string().optional(),
    due_by: isoDate.optional(),
    rationale: z.string().optional().describe("Reason for the change. No [agent:…] tag."),
    actor_name: actorName,
  },
  scopes: ["powerfund:deployment:write"],
  annotations: MODIFY,
  operations: ["updatePlannedAction"],
  handler: async (args, { client, write }) => {
    if (args.planned_usd != null && args.target_weight_pct != null) {
      throw new ToolInputError("Give at most one of planned_usd or target_weight_pct.");
    }
    const { planned_action_id, ...body } = args;
    return client.updatePlannedAction(planned_action_id, compact(body), write);
  },
});

const createReviewTask = defineTool({
  name: "create_review_task",
  title: "Add a dated review to the calendar",
  description:
    "After the user approves it, add a dated, actionable obligation to the catalyst calendar: an earnings print, event window, policy decision or price condition (scope company/theme/macro), or a book-level ritual such as 'Monthly book pass — YYYY-MM' (scope portfolio, no symbols). Check list_reviews for an existing task first and update it instead of duplicating. Not for weekly holds (use record_decision) and never a trade.",
  inputSchema: {
    title: z.string().trim().min(1),
    instructions: z
      .string()
      .trim()
      .min(1)
      .describe("The checklist for the day it comes due. Say whether the date is confirmed or estimated."),
    scope: z.enum(REVIEW_SCOPES).describe("company needs symbols; theme needs existing theme slugs; portfolio carries none."),
    priority: z.enum(REVIEW_PRIORITIES).optional(),
    symbols: z.array(symbol).optional(),
    themes: z.array(z.string().trim().min(1)).optional(),
    trigger: reviewTrigger,
  },
  scopes: ["powerfund:reviews:write"],
  annotations: APPEND,
  operations: ["createReviewTask"],
  handler: (args, { client, write }) => client.createReviewTask(compact({ ...args }), write),
});

const updateReviewTask = defineTool({
  name: "update_review_task",
  title: "Update a review on the calendar",
  description:
    "After the user approves it, change an open review task: thicken its instructions, promote an estimated event_window to a confirmed scheduled date, relink symbols/themes, or set status to in_progress, deferred or cancelled. Cannot mark a task due or completed — triggers mark due, and complete_review_task finishes it.",
  inputSchema: {
    review_task_id: uuid("Review task"),
    title: z.string().trim().min(1).optional(),
    instructions: z.string().trim().min(1).optional(),
    scope: z.enum(REVIEW_SCOPES).optional(),
    priority: z.enum(REVIEW_PRIORITIES).optional(),
    status: z.enum(REVIEW_AGENT_STATUSES).optional(),
    symbols: z.array(symbol).optional(),
    themes: z.array(z.string().trim().min(1)).optional(),
    trigger: reviewTrigger.optional(),
  },
  scopes: ["powerfund:reviews:write"],
  annotations: MODIFY,
  operations: ["updateReviewTask"],
  handler: (args, { client, write }) => {
    const { review_task_id, ...body } = args;
    return client.updateReviewTask(review_task_id, compact(body), write);
  },
});

const completeReviewTask = defineTool({
  name: "complete_review_task",
  title: "Record a review's outcome",
  description:
    "After the user approves the conclusion, close a review task with its written outcome: cite the prior beliefs you loaded and whether they held, and link any dossier_version, decision or planned_action ids you created for it. Creates none of those itself. For a monthly or quarterly book review, create the next period's task afterwards unless one is already open.",
  inputSchema: {
    review_task_id: uuid("Review task"),
    outcome: z
      .string()
      .trim()
      .min(1)
      .describe("What the review concluded: previous belief → new evidence → updated belief."),
    outputs: z
      .array(
        z.strictObject({
          kind: z.enum(REVIEW_OUTPUT_KINDS),
          entity_id: uuid("Linked row"),
        }),
      )
      .optional(),
  },
  scopes: ["powerfund:reviews:write"],
  annotations: FINALIZE,
  operations: ["completeReviewTask"],
  handler: (args, { client, write }) => {
    const { review_task_id, ...body } = args;
    return client.completeReviewTask(review_task_id, compact(body), write);
  },
});

const addWatchlistCompany = defineTool({
  name: "add_watchlist_company",
  title: "Add a company to the research universe",
  description:
    "After the user approves it, add a new ticker to the watchlist under an existing theme (ai-infrastructure, energy, robotics-ai, defence, other). Check get_fund_state's watchlist first; a duplicate is refused. It creates no dossier, planned trade or fill — write the first dossier with update_dossier.",
  inputSchema: {
    symbol,
    name: z.string().trim().min(1).describe("Company name."),
    theme: z.string().trim().min(1).describe("Existing theme slug or name."),
    notes: z.string().optional(),
    asset_class: z.enum(ASSET_CLASSES).optional().describe("Default equity."),
    exchange: z.string().optional().describe("Listing venue. Default US; non-USD listings cannot be booked."),
    actor_name: actorName,
  },
  scopes: ["powerfund:watchlist:write"],
  annotations: APPEND,
  operations: ["addWatchlistCompany"],
  handler: (args, { client, write }) => client.addWatchlistCompany(compact({ ...args }), write),
});

const setWatchlistArchived = defineTool({
  name: "set_watchlist_archived",
  title: "Archive or restore a watchlist name",
  description:
    "Only when the user explicitly asks to drop a name from the opportunity set (archived true) or bring one back (archived false). Refused while a position is open. Watchlist and active status follow the book and cannot be set.",
  inputSchema: {
    symbol,
    archived: z.boolean(),
  },
  scopes: ["powerfund:watchlist:write"],
  annotations: MODIFY,
  operations: ["setWatchlistArchived"],
  handler: (args, { client, write }) =>
    client.setWatchlistArchived(args.symbol, { archived: args.archived }, write),
});

export class ToolInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ToolInputError";
  }
}

export const POWERFUND_TOOLS: readonly PowerFundTool[] = [
  getFundState,
  getPortfolio,
  getPerformance,
  getRiskSnapshot,
  getResearchInbox,
  getReviewContext,
  getDossier,
  listDossierVersions,
  getDossierVersion,
  getJournal,
  getCalibrationStatus,
  listPlannedActions,
  listReviews,
  updateDossier,
  recordDecision,
  recordDecisionOutcome,
  createPlannedAction,
  updatePlannedAction,
  createReviewTask,
  updateReviewTask,
  completeReviewTask,
  addWatchlistCompany,
  setWatchlistArchived,
];
