import type { Json } from "@powerfund/db";
import {
  parseReviewTrigger,
  type ReviewOutputKind,
  type ReviewTaskPriority,
  type ReviewTaskScope,
  type ReviewTaskStatus,
  type ReviewTrigger,
  isTriggerEvaluable,
} from "@powerfund/domain";

import { notFound } from "@/lib/api/agent/errors";
import type { DbClient } from "@/lib/supabase/db";

export type ReviewTaskOutput = {
  kind: ReviewOutputKind;
  entity_id: string;
};

export type ReviewTaskRecord = {
  id: string;
  title: string;
  instructions: string;
  scope: ReviewTaskScope;
  priority: ReviewTaskPriority;
  status: ReviewTaskStatus;
  trigger: ReviewTrigger;
  evaluable: boolean;
  symbols: string[];
  themes: Array<{ slug: string; name: string }>;
  scheduled_for: string | null;
  not_before: string | null;
  due_by: string | null;
  became_due_at: string | null;
  created_at: string;
  created_by: string;
  completed_at: string | null;
  outcome: string | null;
  outputs: ReviewTaskOutput[];
};

export type ReviewTaskRow = {
  id: string;
  title: string;
  instructions: string;
  scope: ReviewTaskScope;
  priority: ReviewTaskPriority;
  status: ReviewTaskStatus;
  trigger: Json;
  scheduled_for: string | null;
  not_before: string | null;
  due_by: string | null;
  became_due_at: string | null;
  created_at: string;
  created_by: string;
  completed_at: string | null;
  outcome: string | null;
};

const TASK_COLUMNS =
  "id, title, instructions, scope, priority, status, trigger, scheduled_for, not_before, due_by, became_due_at, created_at, created_by, completed_at, outcome";

export function triggerToJson(trigger: ReviewTrigger): Json {
  return trigger as unknown as Json;
}

export async function loadInstrumentIdsBySymbol(
  supabase: DbClient,
  symbols: string[],
): Promise<Array<{ id: string; symbol: string }>> {
  const unique = [
    ...new Set(symbols.map((row) => row.trim().toUpperCase()).filter(Boolean)),
  ];
  if (unique.length === 0) return [];
  const { data, error } = await supabase
    .from("instruments")
    .select("id, symbol")
    .in("symbol", unique);
  if (error) {
    throw new Error(`Failed to load instruments: ${error.message}`);
  }
  const found = new Map((data ?? []).map((row) => [row.symbol, row]));
  for (const symbol of unique) {
    if (!found.has(symbol)) {
      throw notFound("UNKNOWN_SYMBOL", `Unknown symbol: ${symbol}.`, { symbol });
    }
  }
  return unique.map((symbol) => found.get(symbol)!);
}

