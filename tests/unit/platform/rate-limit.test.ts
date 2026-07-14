import { describe, expect, it } from "vitest";

import { InMemoryStore } from "@/lib/platform/memory-store";
import {
  enforceGlobalRateLimit,
  enforceRateLimit,
} from "@/lib/platform/rate-limit";

describe("rate limiting", () => {
  it("enforces the configured fixed window and resets deterministically", async () => {
    const store = new InMemoryStore();
    const now = new Date("2026-07-14T00:00:00.000Z");

    await enforceRateLimit(store, "session-1", "imports", {
      now,
      limit: 2,
      windowMs: 60_000,
    });
    const second = await enforceRateLimit(store, "session-1", "imports", {
      now,
      limit: 2,
      windowMs: 60_000,
    });
    expect(second.remaining).toBe(0);

    await expect(
      enforceRateLimit(store, "session-1", "imports", {
        now,
        limit: 2,
        windowMs: 60_000,
      }),
    ).rejects.toMatchObject({
      code: "RATE_LIMITED",
      status: 429,
      retryAfterSeconds: 60,
    });

    const reset = await enforceRateLimit(store, "session-1", "imports", {
      now: new Date(now.getTime() + 60_000),
      limit: 2,
      windowMs: 60_000,
    });
    expect(reset.remaining).toBe(1);
  });

  it("enforces a store-wide budget that session churn cannot reset", async () => {
    const store = new InMemoryStore();
    const now = new Date("2026-07-14T00:00:00.000Z");

    await enforceGlobalRateLimit(store, "liveAnalyses", {
      now,
      limit: 1,
      windowMs: 60_000,
    });
    await expect(
      enforceGlobalRateLimit(store, "liveAnalyses", {
        now,
        limit: 1,
        windowMs: 60_000,
      }),
    ).rejects.toMatchObject({ code: "GLOBAL_RATE_LIMITED", status: 429 });
  });
});
