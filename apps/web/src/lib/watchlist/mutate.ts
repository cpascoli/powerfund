import { ASSET_CLASSES, type AssetClass } from "@powerfund/domain";

import { conflict, notFound, validationError } from "@/lib/api/agent/errors";
import { loadThemeIdsBySlug } from "@/lib/reviews/records";
import type { DbClient } from "@/lib/supabase/db";

const MAX_SYMBOL = 16;
const MAX_NAME = 200;
const MAX_NOTES = 10_000;
const MAX_EXCHANGE = 16;
const SYMBOL_RE = /^[A-Z0-9][A-Z0-9.\-]{0,15}$/;
const DEFAULT_EXCHANGE = "US";

export type AddWatchlistCompanyInput = {
  symbol: string;
  name: string;
  theme: string;
  notes?: string | null;
  asset_class?: string | null;
  exchange?: string | null;
  actor_name?: string | null;
};

export type WatchlistCompanyRecord = {
  symbol: string;
  name: string;
  status: "watchlist";
  asset_class: AssetClass;
  exchange: string;
  notes: string | null;
  theme: { slug: string; name: string };
  has_dossier: false;
};

function emptyToNull(value: string | null | undefined): string | null {
  if (value == null) return null;
  const trimmed = value.trim();
  return trimmed.length === 0 ? null : trimmed;
}

function withActor(
  text: string | null,
  actorName: string | null | undefined,
): string | null {
  const actor = emptyToNull(actorName);
  if (!actor) return text;
  const line = `[agent:${actor}]`;
  return text ? `${line}\n${text}` : line;
}

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

function normalizeSymbol(value: string): string {
  const symbol = requiredText("symbol", value, MAX_SYMBOL).toUpperCase();
  if (!SYMBOL_RE.test(symbol)) {
    throw validationError(
      "symbol must be a ticker such as MRCY or BRK.B.",
      { field: "symbol" },
    );
  }
  return symbol;
}

function parseAssetClass(value: string | null | undefined): AssetClass {
  if (value == null || value.trim().length === 0) return "equity";
  const trimmed = value.trim();
  if (!(ASSET_CLASSES as readonly string[]).includes(trimmed)) {
    throw validationError("Invalid asset_class.", { allowed: ASSET_CLASSES });
  }
  return trimmed as AssetClass;
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
    "is_benchmark",
    "status",
  ];
  const present = forbidden.filter((key) => key in record);
  if (present.length > 0) {
    throw validationError(
      "Adding a watchlist company cannot book fills, set status, or mark a benchmark.",
      { rejected_fields: present },
    );
  }
}

export async function addWatchlistCompany(
  supabase: DbClient,
  input: AddWatchlistCompanyInput,
): Promise<WatchlistCompanyRecord> {
  const symbol = normalizeSymbol(input.symbol);
  const name = requiredText("name", input.name, MAX_NAME);
  const themeInput = requiredText("theme", input.theme, 80);
  const assetClass = parseAssetClass(input.asset_class);
  const exchange =
    emptyToNull(input.exchange)?.toUpperCase() ?? DEFAULT_EXCHANGE;
  if (exchange.length > MAX_EXCHANGE) {
    throw validationError("exchange must be at most 16 characters.", {
      field: "exchange",
    });
  }
  const notes = withActor(
    emptyToNull(input.notes)
      ? requiredText("notes", input.notes ?? "", MAX_NOTES)
      : null,
    input.actor_name,
  );

  const { data: existing, error: existingError } = await supabase
    .from("instruments")
    .select("id, symbol, status, is_benchmark")
    .eq("symbol", symbol)
    .maybeSingle();
  if (existingError) {
    throw new Error(`Failed to look up instrument: ${existingError.message}`);
  }
  if (existing) {
    throw conflict(
      "SYMBOL_EXISTS",
      existing.is_benchmark
        ? `${symbol} is a benchmark, not a research name.`
        : `${symbol} is already in the universe (${existing.status}).`,
      {
        symbol,
        status: existing.status,
        is_benchmark: existing.is_benchmark,
      },
    );
  }

  const [theme] = await loadThemeIdsBySlug(supabase, [themeInput]);
  if (!theme) {
    throw notFound("UNKNOWN_THEME", `Unknown theme: ${themeInput}.`, {
      theme: themeInput,
    });
  }

  const { data: inserted, error: insertError } = await supabase
    .from("instruments")
    .insert({
      symbol,
      name,
      asset_class: assetClass,
      exchange,
      currency: "USD",
      status: "watchlist",
      is_benchmark: false,
      notes,
    })
    .select("id, symbol, name, asset_class, exchange, status, notes")
    .single();
  if (insertError || !inserted) {
    if (insertError?.code === "23505") {
      throw conflict(
        "SYMBOL_EXISTS",
        `${symbol} is already in the universe.`,
        { symbol },
      );
    }
    throw new Error(
      `Failed to add watchlist company: ${insertError?.message ?? "unknown error"}`,
    );
  }

  const { error: themeError } = await supabase.from("instrument_themes").insert({
    instrument_id: inserted.id,
    theme_id: theme.id,
    is_primary: true,
  });
  if (themeError) {
    await supabase.from("instruments").delete().eq("id", inserted.id);
    throw new Error(`Failed to assign theme: ${themeError.message}`);
  }

  return {
    symbol: inserted.symbol,
    name: inserted.name,
    status: "watchlist",
    asset_class: inserted.asset_class as AssetClass,
    exchange: inserted.exchange ?? exchange,
    notes: inserted.notes,
    theme: { slug: theme.slug, name: theme.name },
    has_dossier: false,
  };
}

