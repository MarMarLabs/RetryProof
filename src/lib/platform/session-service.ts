import type { Store } from "./store";
import {
  createSessionRecord,
  parseCookieHeader,
  sessionCookieHeader,
  SessionSigner,
} from "./session";
import type { SessionRecord } from "./types";

export interface EnsuredSession {
  session: SessionRecord;
  created: boolean;
  setCookie: string | null;
}

export async function ensureSession(
  store: Store,
  signer: SessionSigner,
  options: {
    cookieHeader?: string | null;
    now?: Date;
    secureCookie?: boolean;
    demoSeed?: boolean;
  } = {},
): Promise<EnsuredSession> {
  const now = options.now ?? new Date();
  const rawToken = parseCookieHeader(options.cookieHeader);
  const verified = rawToken ? signer.verify(rawToken, now) : null;
  if (verified) {
    const session = await store.getSession(verified.sessionId);
    if (session && session.expiresAt.getTime() > now.getTime()) {
      return { session, created: false, setCookie: null };
    }
  }

  const session = createSessionRecord(now, { demoSeed: options.demoSeed });
  await store.createSession(session);
  const token = signer.sign(session.id, session.expiresAt);
  return {
    session,
    created: true,
    setCookie: sessionCookieHeader(token, {
      secure: options.secureCookie ?? true,
      maxAgeSeconds: Math.floor((session.expiresAt.getTime() - now.getTime()) / 1_000),
    }),
  };
}
