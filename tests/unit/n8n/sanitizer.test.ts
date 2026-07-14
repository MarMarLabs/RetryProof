import { describe, expect, it } from "vitest";

import {
  N8nIngestionError,
  sanitizeN8nWorkflow,
  scanInlineSecretPaths,
} from "@/lib/n8n";

import { makeSupportedWorkflow } from "./fixtures";

describe("n8n workflow sanitization", () => {
  it("strips credential references without mutating the parsed workflow", () => {
    const workflow = makeSupportedWorkflow();
    workflow.nodes[0].notes = "untrusted note";
    workflow.pinData = { "Refund webhook": [{ json: { customer: "synthetic" } }] };
    workflow.staticData = { lastRun: 7 };
    const result = sanitizeN8nWorkflow(workflow);

    expect(result.credentialReferencesRemoved).toBe(1);
    expect(result.workflow.nodes[4].credentials).toBeUndefined();
    expect(workflow.nodes[4].credentials).toBeDefined();
    expect(result.workflow.nodes[0].notes).toBeUndefined();
    expect(result.workflow.pinData).toBeUndefined();
    expect(result.workflow.staticData).toBeUndefined();
    expect(workflow.pinData).toBeDefined();
    expect(result.inlineSecretPaths).toEqual([]);
  });

  it("reports JSONPaths and never returns inline secret values", () => {
    const workflow = makeSupportedWorkflow();
    const secret = "Bearer extremely-sensitive-token";
    workflow.nodes[4].parameters.headerParameters = {
      parameters: [{ name: "Authorization", value: secret }],
    };

    try {
      sanitizeN8nWorkflow(workflow);
      throw new Error("Expected sanitizer to reject the workflow.");
    } catch (error) {
      expect(error).toBeInstanceOf(N8nIngestionError);
      const ingestionError = error as N8nIngestionError;
      expect(ingestionError.code).toBe("INLINE_SECRET_DETECTED");
      expect(ingestionError.details.jsonPaths).toEqual([
        "$.nodes[4].parameters.headerParameters.parameters[0].value",
      ]);
      expect(ingestionError.message).not.toContain(secret);
      expect(JSON.stringify(ingestionError.details)).not.toContain(secret);
    }
  });

  it("detects common key, URL, JWT, key, and private-key secret shapes", () => {
    const paths = scanInlineSecretPaths({
      password: "not-a-placeholder",
      endpoint: "https://user:pass@example.test/path",
      callback: "https://example.test/hook?api_key=abcdef123456",
      bearer: "Bearer abcdefghijklmnop",
      jwt: "abcdefghijkl.abcdefgh.abcdefghijkl",
      aws: "AKIAABCDEFGHIJKLMNOP",
      private: "-----BEGIN PRIVATE KEY-----\nredacted material",
      headers: [{ name: "X-API-Key", value: "short-but-secret" }],
    });
    expect(paths).toEqual([
      "$.aws",
      "$.bearer",
      "$.callback",
      "$.endpoint",
      "$.headers[0].value",
      "$.jwt",
      "$.password",
      "$.private",
    ]);
  });

  it("does not mistake credential references, placeholders, or field expressions for inline values", () => {
    const workflow = makeSupportedWorkflow();
    workflow.nodes[1].parameters.safeMappings = {
      apiKey: "${DEMO_API_KEY}",
      token: "={{ $json.event.token }}",
      secret: "<redacted>",
    };
    expect(scanInlineSecretPaths(workflow)).toEqual([]);
  });

  it("does not let a template fragment hide a literal sensitive value", () => {
    expect(
      scanInlineSecretPaths({
        token: "Bearer literal-secret-value {{ $json.suffix }}",
      }),
    ).toEqual(["$.token"]);
    expect(
      scanInlineSecretPaths({
        apiKey: '={{ "sk-proj-abcdefghijklmnopqrstuv" }}',
      }),
    ).toEqual(["$.apiKey"]);
  });

  it("rejects opaque credentials in provider-specific authentication headers", () => {
    const paths = scanInlineSecretPaths({
      headers: [
        {
          name: "X-CMC_PRO_API_KEY",
          value: "SYNTHETIC_OPAQUE_KEY_1234567890",
        },
      ],
    });

    expect(paths).toEqual(["$.headers[0].value"]);
  });

  it("rejects opaque credentials under provider-prefixed sensitive keys", () => {
    expect(
      scanInlineSecretPaths({
        parameters: { openaiApiKey: "SYNTHETIC_OPAQUE_CREDENTIAL_12345" },
      }),
    ).toEqual(["$.parameters.openaiApiKey"]);
  });
});
