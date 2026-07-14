import { randomBytes } from "node:crypto";

import {
  clearSessionCookieHeader,
  createCsrfToken,
  ensureSession,
  getStore,
  parseCookieHeader,
  SessionSigner,
  verifyCsrfToken,
} from "@/lib/platform";

const globalSecrets = globalThis as typeof globalThis & {
  __retryProofDevelopmentSessionSecret?: string;
};

function sessionSecret(): string {
  const configured = process.env.SESSION_SIGNING_SECRET ?? process.env.SESSION_SECRET;
  if (configured) {
    if (Buffer.byteLength(configured, "utf8") < 32) {
      throw new Error("SESSION_SIGNING_SECRET must contain at least 32 bytes.");
    }
    return configured;
  }
  if (process.env.NODE_ENV === "production") {
    throw new Error("SESSION_SIGNING_SECRET is required in production.");
  }
  globalSecrets.__retryProofDevelopmentSessionSecret ??= randomBytes(32).toString("base64url");
  return globalSecrets.__retryProofDevelopmentSessionSecret;
}

export interface LabSessionContext {
  sessionId: string;
  csrfToken: string;
  created: boolean;
  setCookie: string | null;
}

export async function establishLabSession(request: Request): Promise<LabSessionContext> {
  const secret = sessionSecret();
  const ensured = await ensureSession(getStore(), new SessionSigner(secret), {
    cookieHeader: request.headers.get("cookie"),
    secureCookie: process.env.NODE_ENV === "production",
  });
  return {
    sessionId: ensured.session.id,
    csrfToken: createCsrfToken(ensured.session.id, secret),
    created: ensured.created,
    setCookie: ensured.setCookie,
  };
}

export async function requireLabSession(request: Request): Promise<LabSessionContext> {
  const secret = sessionSecret();
  const token = parseCookieHeader(request.headers.get("cookie"));
  const verified = token ? new SessionSigner(secret).verify(token) : null;
  const session = verified ? await getStore().getSession(verified.sessionId) : null;
  if (!session || session.expiresAt.getTime() <= Date.now()) {
    throw new LabHttpError("SESSION_REQUIRED", "A valid RetryProof session is required.", 401);
  }
  return {
    sessionId: session.id,
    csrfToken: createCsrfToken(session.id, secret),
    created: false,
    setCookie: null,
  };
}

export function requireCsrf(request: Request, sessionId: string): void {
  const token = request.headers.get("x-csrf-token");
  if (!token || !verifyCsrfToken(token, sessionId, sessionSecret())) {
    throw new LabHttpError("CSRF_INVALID", "The CSRF token is missing or invalid.", 403);
  }
}

export function sessionDeleteCookie(): string {
  return clearSessionCookieHeader(process.env.NODE_ENV === "production");
}

export class LabHttpError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly status: number,
    readonly details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "LabHttpError";
  }
}
