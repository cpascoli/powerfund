import { describe, expect, it } from "vitest";

import { copyEnterInvalidationToPosition } from "./copy-invalidation";
import type { DbClient } from "@/lib/supabase/db";

describe("copyEnterInvalidationToPosition", () => {
  it("skips empty invalidation so an add cannot wipe kill criteria", async () => {
    let updated = false;
    const supabase = {
      from() {
        return {
          update() {
            updated = true;
            return {
              eq() {
                return {
                  eq: async () => ({ error: null }),
                };
              },
            };
          },
        };
      },
    } as unknown as DbClient;

    await copyEnterInvalidationToPosition(supabase, {
      positionId: "pos-1",
      invalidation: "   ",
    });
    expect(updated).toBe(false);
  });

  it("writes trimmed kill criteria onto the open position", async () => {
    let payload: Record<string, unknown> | null = null;
    const supabase = {
      from() {
        return {
          update(values: Record<string, unknown>) {
            payload = values;
            return {
              eq() {
                return {
                  eq: async () => ({ error: null }),
                };
              },
            };
          },
        };
      },
    } as unknown as DbClient;

    await copyEnterInvalidationToPosition(supabase, {
      positionId: "pos-1",
      invalidation: "  Exit if procedures stall  ",
    });
    expect(payload).toEqual({ invalidation: "Exit if procedures stall" });
  });
});
