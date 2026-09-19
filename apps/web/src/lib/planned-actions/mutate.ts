import {
  isSellSide,
  OPEN_PLANNED_ACTION_STATUSES,
  PLANNED_ACTION_TYPES,
  type PlannedActionStatus,
  type PlannedActionType,
} from "@powerfund/domain";

import { notFound, validationError } from "@/lib/api/agent/errors";
import { mandateGate, type MandateSide } from "@/lib/mandate/enforce";
import { getOpenPortfolioBook } from "@/lib/data/portfolio";
import type { DbClient } from "@/lib/supabase/db";

const MAX_TEXT = 10_000;
const OPEN_STATUSES = new Set<string>(OPEN_PLANNED_ACTION_STATUSES);
const PATCHABLE_STATUSES = new Set<PlannedActionStatus>([
  "pending",
  "deferred",
  "cancelled",
]);

export type PlannedActionTrigger = {
  type: string;
  value?: number | string | null;
};

export type CreatePlannedActionInput = {
  symbol: string;
  action_type: PlannedActionType;
  planned_usd?: number | null;
  target_weight_pct?: number | null;
  window_label?: string | null;
  due_by?: string | null;
  rationale?: string | null;
  trigger?: PlannedActionTrigger | null;
  mandate_override_reason?: string | null;
  actor_name?: string | null;
};

export type UpdatePlannedActionInput = {
  action_type?: PlannedActionType;
  planned_usd?: number | null;
  target_weight_pct?: number | null;
  window_label?: string | null;
  due_by?: string | null;
  rationale?: string | null;
  trigger?: PlannedActionTrigger | null;
  status?: PlannedActionStatus;
  mandate_override_reason?: string | null;
  actor_name?: string | null;
};

export type PlannedActionRecord = {
  id: string;
  symbol: string;
  action_type: PlannedActionType;
  status: PlannedActionStatus;
  planned_usd: number;
  window_label: string | null;
  due_by: string | null;
  rationale: string | null;
  created_at: string;
  updated_at: string;
};

type PlannedDbRow = {
  id: string;
  instrument_id: string;
  action_type: PlannedActionType;
  status: PlannedActionStatus;
  planned_usd: number;
  window_label: string | null;
  due_by: string | null;
  rationale: string | null;
  created_at: string;
  updated_at: string;
};

function emptyToNull(value: string | null | undefined): string | null {
  if (value == null) return null;
  const trimmed = value.trim();
  return trimmed.length === 0 ? null : trimmed;
}

function isActionType(value: string): value is PlannedActionType {
  return (PLANNED_ACTION_TYPES as readonly string[]).includes(value);
}

function sideForActionType(actionType: PlannedActionType): MandateSide {
  return isSellSide(actionType) ? "sell" : "buy";
}

function formatTrigger(trigger: PlannedActionTrigger | null | undefined): string | null {
  if (!trigger || typeof trigger.type !== "string" || !trigger.type.trim()) {
    return null;
  }
  if (trigger.value == null || trigger.value === "") {
    return trigger.type.trim();
  }
  return `${trigger.type.trim()}:${String(trigger.value)}`;
}

/** A tag at the very front of the text, with whatever whitespace follows it. */
const LEADING_AGENT_TAG = /^\[agent:[^\]\n]+\]\s*/;

/**
 * Stamp who wrote this, exactly once.
 *
 * A PATCH that changes anything else still re-runs this over the *stored*
 * rationale, which already carries a tag, so every touch used to add another
 * one. Live rows reached `[agent:chatgpt]\n[agent:chatgpt]\n…` and, once a
 * second agent existed, `[agent:chatgpt]\n[agent:PowerFundAgent]\n…`. The stack
 * grows without bound and none of it is information: the newest tag is the only
 * one that says anything, because prepending puts the most recent writer first.
 *
 * So strip any leading tags before adding ours. Idempotent — re-stamping with
 * the same actor is a no-op, and with a different one it replaces rather than
 * accumulates. This field is a rationale, not an audit log.
 */
function withActor(text: string | null, actorName: string | null | undefined): string | null {
  const actor = emptyToNull(actorName);
  if (!actor) return text;
  let body = text ?? "";
  while (LEADING_AGENT_TAG.test(body)) {
    body = body.replace(LEADING_AGENT_TAG, "");
  }
  const rest = emptyToNull(body);
  const line = `[agent:${actor}]`;
  return rest ? `${line}\n${rest}` : line;
}

