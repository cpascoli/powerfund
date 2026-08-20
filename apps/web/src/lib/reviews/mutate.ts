import type { Json } from "@powerfund/db";
import {
  REVIEW_OUTPUT_KINDS,
  PATCHABLE_REVIEW_TASK_STATUSES,
  denormalizedSchedule,
  isReviewOutputKind,
  isReviewTaskPriority,
  isReviewTaskScope,
  isReviewTaskStatus,
  parseReviewTrigger,
  ReviewTriggerParseError,
  type ReviewOutputKind,
  type ReviewTaskPriority,
  type ReviewTaskScope,
  type ReviewTaskStatus,
  type ReviewTrigger,
} from "@powerfund/domain";

import { notFound, validationError } from "@/lib/api/agent/errors";
import type { DbClient } from "@/lib/supabase/db";

import {
  hydrateReviewTask,
  loadInstrumentIdsBySymbol,
  loadReviewTaskRow,
  loadThemeIdsBySlug,
  triggerToJson,
  type ReviewTaskOutput,
  type ReviewTaskRecord,
} from "./records";

const MAX_TITLE = 500;
const MAX_TEXT = 50_000;
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const PATCHABLE = new Set<string>(PATCHABLE_REVIEW_TASK_STATUSES);

export function assertPatchableReviewTaskStatus(status: ReviewTaskStatus): void {
  if (status === "due" || status === "completed") {
    throw validationError(
      "Cannot set status to due or completed. Triggers mark due; POST /complete records completion.",
      { status },
    );
  }
  if (!PATCHABLE.has(status)) {
    throw validationError("Invalid status.");
  }
}

export type CreateReviewTaskInput = {
  title: string;
  instructions: string;
  scope: ReviewTaskScope;
  priority?: ReviewTaskPriority;
  symbols?: string[];
  themes?: string[];
  trigger: unknown;
  created_by?: string;
};

export type UpdateReviewTaskInput = {
  title?: string;
  instructions?: string;
  scope?: ReviewTaskScope;
  priority?: ReviewTaskPriority;
  symbols?: string[];
  themes?: string[];
  trigger?: unknown;
  status?: ReviewTaskStatus;
};

export type CompleteReviewTaskInput = {
  outcome: string;
  outputs?: ReviewTaskOutput[];
};

function requiredText(name: string, value: string, max: number): string {
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    throw validationError(`${name} is required.`);
  }
  if (trimmed.length > max) {
    throw validationError(`${name} must be at most ${max} characters.`, {
      field: name,
    });
  }
  return trimmed;
}

function optionalText(
  name: string,
  value: string | undefined,
  max: number,
): string | undefined {
  if (value == null) return undefined;
  return requiredText(name, value, max);
}

function parseTrigger(value: unknown): ReviewTrigger {
  try {
    return parseReviewTrigger(value);
  } catch (error) {
    if (error instanceof ReviewTriggerParseError) {
      throw validationError(error.message);
    }
    throw error;
  }
}

function assertScopeLinks(
  scope: ReviewTaskScope,
  symbols: string[],
  themes: string[],
): void {
  if (scope === "company" && symbols.length === 0) {
    throw validationError("Company reviews need at least one symbol.");
  }
  if (scope === "theme" && themes.length === 0) {
    throw validationError("Theme reviews need at least one theme slug.");
  }
}

export function assertNotLedgerMutation(body: unknown): void {
  if (!body || typeof body !== "object") return;
  const record = body as Record<string, unknown>;
  const forbidden = [
    "quantity",
    "price",
    "confirmed_quantity",
    "confirmed_price",
    "kind",
    "cash_delta",
    "transaction_id",
    "transactions",
  ];
  const present = forbidden.filter((key) => key in record);
  if (present.length > 0) {
    throw validationError(
      "Review tasks cannot create transactions or book fills.",
      { rejected_fields: present },
    );
  }
}

async function replaceLinks(
  supabase: DbClient,
  taskId: string,
  instrumentIds: string[],
  themeIds: string[],
): Promise<void> {
  const [instrumentsDelete, themesDelete] = await Promise.all([
    supabase.from("review_task_instruments").delete().eq("review_task_id", taskId),
    supabase.from("review_task_themes").delete().eq("review_task_id", taskId),
  ]);
  if (instrumentsDelete.error) {
    throw new Error(
      `Failed to reset review instruments: ${instrumentsDelete.error.message}`,
    );
  }
  if (themesDelete.error) {
    throw new Error(`Failed to reset review themes: ${themesDelete.error.message}`);
  }
  if (instrumentIds.length > 0) {
    const { error } = await supabase.from("review_task_instruments").insert(
      instrumentIds.map((instrument_id) => ({
        review_task_id: taskId,
        instrument_id,
      })),
    );
    if (error) {
      throw new Error(`Failed to link review instruments: ${error.message}`);
    }
  }
  if (themeIds.length > 0) {
    const { error } = await supabase.from("review_task_themes").insert(
      themeIds.map((theme_id) => ({
        review_task_id: taskId,
        theme_id,
      })),
    );
    if (error) {
      throw new Error(`Failed to link review themes: ${error.message}`);
    }
  }
}

