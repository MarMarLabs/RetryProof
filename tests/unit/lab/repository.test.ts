import { describe, expect, it } from "vitest";

import { MemoryLabRepository } from "@/lib/lab/repository";
import type { AnalysisRecord } from "@/lib/lab/types";
import { CACHED_DEMO_PLAN } from "@/lib/openai/cached-plan";

function analysis(overrides: Partial<AnalysisRecord> = {}): AnalysisRecord {
  return {
    kind: "analysis",
    id: "00000000-0000-4000-8000-000000000002",
    sessionId: "00000000-0000-4000-8000-000000000001",
    workflowId: "00000000-0000-4000-8000-000000000003",
    planVersion: 1,
    planHash: "a".repeat(64),
    result: {
      plan: CACHED_DEMO_PLAN,
      provenance: {
        mode: "cached",
        model: "gpt-5.6",
        promptVersion: "test",
        latencyMs: 0,
      },
    },
    createdAt: new Date(0).toISOString(),
    expiresAt: new Date(86_400_000).toISOString(),
    ...overrides,
  };
}

describe("MemoryLabRepository", () => {
  it("returns defensive clones and deletes only the selected session", async () => {
    const repository = new MemoryLabRepository();
    const first = analysis();
    const second = analysis({
      id: "00000000-0000-4000-8000-000000000004",
      sessionId: "00000000-0000-4000-8000-000000000005",
    });
    await repository.put(first);
    await repository.put(second);

    const read = await repository.get<AnalysisRecord>("analysis", first.id);
    expect(read).toEqual(first);
    read!.planVersion = 99;
    expect((await repository.get<AnalysisRecord>("analysis", first.id))!.planVersion).toBe(1);

    expect(await repository.deleteSession(first.sessionId)).toBe(1);
    expect(await repository.get<AnalysisRecord>("analysis", first.id)).toBeNull();
    expect(await repository.get<AnalysisRecord>("analysis", second.id)).not.toBeNull();
  });
});
