import { describe, expect, it } from "vitest";

import { InMemoryStore } from "@/lib/platform/memory-store";
import { runIdempotent } from "@/lib/platform/idempotency";

const NOW = new Date("2026-07-14T00:00:00.000Z");

describe("platform store", () => {
  it("replays completed idempotent requests and rejects changed bodies", async () => {
    const store = new InMemoryStore();
    await store.createSession({
      id: "session-1",
      createdAt: NOW,
      expiresAt: new Date(NOW.getTime() + 86_400_000),
      demoSeed: false,
    });
    let calls = 0;
    const execute = async () => {
      calls += 1;
      return { status: 201, body: { executionId: "execution-1" } };
    };

    const first = await runIdempotent(
      store,
      {
        sessionId: "session-1",
        route: "/executions",
        key: "same-key",
        request: { seed: "demo" },
        now: NOW,
      },
      execute,
    );
    const replay = await runIdempotent(
      store,
      {
        sessionId: "session-1",
        route: "/executions",
        key: "same-key",
        request: { seed: "demo" },
        now: NOW,
      },
      execute,
    );

    expect(first.replayed).toBe(false);
    expect(replay).toMatchObject({ replayed: true, status: 201 });
    expect(calls).toBe(1);

    await expect(
      runIdempotent(
        store,
        {
          sessionId: "session-1",
          route: "/executions",
          key: "same-key",
          request: { seed: "changed" },
          now: NOW,
        },
        execute,
      ),
    ).rejects.toMatchObject({
      code: "IDEMPOTENCY_CONFLICT",
      status: 409,
    });
  });

  it("recovers stale job locks but never reclaims completed work", async () => {
    const store = new InMemoryStore();
    await store.createSession({
      id: "session-1",
      createdAt: NOW,
      expiresAt: new Date(NOW.getTime() + 86_400_000),
      demoSeed: false,
    });
    await store.enqueueJob({
      id: "job-1",
      sessionId: "session-1",
      type: "analysis",
      payload: { analysisId: "analysis-1" },
      availableAt: NOW,
      createdAt: NOW,
      expiresAt: new Date(NOW.getTime() + 86_400_000),
    });

    const first = await store.claimNextJob({
      workerId: "worker-1",
      now: NOW,
      staleAfterMs: 30_000,
    });
    expect(first).toMatchObject({ id: "job-1", attempts: 1 });
    expect(
      await store.claimNextJob({
        workerId: "worker-2",
        now: new Date(NOW.getTime() + 29_999),
        staleAfterMs: 30_000,
      }),
    ).toBeNull();

    const restarted = await store.claimNextJob({
      workerId: "worker-2",
      now: new Date(NOW.getTime() + 30_001),
      staleAfterMs: 30_000,
    });
    expect(restarted).toMatchObject({
      id: "job-1",
      attempts: 2,
      lockedBy: "worker-2",
    });
    await store.completeJob("job-1", "worker-2", {
      now: new Date(NOW.getTime() + 30_002),
      progress: { resultId: "result-1" },
    });
    expect(
      await store.claimNextJob({
        workerId: "worker-3",
        now: new Date(NOW.getTime() + 60_000),
        staleAfterMs: 30_000,
      }),
    ).toBeNull();
  });

  it("deletes expired sessions and all session-scoped platform records", async () => {
    const store = new InMemoryStore();
    await store.createSession({
      id: "expired",
      createdAt: NOW,
      expiresAt: new Date(NOW.getTime() + 1_000),
      demoSeed: false,
    });
    await store.createSession({
      id: "current",
      createdAt: NOW,
      expiresAt: new Date(NOW.getTime() + 100_000),
      demoSeed: false,
    });
    await store.appendAuditEvent({
      id: "event-1",
      sessionId: "expired",
      eventType: "session.created",
      requestId: "request-1",
      metadata: {},
      createdAt: NOW,
    });

    const result = await store.cleanupExpired(new Date(NOW.getTime() + 1_001));

    expect(result.sessionsDeleted).toBe(1);
    expect(result.auditEventsDeleted).toBe(1);
    expect(await store.getSession("expired")).toBeNull();
    expect(await store.getSession("current")).not.toBeNull();
  });
});
