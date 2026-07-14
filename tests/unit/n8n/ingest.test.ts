import { describe, expect, it } from "vitest";

import {
  N8nIngestionError,
  ingestN8nWorkflow,
} from "@/lib/n8n";

import { makeSupportedWorkflow } from "./fixtures";

describe("secure n8n ingestion pipeline", () => {
  it("returns only sanitized, canonical, hashed, compatibility-checked data", () => {
    const result = ingestN8nWorkflow(JSON.stringify(makeSupportedWorkflow()));
    expect(result.inlineSecrets).toEqual([]);
    expect(result.credentialReferencesRemoved).toBe(1);
    expect(result.sanitizedWorkflow.nodes[4].credentials).toBeUndefined();
    expect(result.canonicalWorkflow.nodes.every((node) => !("credentials" in node))).toBe(true);
    expect(result.compatibility.canExecute).toBe(true);
    expect(result.sourceHash).toMatch(/^[a-f0-9]{64}$/);
  });

  it("rejects inline secrets before returning any workflow representation", () => {
    const workflow = makeSupportedWorkflow();
    workflow.nodes[4].parameters.apiKey = "sk-proj-abcdefghijklmnopqrstuv";
    try {
      ingestN8nWorkflow(JSON.stringify(workflow));
      throw new Error("Expected ingestion to reject the workflow.");
    } catch (error) {
      expect(error).toBeInstanceOf(N8nIngestionError);
      expect((error as N8nIngestionError).code).toBe("INLINE_SECRET_DETECTED");
    }
  });
});
