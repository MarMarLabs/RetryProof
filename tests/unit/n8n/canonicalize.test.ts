import { describe, expect, it } from "vitest";

import {
  canonicalizeN8nWorkflow,
  hashCanonicalN8nWorkflow,
  ingestN8nWorkflow,
  stableStringify,
} from "@/lib/n8n";

import { makeSupportedWorkflow } from "./fixtures";

describe("canonical n8n workflow hashing", () => {
  it("is stable across object-key and node-array ordering", () => {
    const first = makeSupportedWorkflow();
    const second = makeSupportedWorkflow();
    second.nodes.reverse();
    second.nodes[1].parameters = {
      sendBody: true,
      body: "={{ $json.event }}",
      url: "https://mock.retryproof.local/refunds",
      rawContentType: "application/json",
      method: "POST",
      contentType: "raw",
    };

    const firstCanonical = canonicalizeN8nWorkflow(first);
    const secondCanonical = canonicalizeN8nWorkflow(second);
    expect(hashCanonicalN8nWorkflow(firstCanonical)).toBe(
      hashCanonicalN8nWorkflow(secondCanonical),
    );
    expect(stableStringify(firstCanonical)).toBe(stableStringify(secondCanonical));
  });

  it("drops notes, metadata, pin data, and credentials from persisted/model input", () => {
    const workflow = makeSupportedWorkflow();
    workflow.nodes[0].notes = "untrusted instruction text";
    workflow.pinData = { "Refund webhook": [{ json: { synthetic: true } }] };
    workflow.meta = { instanceId: "instance-metadata" };

    const result = ingestN8nWorkflow(JSON.stringify(workflow));
    const serialized = JSON.stringify(result.canonicalWorkflow);
    expect(serialized).not.toContain("untrusted instruction text");
    expect(serialized).not.toContain("instance-metadata");
    expect(serialized).not.toContain("credential-ref-1");
    expect(serialized).not.toContain("pinData");
    expect(result.credentialReferencesRemoved).toBe(1);
    expect(result.sourceHash).toMatch(/^[a-f0-9]{64}$/);
  });

  it("changes the hash when executable parameters change", () => {
    const first = canonicalizeN8nWorkflow(makeSupportedWorkflow());
    const changed = makeSupportedWorkflow();
    changed.nodes[4].parameters.url = "https://mock.retryproof.local/refunds-v2";
    expect(hashCanonicalN8nWorkflow(first)).not.toBe(
      hashCanonicalN8nWorkflow(canonicalizeN8nWorkflow(changed)),
    );
  });

  it("rejects non-JSON and circular canonical input", () => {
    expect(() => stableStringify({ missing: undefined })).toThrow(TypeError);
    const circular: Record<string, unknown> = {};
    circular.self = circular;
    expect(() => stableStringify(circular)).toThrow(TypeError);
  });
});
