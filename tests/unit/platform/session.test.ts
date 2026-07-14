import { describe, expect, it } from "vitest";

import {
  SessionSigner,
  parseCookieHeader,
  sessionCookieHeader,
} from "@/lib/platform/session";
import { createCsrfToken, verifyCsrfToken } from "@/lib/platform/csrf";
import { InMemoryStore } from "@/lib/platform/memory-store";
import { ensureSession } from "@/lib/platform/session-service";

const SECRET = "test-secret-that-is-at-least-thirty-two-characters";
const NOW = new Date("2026-07-14T00:00:00.000Z");

describe("signed sessions", () => {
  it("accepts an intact cookie and rejects tampering or expiry", () => {
    const signer = new SessionSigner(SECRET);
    const token = signer.sign("session-1", new Date(NOW.getTime() + 60_000));

    expect(signer.verify(token, NOW)?.sessionId).toBe("session-1");
    expect(signer.verify(`${token.slice(0, -1)}x`, NOW)).toBeNull();
    expect(signer.verify(token, new Date(NOW.getTime() + 60_001))).toBeNull();
  });

  it("emits a hardened cookie and parses cookie headers without decoding data", () => {
    const header = sessionCookieHeader("signed.value", {
      secure: true,
      maxAgeSeconds: 3600,
    });

    expect(header).toContain("retryproof_session=signed.value");
    expect(header).toContain("HttpOnly");
    expect(header).toContain("Secure");
    expect(header).toContain("SameSite=Lax");
    expect(parseCookieHeader("a=1; retryproof_session=signed.value")).toBe(
      "signed.value",
    );
  });
});

describe("CSRF tokens", () => {
  it("binds tokens to a session and rejects tampering", () => {
    const token = createCsrfToken("session-1", SECRET, {
      now: NOW,
      ttlMs: 60_000,
    });

    expect(verifyCsrfToken(token, "session-1", SECRET, NOW)).toBe(true);
    expect(verifyCsrfToken(token, "session-2", SECRET, NOW)).toBe(false);
    expect(verifyCsrfToken(`${token}x`, "session-1", SECRET, NOW)).toBe(false);
    expect(
      verifyCsrfToken(token, "session-1", SECRET, new Date(NOW.getTime() + 60_001)),
    ).toBe(false);
  });
});

describe("ensureSession", () => {
  it("reuses a verified live session and replaces a tampered cookie", async () => {
    const signer = new SessionSigner(SECRET);
    const store = new InMemoryStore();
    const created = await ensureSession(store, signer, {
      now: NOW,
      secureCookie: false,
    });
    const cookie = created.setCookie?.split(";")[0] ?? "";

    const reused = await ensureSession(store, signer, {
      cookieHeader: cookie,
      now: new Date(NOW.getTime() + 1_000),
      secureCookie: false,
    });
    expect(reused).toMatchObject({ created: false, setCookie: null });
    expect(reused.session.id).toBe(created.session.id);

    const replaced = await ensureSession(store, signer, {
      cookieHeader: `${cookie}x`,
      now: new Date(NOW.getTime() + 2_000),
      secureCookie: false,
    });
    expect(replaced.created).toBe(true);
    expect(replaced.session.id).not.toBe(created.session.id);
  });

  it("does not let one anonymous client exhaust session creation globally", async () => {
    const signer = new SessionSigner(SECRET);
    const store = new InMemoryStore();
    await ensureSession(store, signer, {
      now: NOW,
      secureCookie: false,
    });
    await expect(ensureSession(store, signer, {
      now: NOW,
      secureCookie: false,
    })).resolves.toMatchObject({ created: true });
  });
});
