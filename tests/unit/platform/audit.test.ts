import { describe, expect, it } from "vitest";

import { sanitizeAuditMetadata } from "@/lib/observability/audit";

describe("audit metadata", () => {
  it("accepts bounded scalar metadata and rejects payload-like fields", () => {
    expect(
      sanitizeAuditMetadata({ workflowHash: "abc", count: 2, cached: false }),
    ).toEqual({ workflowHash: "abc", count: 2, cached: false });

    expect(() => sanitizeAuditMetadata({ requestBody: "secret" })).toThrow(
      /payload-like metadata/i,
    );
    expect(() => sanitizeAuditMetadata({ nested: { unsafe: true } })).toThrow(
      /scalar/i,
    );
  });
});
