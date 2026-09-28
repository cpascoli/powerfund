import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

/** 256 bits of randomness, prefixed so a leaked value says what it is. */
export function randomToken(prefix: string): string {
  return `${prefix}${randomBytes(32).toString("base64url")}`;
}

/** What we store in place of a code or token. */
export function hashSecret(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

const VERIFIER = /^[A-Za-z0-9\-._~]{43,128}$/;

/** RFC 7636 S256: BASE64URL(SHA256(verifier)) == challenge. */
export function verifyPkceS256(verifier: string, challenge: string): boolean {
  if (!VERIFIER.test(verifier)) return false;
  const computed = createHash("sha256").update(verifier).digest("base64url");
  const left = Buffer.from(computed);
  const right = Buffer.from(challenge);
  return left.length === right.length && timingSafeEqual(left, right);
}

export function isPkceChallenge(value: string): boolean {
  // base64url of a SHA-256 digest is exactly 43 characters.
  return /^[A-Za-z0-9\-_]{43}$/.test(value);
}
