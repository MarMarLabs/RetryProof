import { spawnSync } from "node:child_process";
import { describe, expect, it } from "vitest";

describe("submission dry run", () => {
  it("accepts external fields that have already been resolved", () => {
    const result = spawnSync("node", ["scripts/submission-dry-run.mjs"], {
      cwd: process.cwd(),
      encoding: "utf8",
    });

    expect(result.status, result.stderr || result.stdout).toBe(0);
    const output = JSON.parse(result.stdout.trim()) as {
      status: string;
      unresolved: string[];
      resolved: string[];
    };

    expect(output.status).toBe("local-ready-awaiting-external-state");
    expect(output.unresolved).toEqual([]);
    expect(output.resolved).toContain("DEPLOYED_HTTPS_URL");
    expect(output.resolved).toContain("REPOSITORY_URL");
    expect(output.resolved).toContain("YOUTUBE_URL");
    expect(output.resolved).toContain("FEEDBACK_SESSION_ID");
  });
});
