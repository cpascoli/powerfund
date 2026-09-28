import { z } from "zod";

/**
 * Shared input fragments. Enumerations mirror `@powerfund/domain` and the
 * agent OpenAPI document; `tools.test.ts` asserts they have not drifted, so
 * a new decision type cannot be accepted by REST and refused by MCP.
 */

export const symbol = z
  .string()
  .trim()
  .min(1)
  .max(20)
  .describe("Ticker exactly as PowerFund stores it, e.g. SNDK or MRCY.");

export const uuid = (what: string) =>
  z.uuid().describe(`${what} UUID, copied from an earlier PowerFund result. Never guess it.`);

export const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD.")
  .describe("Calendar date, YYYY-MM-DD.");

export const isoDateTime = z
  .string()
  .min(10)
  .describe("ISO 8601 date-time, e.g. 2026-10-21T00:00:00Z.");

export const actorName = z
  .string()
  .trim()
  .min(1)
  .max(60)
  .optional()
  .describe(
    "The name you go by. The server stamps it on the row as attribution. Never write an [agent:…] tag into any text field yourself.",
  );

export const DECISION_TYPES = ["enter", "add", "reduce", "exit", "hold", "watch"] as const;
export const PLANNED_ACTION_TYPES = ["buy", "add", "reduce", "sell"] as const;
export const PLANNED_ACTION_AGENT_STATUSES = ["pending", "deferred", "cancelled"] as const;
export const REVIEW_SCOPES = ["company", "theme", "macro", "portfolio"] as const;
export const REVIEW_PRIORITIES = ["low", "normal", "high", "urgent"] as const;
export const REVIEW_AGENT_STATUSES = ["pending", "in_progress", "deferred", "cancelled"] as const;
export const REVIEW_QUEUE_STATUSES = [
  "open",
  "all",
  "pending",
  "due",
  "in_progress",
  "completed",
  "deferred",
  "cancelled",
] as const;
export const REVIEW_OUTPUT_KINDS = ["dossier_version", "decision", "planned_action"] as const;
export const THESIS_GRADES = ["correct", "partly_correct", "wrong"] as const;
export const QUALITY_GRADES = ["good", "mixed", "poor"] as const;
export const DOSSIER_STATUSES = ["watch", "investigate", "active_thesis", "passed"] as const;
export const RESEARCH_LEVELS = [
  "draft",
  "screened",
  "primary_verified",
  "investment_ready",
] as const;
export const RESEARCH_KINDS = ["needs_dossier", "review_due_date", "diligence"] as const;
export const ASSET_CLASSES = ["equity", "etf", "commodity_proxy", "other"] as const;

const conditionOperator = z.enum(["lt", "lte", "gt", "gte", "eq"]);

export const reviewTrigger = z
  .discriminatedUnion("type", [
    z.strictObject({
      type: z.literal("scheduled"),
      at: isoDateTime.describe(
        "When the review becomes due. Only for a date the company or authority has CONFIRMED.",
      ),
    }),
    z.strictObject({
      type: z.literal("event_window"),
      not_before: isoDateTime.describe("Window opens; the task becomes due then."),
      due_by: isoDateTime.describe("End of the plausible window. The task stays due after it."),
    }),
    z.strictObject({
      type: z.literal("condition"),
      metric: z
        .string()
        .min(1)
        .describe("price or price_return_pct are evaluated automatically; any other metric waits for an agent."),
      symbol,
      operator: conditionOperator,
      value: z.number(),
      lookback_days: z
        .number()
        .int()
        .min(1)
        .optional()
        .describe("Required when metric is price_return_pct."),
    }),
  ])
  .describe(
    "scheduled = confirmed date; event_window = estimated date (use this for third-party or inferred dates); condition = price level or return. A trigger never creates a trade.",
  );

/** Nullable where the REST API treats null as "clear this field". */
const clearable = (what: string) =>
  z.string().nullable().optional().describe(`${what} Send null to clear it.`);

export const dossierChanges = z
  .strictObject({
    status: z.enum(DOSSIER_STATUSES).optional(),
    research_level: z.enum(RESEARCH_LEVELS).optional(),
    summary: z.string().optional(),
    thesis: clearable("Investment thesis."),
    catalysts: clearable("Upcoming catalysts."),
    risks: clearable("Key risks."),
    invalidation: clearable("Kill criteria. Mandate rule 4 requires them for any held name."),
    competitive_notes: clearable("Competitive position."),
    next_diligence: clearable("What to check next."),
    source: clearable("Primary source links."),
    as_of_at: clearable("ISO date-time the research is current as of."),
    verified_at: clearable("ISO date-time the facts were last verified."),
    next_review_at: clearable(
      "ISO date-time of the next scheduled review. Advance or clear it when a review_due_date item is done, or the research inbox keeps it.",
    ),
  })
  .describe("Only the fields you are changing. Omit unchanged fields.");
