import { describe, expect, it, vi } from "vitest";

import { checkReadiness } from "@/lib/platform/readiness";

describe("deployment readiness", () => {
  it("is ready without PostgreSQL when the ephemeral store is intentional", async () => {
    const inspect = vi.fn();

    await expect(
      checkReadiness({ databaseUrl: undefined, inspect }),
    ).resolves.toEqual({
      ready: true,
      storage: "ephemeral",
      schema: "not_required",
      appliedMigrations: null,
    });
    expect(inspect).not.toHaveBeenCalled();
  });

  it("requires both runtime tables when PostgreSQL is configured", async () => {
    const inspect = vi.fn().mockResolvedValue({
      sessions: true,
      jobs: true,
      idempotencyKeys: true,
      globalRateLimitBuckets: true,
      labRuntimeRecords: false,
      appliedMigrations: 3,
    });

    await expect(
      checkReadiness({ databaseUrl: "postgres://configured", inspect }),
    ).resolves.toEqual({
      ready: false,
      storage: "postgres",
      schema: "missing",
      appliedMigrations: 3,
    });
  });

  it("reports a database connection failure without exposing its message", async () => {
    const inspect = vi.fn().mockRejectedValue(
      new Error("password=do-not-return host=private.internal"),
    );

    await expect(
      checkReadiness({ databaseUrl: "postgres://configured", inspect }),
    ).resolves.toEqual({
      ready: false,
      storage: "postgres",
      schema: "unavailable",
      appliedMigrations: null,
    });
  });
});