async function loadInstrument(
  supabase: DbClient,
  symbol: string,
): Promise<{ id: string; symbol: string }> {
  const normalized = symbol.trim().toUpperCase();
  const { data, error } = await supabase
    .from("instruments")
    .select("id, symbol")
    .eq("symbol", normalized)
    .maybeSingle();
  if (error) {
    throw new Error(`Failed to load instrument: ${error.message}`);
  }
  if (!data) {
    throw notFound("UNKNOWN_SYMBOL", `Unknown symbol: ${normalized}.`, {
      symbol: normalized,
    });
  }
  return data;
}

async function resolvePlannedUsd(
  supabase: DbClient,
  plannedUsd: number | null | undefined,
  targetWeightPct: number | null | undefined,
): Promise<number> {
  if (plannedUsd != null) {
    if (!Number.isFinite(plannedUsd) || plannedUsd <= 0) {
      throw validationError("planned_usd must be a positive dollar amount.");
    }
    return plannedUsd;
  }
  if (targetWeightPct != null) {
    if (!Number.isFinite(targetWeightPct) || targetWeightPct <= 0) {
      throw validationError("target_weight_pct must be a positive percentage.");
    }
    const book = await getOpenPortfolioBook(supabase);
    const usd = (book.nav * targetWeightPct) / 100;
    if (!(usd > 0)) {
      throw validationError(
        "Cannot convert target_weight_pct to dollars because NAV is zero.",
      );
    }
    return Math.round(usd * 100) / 100;
  }
  throw validationError("Provide planned_usd or target_weight_pct.");
}

