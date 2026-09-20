"use client";

import { useState } from "react";

/**
 * One idempotency key per form mount.
 *
 * Generated in `useState`'s initialiser so it is created once and survives every
 * re-render — including the ones a failed submit causes. That is the whole
 * point: a double-click, a refresh, or a retry after an error that arrived
 * *after* the ledger write all carry the same key, and the server recognises the
 * fill it already booked instead of writing a second one.
 *
 * A genuinely new fill means a new form, and a new form means a new key.
 *
 * `crypto.randomUUID` needs a secure context. Anywhere it is missing the field
 * goes out empty and the server books exactly as it did before, unprotected —
 * a fill must never be blocked by the absence of a convenience.
 */
export function useSubmitKey(): string {
  const [key] = useState(() => {
    try {
      return globalThis.crypto?.randomUUID?.() ?? "";
    } catch {
      return "";
    }
  });
  return key;
}