export function normalizeThemeKey(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function matchTheme<T extends { slug: string; name: string }>(
  input: string,
  themes: readonly T[],
): T | null {
  const trimmed = input.trim();
  if (!trimmed) return null;
  const lower = trimmed.toLowerCase();
  const slugified = normalizeThemeKey(trimmed);
  return (
    themes.find((theme) => {
      const slug = theme.slug.toLowerCase();
      const name = theme.name.toLowerCase();
      return (
        slug === lower ||
        name === lower ||
        slug === slugified ||
        normalizeThemeKey(theme.name) === slugified
      );
    }) ?? null
  );
}

export async function loadThemeIdsBySlug(
  supabase: DbClient,
  slugs: string[],
): Promise<Array<{ id: string; slug: string; name: string }>> {
  const unique = [...new Set(slugs.map((row) => row.trim()).filter(Boolean))];
  if (unique.length === 0) return [];
  const { data, error } = await supabase
    .from("themes")
    .select("id, slug, name");
  if (error) {
    throw new Error(`Failed to load themes: ${error.message}`);
  }
  const catalog = data ?? [];
  return unique.map((value) => {
    const theme = matchTheme(value, catalog);
    if (!theme) {
      throw notFound("UNKNOWN_THEME", `Unknown theme: ${value}.`, {
        theme: value,
      });
    }
    return theme;
  });
}

async function loadLinks(supabase: DbClient, taskIds: string[]) {
  if (taskIds.length === 0) {
    return {
      symbolsByTask: new Map<string, string[]>(),
      themesByTask: new Map<string, Array<{ slug: string; name: string }>>(),
      outputsByTask: new Map<string, ReviewTaskOutput[]>(),
    };
  }

  const [instrumentLinks, themeLinks, outputs] = await Promise.all([
    supabase
      .from("review_task_instruments")
      .select("review_task_id, instrument_id")
      .in("review_task_id", taskIds),
    supabase
      .from("review_task_themes")
      .select("review_task_id, theme_id")
      .in("review_task_id", taskIds),
    supabase
      .from("review_task_outputs")
      .select("review_task_id, kind, entity_id")
      .in("review_task_id", taskIds),
  ]);
  if (instrumentLinks.error) {
    throw new Error(
      `Failed to load review instruments: ${instrumentLinks.error.message}`,
    );
  }
  if (themeLinks.error) {
    throw new Error(`Failed to load review themes: ${themeLinks.error.message}`);
  }
  if (outputs.error) {
    throw new Error(`Failed to load review outputs: ${outputs.error.message}`);
  }

  const instrumentIds = [
    ...new Set((instrumentLinks.data ?? []).map((row) => row.instrument_id)),
  ];
  const themeIds = [...new Set((themeLinks.data ?? []).map((row) => row.theme_id))];

  const [instruments, themes] = await Promise.all([
    instrumentIds.length
      ? supabase.from("instruments").select("id, symbol").in("id", instrumentIds)
      : Promise.resolve({ data: [] as Array<{ id: string; symbol: string }>, error: null }),
    themeIds.length
      ? supabase.from("themes").select("id, slug, name").in("id", themeIds)
      : Promise.resolve({
          data: [] as Array<{ id: string; slug: string; name: string }>,
          error: null,
        }),
  ]);
  if (instruments.error) {
    throw new Error(`Failed to load instruments: ${instruments.error.message}`);
  }
  if (themes.error) {
    throw new Error(`Failed to load themes: ${themes.error.message}`);
  }

  const symbolById = new Map((instruments.data ?? []).map((row) => [row.id, row.symbol]));
  const themeById = new Map(
    (themes.data ?? []).map((row) => [row.id, { slug: row.slug, name: row.name }]),
  );

  const symbolsByTask = new Map<string, string[]>();
  for (const row of instrumentLinks.data ?? []) {
    const symbol = symbolById.get(row.instrument_id);
    if (!symbol) continue;
    const list = symbolsByTask.get(row.review_task_id) ?? [];
    list.push(symbol);
    symbolsByTask.set(row.review_task_id, list);
  }
  for (const list of symbolsByTask.values()) list.sort((a, b) => a.localeCompare(b));

  const themesByTask = new Map<string, Array<{ slug: string; name: string }>>();
  for (const row of themeLinks.data ?? []) {
    const theme = themeById.get(row.theme_id);
    if (!theme) continue;
    const list = themesByTask.get(row.review_task_id) ?? [];
    list.push(theme);
    themesByTask.set(row.review_task_id, list);
  }
  for (const list of themesByTask.values()) {
    list.sort((a, b) => a.slug.localeCompare(b.slug));
  }

  const outputsByTask = new Map<string, ReviewTaskOutput[]>();
  for (const row of outputs.data ?? []) {
    const list = outputsByTask.get(row.review_task_id) ?? [];
    list.push({
      kind: row.kind as ReviewOutputKind,
      entity_id: row.entity_id,
    });
    outputsByTask.set(row.review_task_id, list);
  }

  return { symbolsByTask, themesByTask, outputsByTask };
}

export function mapReviewTask(
  row: ReviewTaskRow,
  links: {
    symbols: string[];
    themes: Array<{ slug: string; name: string }>;
    outputs: ReviewTaskOutput[];
  },
): ReviewTaskRecord {
  const trigger = parseReviewTrigger(row.trigger);
  return {
    id: row.id,
    title: row.title,
    instructions: row.instructions,
    scope: row.scope,
    priority: row.priority,
    status: row.status,
    trigger,
    evaluable: isTriggerEvaluable(trigger),
    symbols: links.symbols,
    themes: links.themes,
    scheduled_for: row.scheduled_for,
    not_before: row.not_before,
    due_by: row.due_by,
    became_due_at: row.became_due_at,
    created_at: row.created_at,
    created_by: row.created_by,
    completed_at: row.completed_at,
    outcome: row.outcome,
    outputs: links.outputs,
  };
}

export async function hydrateReviewTasks(
  supabase: DbClient,
  rows: ReviewTaskRow[],
): Promise<ReviewTaskRecord[]> {
  const links = await loadLinks(
    supabase,
    rows.map((row) => row.id),
  );
  return rows.map((row) =>
    mapReviewTask(row, {
      symbols: links.symbolsByTask.get(row.id) ?? [],
      themes: links.themesByTask.get(row.id) ?? [],
      outputs: links.outputsByTask.get(row.id) ?? [],
    }),
  );
}

export async function hydrateReviewTask(
  supabase: DbClient,
  row: ReviewTaskRow,
): Promise<ReviewTaskRecord> {
  const [record] = await hydrateReviewTasks(supabase, [row]);
  if (!record) {
    throw new Error("Failed to hydrate review task.");
  }
  return record;
}

export async function loadReviewTaskRow(
  supabase: DbClient,
  id: string,
): Promise<ReviewTaskRow> {
  const { data, error } = await supabase
    .from("review_tasks")
    .select(TASK_COLUMNS)
    .eq("id", id)
    .maybeSingle();
  if (error) {
    throw new Error(`Failed to load review task: ${error.message}`);
  }
  if (!data) {
    throw notFound("UNKNOWN_REVIEW_TASK", `Unknown review task: ${id}.`, { id });
  }
  return data as ReviewTaskRow;
}

export async function loadReviewTask(
  supabase: DbClient,
  id: string,
): Promise<ReviewTaskRecord> {
  const row = await loadReviewTaskRow(supabase, id);
  return hydrateReviewTask(supabase, row);
}

export type ListReviewTaskOptions = {
  scope?: ReviewTaskScope | null;
  /** Restrict to these task ids — used after resolving symbol/theme links. */
  ids?: readonly string[];
  completedSince?: string | null;
  completedBefore?: string | null;
  limit?: number;
  /**
   * Order history newest-first. Completed work is read backwards from now
   * ("the last five reviews touching CRDO"); the open queue is read forwards,
   * in the order it has to be worked.
   */
  order?: "asc" | "desc";
  orderBy?: "completed_at" | "queue";
};

export async function listReviewTaskRows(
  supabase: DbClient,
  statuses?: readonly ReviewTaskStatus[],
  options: ListReviewTaskOptions = {},
): Promise<ReviewTaskRow[]> {
  let query = supabase.from("review_tasks").select(TASK_COLUMNS);

  if (statuses && statuses.length > 0) {
    query = query.in("status", [...statuses]);
  }
  if (options.scope) {
    query = query.eq("scope", options.scope);
  }
  if (options.ids) {
    if (options.ids.length === 0) return [];
    query = query.in("id", [...options.ids]);
  }
  if (options.completedSince) {
    query = query.gte("completed_at", options.completedSince);
  }
  if (options.completedBefore) {
    query = query.lt("completed_at", options.completedBefore);
  }

  const ascending = (options.order ?? "asc") === "asc";
  if (options.orderBy === "completed_at") {
    query = query
      .order("completed_at", { ascending, nullsFirst: false })
      .order("created_at", { ascending });
  } else {
    query = query
      .order("became_due_at", { ascending, nullsFirst: false })
      .order("scheduled_for", { ascending, nullsFirst: false })
      .order("created_at", { ascending });
  }
  if (options.limit != null) {
    query = query.limit(options.limit);
  }

  const { data, error } = await query;
  if (error) {
    throw new Error(`Failed to list review tasks: ${error.message}`);
  }
  return (data ?? []) as ReviewTaskRow[];
}

/**
 * Task ids linked to any of these symbols or themes.
 *
 * A macro review that named CRDO among eight tickers is exactly the kind of
 * prior belief a company review should inherit, so link membership — not scope —
 * decides relevance. `null` means no filter was asked for.
 */
export async function reviewTaskIdsFor(
  supabase: DbClient,
  args: { symbols: readonly string[]; themes: readonly string[] },
): Promise<string[] | null> {
  if (args.symbols.length === 0 && args.themes.length === 0) return null;
  const ids = new Set<string>();

  if (args.symbols.length > 0) {
    const instruments = await loadInstrumentIdsBySymbol(supabase, [
      ...args.symbols,
    ]);
    const { data, error } = await supabase
      .from("review_task_instruments")
      .select("review_task_id")
      .in(
        "instrument_id",
        instruments.map((row) => row.id),
      );
    if (error) {
      throw new Error(`Failed to load review instruments: ${error.message}`);
    }
    for (const row of data ?? []) ids.add(row.review_task_id);
  }

  if (args.themes.length > 0) {
    const themes = await loadThemeIdsBySlug(supabase, [...args.themes]);
    const { data, error } = await supabase
      .from("review_task_themes")
      .select("review_task_id")
      .in(
        "theme_id",
        themes.map((row) => row.id),
      );
    if (error) {
      throw new Error(`Failed to load review themes: ${error.message}`);
    }
    for (const row of data ?? []) ids.add(row.review_task_id);
  }

  return [...ids];
}
