import { constantTimeEqual, hmacSha256 } from "./crypto";

const DEFAULT_CSRF_TTL_MS = 60 * 60 * 1_000;

export function createCsrfToken(
  sessionId: string,
  secret: string,
  options: { now?: Date; ttlMs?: number } = {},
): string {
  const now = options.now ?? new Date();
  const ttlMs = options.ttlMs ?? DEFAULT_CSRF_TTL_MS;
  if (!Number.isFinite(ttlMs) || ttlMs <= 0) {
    throw new Error("CSRF TTL must be positive.");
  }
  const expires = Math.floor((now.getTime() + ttlMs) / 1_000);
  const unsigned = `v1.${expires}.${sessionId}`;
  return `v1.${expires}.${hmacSha256(unsigned, secret)}`;
}

export function verifyCsrfToken(
  token: string,
  sessionId: string,
  secret: string,
  now = new Date(),
): boolean {
  const parts = token.split(".");
  if (parts.length !== 3 || parts[0] !== "v1" || !/^\d+$/.test(parts[1])) {
    return false;
  }
  const expires = Number(parts[1]);
  if (!Number.isSafeInteger(expires) || expires * 1_000 <= now.getTime()) {
    return false;
  }
  const unsigned = `v1.${expires}.${sessionId}`;
  return constantTimeEqual(parts[2], hmacSha256(unsigned, secret));
}