export type ArchiveWatchlistCompanyResult = {
  symbol: string;
  status: "archived" | "watchlist";
  changed: boolean;
};

/**
 * Archive a name, or bring an archived one back.
 *
 * The only status an operator or agent sets by hand. `active` and `watchlist`
 * follow the book automatically — a trigger on `positions` moves a name to
 * `active` when a position opens and back to `watchlist` when the last unit
 * goes — so setting either here would be overwriting a derived value with a
 * guess.
 *
 * Archiving is a judgement about whether a name is worth watching at all, and
 * it is what finally makes ritual 5 (watchlist hygiene) actionable: before
 * this, 'archived' could only be read as an exclusion and never written.
 *
 * Refused while a position is open. Archiving a name we hold is almost
 * certainly a mis-typed symbol, and the alternative — letting it through — hides
 * a held position from every view that filters archived names out. The exit
 * comes first.
 */
export async function setWatchlistArchived(
  supabase: DbClient,
  input: { symbol: string; archived: boolean },
): Promise<ArchiveWatchlistCompanyResult> {
  const symbol = normalizeSymbol(input.symbol);

  const { data, error } = await supabase
    .from("instruments")
    .select("id, symbol, status, is_benchmark")
    .eq("symbol", symbol)
    .maybeSingle();
  if (error) {
    throw new Error(`Failed to look up instrument: ${error.message}`);
  }
  const instrument = data as {
    id: string;
    symbol: string;
    status: string;
    is_benchmark: boolean;
  } | null;
  if (!instrument) {
    throw notFound("UNKNOWN_SYMBOL", `Unknown symbol: ${symbol}.`, { symbol });
  }
  if (instrument.is_benchmark) {
    throw validationError(
      `${symbol} is a benchmark. SPY's bars are the trading calendar, so archiving it would break the session clock.`,
      { symbol },
    );
  }

  const next = input.archived ? "archived" : "watchlist";
  if (instrument.status === next) {
    return { symbol, status: next, changed: false };
  }

  if (input.archived) {
    const { data: open } = await supabase
      .from("positions")
      .select("id")
      .eq("instrument_id", instrument.id)
      .eq("status", "open")
      .limit(1)
      .maybeSingle();
    if (open) {
      throw conflict(
        "POSITION_OPEN",
        `${symbol} is held. Exit the position before archiving it, or it disappears from every view that hides archived names while the book still carries it.`,
        { symbol },
      );
    }
  }

  const { error: updateError } = await supabase
    .from("instruments")
    .update({ status: next })
    .eq("id", instrument.id);
  if (updateError) {
    throw new Error(`Failed to update instrument: ${updateError.message}`);
  }

  return { symbol, status: next, changed: true };
}