async function resolveLinks(
  supabase: DbClient,
  symbols: string[],
  themeSlugs: string[],
  trigger: ReviewTrigger,
) {
  const symbolList = [...symbols];
  if (trigger.type === "condition" && !symbolList.includes(trigger.symbol)) {
    symbolList.push(trigger.symbol);
  }
  const [instruments, themes] = await Promise.all([
    loadInstrumentIdsBySymbol(supabase, symbolList),
    loadThemeIdsBySlug(supabase, themeSlugs),
  ]);
  return { instruments, themes };
}

export async function createReviewTask(
  supabase: DbClient,
  input: CreateReviewTaskInput,
): Promise<ReviewTaskRecord> {
  const title = requiredText("title", input.title, MAX_TITLE);
  const instructions = requiredText(
    "instructions",
    input.instructions,
    MAX_TEXT,
  );
  if (!isReviewTaskScope(input.scope)) {
    throw validationError("Invalid scope.");
  }
  const priority = input.priority ?? "normal";
  if (!isReviewTaskPriority(priority)) {
    throw validationError("Invalid priority.");
  }
  const trigger = parseTrigger(input.trigger);
  const { instruments, themes } = await resolveLinks(
    supabase,
    input.symbols ?? [],
    input.themes ?? [],
    trigger,
  );
  assertScopeLinks(
    input.scope,
    instruments.map((row) => row.symbol),
    themes.map((row) => row.slug),
  );
  const schedule = denormalizedSchedule(trigger);
  const createdBy = requiredText(
    "created_by",
    input.created_by ?? "operator",
    200,
  );

  const { data, error } = await supabase
    .from("review_tasks")
    .insert({
      title,
      instructions,
      scope: input.scope,
      priority,
      status: "pending",
      trigger: triggerToJson(trigger),
      created_by: createdBy,
      scheduled_for: schedule.scheduled_for,
      not_before: schedule.not_before,
      due_by: schedule.due_by,
    })
    .select(
      "id, title, instructions, scope, priority, status, trigger, scheduled_for, not_before, due_by, became_due_at, created_at, created_by, completed_at, outcome",
    )
    .single();
  if (error || !data) {
    throw new Error(error?.message ?? "Failed to create review task.");
  }

  try {
    await replaceLinks(
      supabase,
      data.id,
      instruments.map((row) => row.id),
      themes.map((row) => row.id),
    );
  } catch (linkError) {
    await supabase.from("review_tasks").delete().eq("id", data.id);
    throw linkError;
  }

  return hydrateReviewTask(supabase, data);
}

export async function updateReviewTask(
  supabase: DbClient,
  id: string,
  input: UpdateReviewTaskInput,
): Promise<ReviewTaskRecord> {
  if (!UUID_RE.test(id)) {
    throw notFound("UNKNOWN_REVIEW_TASK", `Unknown review task: ${id}.`, { id });
  }
  const current = await loadReviewTaskRow(supabase, id);
  if (current.status === "completed" || current.status === "cancelled") {
    throw validationError(
      `Cannot update a ${current.status} review task.`,
      { status: current.status },
    );
  }
  if (input.status != null) {
    if (!isReviewTaskStatus(input.status)) {
      throw validationError("Invalid status.");
    }
    assertPatchableReviewTaskStatus(input.status);
  }
  if (input.scope != null && !isReviewTaskScope(input.scope)) {
    throw validationError("Invalid scope.");
  }
  if (input.priority != null && !isReviewTaskPriority(input.priority)) {
    throw validationError("Invalid priority.");
  }

  const trigger =
    input.trigger !== undefined
      ? parseTrigger(input.trigger)
      : parseReviewTrigger(current.trigger);
  const scope = input.scope ?? current.scope;
  const currentRecord = await hydrateReviewTask(supabase, current);
  const nextSymbols = input.symbols ?? currentRecord.symbols;
  const nextThemes = input.themes ?? currentRecord.themes.map((row) => row.slug);
  const { instruments, themes } = await resolveLinks(
    supabase,
    nextSymbols,
    nextThemes,
    trigger,
  );
  assertScopeLinks(
    scope,
    instruments.map((row) => row.symbol),
    themes.map((row) => row.slug),
  );

  const schedule = denormalizedSchedule(trigger);
  const patch: Record<string, unknown> = {
    trigger: triggerToJson(trigger),
    scheduled_for: schedule.scheduled_for,
    not_before: schedule.not_before,
    due_by: schedule.due_by,
  };
  const title = optionalText("title", input.title, MAX_TITLE);
  if (title != null) patch.title = title;
  const instructions = optionalText(
    "instructions",
    input.instructions,
    MAX_TEXT,
  );
  if (instructions != null) patch.instructions = instructions;
  if (input.scope != null) patch.scope = input.scope;
  if (input.priority != null) patch.priority = input.priority;
  if (input.status != null) patch.status = input.status;

  const { data, error } = await supabase
    .from("review_tasks")
    .update(patch as {
      title?: string;
      instructions?: string;
      scope?: ReviewTaskScope;
      priority?: ReviewTaskPriority;
      status?: ReviewTaskStatus;
      trigger?: Json;
      scheduled_for?: string | null;
      not_before?: string | null;
      due_by?: string | null;
    })
    .eq("id", id)
    .select(
      "id, title, instructions, scope, priority, status, trigger, scheduled_for, not_before, due_by, became_due_at, created_at, created_by, completed_at, outcome",
    )
    .single();
  if (error || !data) {
    throw new Error(error?.message ?? "Failed to update review task.");
  }

  await replaceLinks(
    supabase,
    id,
    instruments.map((row) => row.id),
    themes.map((row) => row.id),
  );
  return hydrateReviewTask(supabase, data);
}

