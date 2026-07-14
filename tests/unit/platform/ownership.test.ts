import { describe, expect, it } from "vitest";

import { PlatformError } from "@/lib/platform/errors";
import { requireOwnedResource } from "@/lib/platform/ownership";

describe("resource ownership", () => {
  it("returns owned resources and rejects a different session", () => {
    const resource = { id: "workflow-1", sessionId: "session-1" };

    expect(requireOwnedResource("session-1", resource)).toBe(resource);
    expect(() => requireOwnedResource("session-2", resource)).toThrowError(
      expect.objectContaining<Partial<PlatformError>>({
        code: "RESOURCE_NOT_OWNED",
        status: 403,
      }),
    );
    expect(() => requireOwnedResource("session-1", null)).toThrowError(
      expect.objectContaining<Partial<PlatformError>>({
        code: "RESOURCE_NOT_FOUND",
        status: 404,
      }),
    );
  });
});
