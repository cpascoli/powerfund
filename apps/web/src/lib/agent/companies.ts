import { notFound } from "@/lib/api/agent/errors";
import { freshnessPayload } from "@/lib/data/price-freshness";
import { getInstrumentDossier } from "@/lib/data/research";
import type { DossierSnapshot } from "@/lib/dossiers/versions";
import type { DbClient } from "@/lib/supabase/db";

export async function getAgentCompany(supabase: DbClient, symbol: string) {
  const loaded = await getInstrumentDossier(symbol, supabase);
  if (!loaded) {
    throw notFound(
      "UNKNOWN_SYMBOL",
      `Unknown symbol: ${symbol.trim().toUpperCase()}.`,
      { symbol: symbol.trim().toUpperCase() },
    );
  }

  let version: { id: string; number: number; change_reason: string; created_at: string } | null =
    null;
  if (loaded.dossier) {
    const { data, error } = await supabase
      .from("dossier_versions")
      .select("id, version_number, change_reason, created_at")
      .eq("dossier_id", loaded.dossier.id)
      .order("version_number", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) {
      throw new Error(`Failed to load dossier version: ${error.message}`);
    }
    if (data) {
      version = {
        id: data.id,
        number: data.version_number,
        change_reason: data.change_reason,
        created_at: data.created_at,
      };
    }
  }

  const { data: bar, error: barError } = await supabase
    .from("market_bars")
    .select("bar_date, close, adj_close")
    .eq("instrument_id", loaded.instrument.id)
    .order("bar_date", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (barError) {
    throw new Error(`Failed to load last close: ${barError.message}`);
  }
  const lastBar = bar as {
    bar_date: string;
    close: number | null;
    adj_close: number | null;
  } | null;
  const lastClose = lastBar?.adj_close ?? lastBar?.close ?? null;
  const lastCloseSession = lastBar?.bar_date ?? null;

  return {
    as_of: new Date().toISOString(),
    ...freshnessPayload(lastCloseSession),
    symbol: loaded.instrument.symbol,
    name: loaded.instrument.name,
    asset_class: loaded.instrument.asset_class,
    status: loaded.instrument.status,
    notes: loaded.instrument.notes,
    last_close: lastClose == null ? null : Number(lastClose),
    last_close_session: lastCloseSession,
    theme: {
      slug: loaded.instrument.theme_slug,
      name: loaded.instrument.theme_name,
    },
    dossier: loaded.dossier,
    current_version: version,
  };
}

export async function listDossierVersions(supabase: DbClient, symbol: string) {
  const loaded = await getInstrumentDossier(symbol, supabase);
  if (!loaded) {
    throw notFound(
      "UNKNOWN_SYMBOL",
      `Unknown symbol: ${symbol.trim().toUpperCase()}.`,
      { symbol: symbol.trim().toUpperCase() },
    );
  }
  if (!loaded.dossier) {
    return {
      as_of: new Date().toISOString(),
      symbol: loaded.instrument.symbol,
      versions: [] as Array<{
        id: string;
        number: number;
        change_reason: string;
        created_at: string;
      }>,
    };
  }

  const { data, error } = await supabase
    .from("dossier_versions")
    .select("id, version_number, change_reason, created_at")
    .eq("dossier_id", loaded.dossier.id)
    .order("version_number", { ascending: false });
  if (error) {
    throw new Error(`Failed to load versions: ${error.message}`);
  }

  return {
    as_of: new Date().toISOString(),
    symbol: loaded.instrument.symbol,
    current_version_number: data?.[0]?.version_number ?? 0,
    versions: (data ?? []).map((row) => ({
      id: row.id,
      number: row.version_number,
      change_reason: row.change_reason,
      created_at: row.created_at,
    })),
  };
}

export async function getDossierVersion(
  supabase: DbClient,
  symbol: string,
  version: string,
) {
  const loaded = await getInstrumentDossier(symbol, supabase);
  if (!loaded?.dossier) {
    throw notFound(
      "UNKNOWN_SYMBOL",
      `Unknown symbol or dossier: ${symbol.trim().toUpperCase()}.`,
      { symbol: symbol.trim().toUpperCase() },
    );
  }

  const isUuid =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      version,
    );
  const query = supabase
    .from("dossier_versions")
    .select("id, version_number, snapshot, change_reason, created_at")
    .eq("dossier_id", loaded.dossier.id);

  const { data, error } = isUuid
    ? await query.eq("id", version).maybeSingle()
    : await query.eq("version_number", Number(version)).maybeSingle();

  if (error) {
    throw new Error(`Failed to load version: ${error.message}`);
  }
  if (!data) {
    throw notFound("UNKNOWN_VERSION", `Unknown dossier version: ${version}.`, {
      symbol: loaded.instrument.symbol,
      version,
    });
  }

  return {
    as_of: new Date().toISOString(),
    symbol: loaded.instrument.symbol,
    version: {
      id: data.id,
      number: data.version_number,
      change_reason: data.change_reason,
      created_at: data.created_at,
      snapshot: data.snapshot as DossierSnapshot,
    },
  };
}