async function assertOutputExists(
  supabase: DbClient,
  kind: ReviewOutputKind,
  entityId: string,
): Promise<void> {
  switch (kind) {
    case "dossier_version": {
      const { data, error } = await supabase
        .from("dossier_versions")
        .select("id")
        .eq("id", entityId)
        .maybeSingle();
      if (error) throw new Error(error.message);
      if (!data) {
        throw validationError("Unknown dossier_version output.", {
          entity_id: entityId,
        });
      }
      return;
    }
    case "decision": {
      const { data, error } = await supabase
        .from("decisions")
        .select("id")
        .eq("id", entityId)
        .maybeSingle();
      if (error) throw new Error(error.message);
      if (!data) {
        throw validationError("Unknown decision output.", {
          entity_id: entityId,
        });
      }
      return;
    }
    case "planned_action": {
      const { data, error } = await supabase
        .from("planned_actions")
        .select("id")
        .eq("id", entityId)
        .maybeSingle();
      if (error) throw new Error(error.message);
      if (!data) {
        throw validationError("Unknown planned_action output.", {
          entity_id: entityId,
        });
      }
      return;
    }
    default: {
      const _exhaustive: never = kind;
      throw _exhaustive;
    }
  }
}

export async function completeReviewTask(
  supabase: DbClient,
  id: string,
  input: CompleteReviewTaskInput,
): Promise<ReviewTaskRecord> {
  if (!UUID_RE.test(id)) {
    throw notFound("UNKNOWN_REVIEW_TASK", `Unknown review task: ${id}.`, { id });
  }
  const current = await loadReviewTaskRow(supabase, id);
  if (current.status === "completed") {
    throw validationError("Review task is already completed.");
  }
  if (current.status === "cancelled") {
    throw validationError("Cannot complete a cancelled review task.");
  }
  const outcome = requiredText("outcome", input.outcome, MAX_TEXT);
  const outputs = input.outputs ?? [];
  for (const output of outputs) {
    if (!isReviewOutputKind(output.kind)) {
      throw validationError("Invalid output kind.", {
        allowed: REVIEW_OUTPUT_KINDS,
      });
    }
    if (!UUID_RE.test(output.entity_id)) {
      throw validationError("output.entity_id must be a UUID.");
    }
    await assertOutputExists(supabase, output.kind, output.entity_id);
  }

  if (outputs.length > 0) {
    const { error } = await supabase.from("review_task_outputs").upsert(
      outputs.map((output) => ({
        review_task_id: id,
        kind: output.kind,
        entity_id: output.entity_id,
      })),
      { onConflict: "review_task_id,kind,entity_id" },
    );
    if (error) {
      throw new Error(`Failed to record review outputs: ${error.message}`);
    }
  }

  const completedAt = new Date().toISOString();
  const { data, error } = await supabase
    .from("review_tasks")
    .update({
      status: "completed",
      completed_at: completedAt,
      outcome,
    })
    .eq("id", id)
    .neq("status", "completed")
    .neq("status", "cancelled")
    .select(
      "id, title, instructions, scope, priority, status, trigger, scheduled_for, not_before, due_by, became_due_at, created_at, created_by, completed_at, outcome",
    )
    .maybeSingle();
  if (error) {
    throw new Error(`Failed to complete review task: ${error.message}`);
  }
  if (!data) {
    throw validationError("Review task could not be completed.");
  }
  return hydrateReviewTask(supabase, data);
}