function mapRow(
  row: PlannedDbRow,
  symbol: string,
): PlannedActionRecord {
  return {
    id: row.id,
    symbol,
    action_type: row.action_type,
    status: row.status,
    planned_usd: Number(row.planned_usd),
    window_label: row.window_label,
    due_by: row.due_by,
    rationale: row.rationale,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

export async function createPlannedAction(
  supabase: DbClient,
  input: CreatePlannedActionInput,
): Promise<PlannedActionRecord> {
  if (!isActionType(input.action_type)) {
    throw validationError("Invalid action_type.", {
      allowed: PLANNED_ACTION_TYPES,
    });
  }

  const instrument = await loadInstrument(supabase, input.symbol);
  const plannedUsd = await resolvePlannedUsd(
    supabase,
    input.planned_usd,
    input.target_weight_pct,
  );
  const windowLabel =
    emptyToNull(input.window_label) ?? formatTrigger(input.trigger);
  if (windowLabel && windowLabel.length > MAX_TEXT) {
    throw validationError("window_label is too long.");
  }
  const rationale = withActor(emptyToNull(input.rationale), input.actor_name);
  if (rationale && rationale.length > MAX_TEXT) {
    throw validationError("rationale is too long.");
  }
  const dueBy = emptyToNull(input.due_by);

  const gate = await mandateGate({
    instrumentId: instrument.id,
    costUsd: plannedUsd,
    overrideReason: emptyToNull(input.mandate_override_reason),
    side: sideForActionType(input.action_type),
    supabase,
  });
  if (!gate.ok) {
    throw validationError(gate.error, { code: "MANDATE_BLOCKED" });
  }

  const insertRationale =
    gate.violations.length > 0 && emptyToNull(input.mandate_override_reason)
      ? `Mandate override: ${input.mandate_override_reason}${rationale ? `\n${rationale}` : ""}`
      : rationale;

  const { data, error } = await supabase
    .from("planned_actions")
    .insert({
      instrument_id: instrument.id,
      action_type: input.action_type,
      planned_usd: plannedUsd,
      window_label: windowLabel,
      due_by: dueBy,
      rationale: insertRationale,
      status: "pending",
    })
    .select(
      "id, instrument_id, action_type, status, planned_usd, window_label, due_by, rationale, created_at, updated_at",
    )
    .single();

  if (error || !data) {
    throw new Error(error?.message ?? "Failed to create planned action.");
  }

  return mapRow(data as PlannedDbRow, instrument.symbol);
}

export async function updatePlannedAction(
  supabase: DbClient,
  id: string,
  input: UpdatePlannedActionInput,
): Promise<PlannedActionRecord> {
  const { data: existing, error: loadError } = await supabase
    .from("planned_actions")
    .select(
      "id, instrument_id, action_type, status, planned_usd, window_label, due_by, rationale, created_at, updated_at",
    )
    .eq("id", id)
    .maybeSingle();

  if (loadError) {
    throw new Error(loadError.message);
  }
  if (!existing) {
    throw notFound("UNKNOWN_PLANNED_ACTION", "Planned action not found.", { id });
  }

  const row = existing as PlannedDbRow;
  if (!OPEN_STATUSES.has(row.status) && input.status !== "pending") {
    throw validationError("This planned action is no longer open.", {
      status: row.status,
    });
  }
  // The clause above exists so a cancelled action can be revived. A confirmed one
  // has a ledger entry behind it, and reviving it puts a booked fill back in the
  // queue as work still to do.
  if (row.status === "confirmed") {
    throw validationError(
      "This action is already confirmed and cannot be reopened. Plan a new one.",
      { status: row.status },
    );
  }

  if (input.status != null && !PATCHABLE_STATUSES.has(input.status)) {
    throw validationError(
      "Agents cannot confirm fills. Status may be pending, deferred, or cancelled.",
      { status: input.status },
    );
  }
  if (input.action_type != null && !isActionType(input.action_type)) {
    throw validationError("Invalid action_type.", {
      allowed: PLANNED_ACTION_TYPES,
    });
  }

  const plannedUsd =
    input.planned_usd !== undefined || input.target_weight_pct != null
      ? await resolvePlannedUsd(supabase, input.planned_usd, input.target_weight_pct)
      : Number(row.planned_usd);

  // Gate on the action as it will be after this patch, never on the stored row:
  // a cancelled action revived to pending was last gated against a book that has
  // since moved, and a row flipped from `sell` to `buy` is a purchase that has
  // never met a cap.
  const nextActionType = input.action_type ?? row.action_type;
  const revivedToPending = input.status === "pending" && row.status !== "pending";
  if (
    plannedUsd !== Number(row.planned_usd) ||
    input.action_type != null ||
    revivedToPending
  ) {
    const gate = await mandateGate({
      instrumentId: row.instrument_id,
      costUsd: plannedUsd,
      overrideReason: emptyToNull(input.mandate_override_reason),
      side: sideForActionType(nextActionType),
      supabase,
    });
    if (!gate.ok) {
      throw validationError(gate.error, { code: "MANDATE_BLOCKED" });
    }
  }

  const { data: instrument } = await supabase
    .from("instruments")
    .select("symbol")
    .eq("id", row.instrument_id)
    .maybeSingle();

  const nextRationale =
    input.rationale !== undefined || input.actor_name
      ? withActor(
          input.rationale === undefined
            ? row.rationale
            : emptyToNull(input.rationale),
          input.actor_name,
        )
      : row.rationale;

  const { data, error } = await supabase
    .from("planned_actions")
    .update({
      action_type: nextActionType,
      planned_usd: plannedUsd,
      window_label:
        input.window_label !== undefined
          ? emptyToNull(input.window_label)
          : (formatTrigger(input.trigger) ?? row.window_label),
      due_by: input.due_by !== undefined ? emptyToNull(input.due_by) : row.due_by,
      rationale: nextRationale,
      status: input.status ?? row.status,
    })
    .eq("id", id)
    .select(
      "id, instrument_id, action_type, status, planned_usd, window_label, due_by, rationale, created_at, updated_at",
    )
    .single();

  if (error || !data) {
    throw new Error(error?.message ?? "Failed to update planned action.");
  }

  return mapRow(data as PlannedDbRow, instrument?.symbol ?? "—");
}

export function assertNotTransactionMutation(body: unknown): void {
  if (!body || typeof body !== "object") return;
  const record = body as Record<string, unknown>;
  const forbidden = [
    "quantity",
    "price",
    "confirmed_quantity",
    "confirmed_price",
    "kind",
    "cash_delta",
  ];
  const present = forbidden.filter((key) => key in record);
  if (present.length > 0) {
    throw validationError(
      "This API cannot book fills or ledger entries. Update intention only.",
      { rejected_fields: present },
    );
  }
}
