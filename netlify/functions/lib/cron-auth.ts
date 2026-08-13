import { timingSafeEqual } from "node:crypto";

import type { HandlerEvent } from "@netlify/functions";

function bearerToken(event: HandlerEvent): string {
  const header = event.headers.authorization ?? event.headers.Authorization ?? "";
  return header.replace(/^Bearer\s+/i, "").trim();
}

export function authorizeCron(event: HandlerEvent): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const token = bearerToken(event);
  const expected = Buffer.from(secret);
  const actual = Buffer.from(token);
  if (expected.length === 0 || expected.length !== actual.length) {
    return false;
  }
  return timingSafeEqual(expected, actual);
}
