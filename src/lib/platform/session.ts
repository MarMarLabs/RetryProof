import { randomUUID } from "node:crypto";

import { constantTimeEqual, hmacSha256 } from "./crypto";
import type { SessionRecord } from "./types";

export const SESSION_COOKIE_NAME = "retryproof_session";
export const SESSION_TTL_MS = 24 * 60 * 60 * 1_000;

export interface VerifiedSessionToken {
  sessionId: string;
  expiresAt: Date;
}

export class SessionSigner {
  constructor(private readonly secret: string) {}

  sign(sessionId: string, expiresAt: Date): string {
    const encodedSessionId = Buffer.from(sessionId, "utf8").toString("base64url");
    const expires = Math.floor(expiresAt.getTime() / 1_000);
    const unsigned = `v1.${encodedSessionId}.${expires}`;
    return `${unsigned}.${hmacSha256(unsigned, this.secret)}`;
  }

  verify(token: string, now = new Date()): VerifiedSessionToken | null {
    const parts = token.split(".");
    if (parts.length !== 4 || parts[0] !== "v1") return null;

    const [version, encodedSessionId, rawExpires, signature] = parts;
    if (!/^\d+$/.test(rawExpires)) return null;
    const expires = Number(rawExpires);
    if (!Number.isSafeInteger(expires)) return null;

    const unsigned = `${version}.${encodedSessionId}.${rawExpires}`;
    const expected = hmacSha256(unsigned, this.secret);
    if (!constantTimeEqual(signature, expected)) return null;

    const expiresAt = new Date(expires * 1_000);
    if (expiresAt.getTime() <= now.getTime()) return null;
    try {
      const sessionId = Buffer.from(encodedSessionId, "base64url").toString("utf8");
      if (!sessionId || sessionId.length > 128) return null;
      return { sessionId, expiresAt };
    } catch {
      return null;
    }
  }
}

export function sessionSignerFromEnvironment(): SessionSigner {
  const secret = process.env.SESSION_SECRET;
  if (!secret) {
    throw new Error("SESSION_SECRET is required to sign anonymous sessions.");
  }
  return new SessionSigner(secret);
}

export function createSessionRecord(
  now = new Date(),
  options: { id?: string; demoSeed?: boolean; ttlMs?: number } = {},
): SessionRecord {
  const ttlMs = options.ttlMs ?? SESSION_TTL_MS;
  if (!Number.isFinite(ttlMs) || ttlMs <= 0) {
    throw new Error("Session TTL must be positive.");
  }
  return {
    id: options.id ?? randomUUID(),
    createdAt: new Date(now),
    expiresAt: new Date(now.getTime() + ttlMs),
    demoSeed: options.demoSeed ?? false,
  };
}

export function sessionCookieHeader(
  value: string,
  options: { secure?: boolean; maxAgeSeconds?: number } = {},
): string {
  if (!/^[A-Za-z0-9._~-]+$/.test(value)) {
    throw new Error("Session cookie contains invalid characters.");
  }
  const maxAgeSeconds = Math.max(0, Math.floor(options.maxAgeSeconds ?? 86_400));
  return [
    `${SESSION_COOKIE_NAME}=${value}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    options.secure === false ? null : "Secure",
    `Max-Age=${maxAgeSeconds}`,
  ]
    .filter((part): part is string => part !== null)
    .join("; ");
}

export function clearSessionCookieHeader(secure = true): string {
  return sessionCookieHeader("deleted", { secure, maxAgeSeconds: 0 });
}

export function parseCookieHeader(header: string | null | undefined): string | null {
  if (!header) return null;
  for (const entry of header.split(";")) {
    const separator = entry.indexOf("=");
    if (separator < 0) continue;
    const name = entry.slice(0, separator).trim();
    if (name === SESSION_COOKIE_NAME) {
      return entry.slice(separator + 1).trim() || null;
    }
  }
  return null;
}
