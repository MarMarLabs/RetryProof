import { describe, expect, it } from "vitest";

import { parseJsonObject, routeError } from "@/lib/lab/http";
import { LabHttpError } from "@/lib/lab/session";
import { N8nIngestionError } from "@/lib/n8n";

describe("bounded JSON request parsing", () => {
  it("parses a small JSON object", async () => {
    await expect(
      parseJsonObject(
        new Request("http://local/test", {
          method: "POST",
          body: JSON.stringify({ ok: true }),
        }),
      ),
    ).resolves.toEqual({ ok: true });
  });

  it("rejects an oversized chunked body without relying on Content-Length", async () => {
    const request = new Request("http://local/test", {
      method: "POST",
      body: JSON.stringify({ pad: "x".repeat(70 * 1024) }),
    });
    expect(request.headers.has("content-length")).toBe(false);

    try {
      await parseJsonObject(request);
      expect.fail("Expected the request body limit to reject the payload.");
    } catch (error) {
      expect(error).toBeInstanceOf(LabHttpError);
      expect((error as LabHttpError).code).toBe("UPLOAD_TOO_LARGE");
      expect((error as LabHttpError).status).toBe(413);
    }
  });
});

describe("public error details", () => {
  it("redacts secret fragments embedded in attacker-controlled JSON paths", async () => {
    const synthetic = ["sk-proj", "syntheticSecretValue1234567890"].join("-");
    const response = routeError(new N8nIngestionError(
      "INLINE_SECRET_DETECTED",
      "Workflow contains suspected inline secrets.",
      { jsonPaths: [`$[\"${synthetic}\"]`] },
    ));
    const body = await response.text();
    expect(body).toContain("[redacted]");
    expect(body).not.toContain(synthetic);
  });
});
