import { describe, expect, it } from "vitest";

import { N8nIngestionError } from "@/lib/n8n";
import { sanitizeFixture } from "@/lib/lab/security";

describe("sanitizeFixture", () => {
  it("clones ordinary synthetic fixture data", () => {
    const input = { event: { id: "evt_1", amount: 1299 } };
    const result = sanitizeFixture(input);
    expect(result).toEqual(input);
    expect(result).not.toBe(input);
  });

  it("rejects credential-like fields without exposing their values", () => {
    const secret = "should-never-be-returned";
    try {
      sanitizeFixture({ event: { id: "evt_1" }, apiKey: secret });
      expect.fail("Expected secret rejection");
    } catch (error) {
      expect(error).toBeInstanceOf(N8nIngestionError);
      expect((error as N8nIngestionError).code).toBe("INLINE_SECRET_DETECTED");
      expect((error as N8nIngestionError).details.jsonPaths).toEqual(["$.apiKey"]);
      expect(JSON.stringify(error)).not.toContain(secret);
    }
  });

  it("rejects access and refresh token key variants", () => {
    expect(() =>
      sanitizeFixture({
        event: { id: "evt_1" },
        accessToken: "synthetic-access-value",
        nested: { refresh_token: "synthetic-refresh-value" },
      }),
    ).toThrow(N8nIngestionError);
  });

  it("rejects object-valued credential containers", () => {
    expect(() =>
      sanitizeFixture({
        event: { id: "evt_1" },
        accessToken: { value: "hidden" },
      }),
    ).toThrow(N8nIngestionError);
  });

  it("rejects secret-shaped values even when the field name looks harmless", () => {
    try {
      sanitizeFixture({ event: { id: "AKIAABCDEFGHIJKLMNOP" } });
      expect.fail("Expected secret-shaped fixture value rejection");
    } catch (error) {
      expect(error).toBeInstanceOf(N8nIngestionError);
      expect((error as N8nIngestionError).code).toBe("INLINE_SECRET_DETECTED");
      expect((error as N8nIngestionError).details.jsonPaths).toEqual(["$.event.id"]);
      expect(JSON.stringify(error)).not.toContain("AKIAABCDEFGHIJKLMNOP");
    }
  });
});
