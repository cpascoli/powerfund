import type { DbClient } from "@/lib/supabase/db";

export async function copyEnterInvalidationToPosition(
  supabase: DbClient,
  args: {
    positionId: string | null | undefined;
    invalidation: string | null | undefined;
  },
): Promise<void> {
  const positionId = args.positionId?.trim() ?? "";
  const invalidation = args.invalidation?.trim() ?? "";
  if (positionId.length === 0 || invalidation.length === 0) {
    return;
  }

  const { error } = await supabase
    .from("positions")
    .update({ invalidation })
    .eq("id", positionId)
    .eq("status", "open");

  if (error) {
    throw new Error(
      `Failed to copy invalidation onto the position: ${error.message}`,
    );
  }
}

export async function findOpenPositionId(
  supabase: DbClient,
  instrumentId: string,
): Promise<string | null> {
  const { data, error } = await supabase
    .from("positions")
    .select("id")
    .eq("instrument_id", instrumentId)
    .eq("status", "open")
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to load open position: ${error.message}`);
  }

  return data?.id ?? null;
}
