import {
  canonicalizeN8nWorkflow,
  hashCanonicalN8nWorkflow,
} from "./canonicalize";
import {
  analyzeN8nCompatibility,
  type CompatibilityOptions,
  type CompatibilityReport,
} from "./compatibility";
import { parseN8nWorkflow, type ParseN8nWorkflowOptions } from "./parser";
import { sanitizeN8nWorkflow } from "./sanitizer";
import type { CanonicalN8nWorkflow, N8nWorkflowExport } from "./types";

export type IngestN8nWorkflowOptions = ParseN8nWorkflowOptions &
  Readonly<{ compatibility?: CompatibilityOptions }>;

export type N8nIngestionResult = Readonly<{
  sanitizedWorkflow: N8nWorkflowExport;
  canonicalWorkflow: CanonicalN8nWorkflow;
  sourceHash: string;
  credentialReferencesRemoved: number;
  inlineSecrets: readonly [];
  compatibility: CompatibilityReport;
}>;

/**
 * The single secure import entrypoint. Raw text and the unsanitized parsed
 * object are intentionally not returned.
 */
export function ingestN8nWorkflow(
  input: string | Uint8Array,
  options: IngestN8nWorkflowOptions = {},
): N8nIngestionResult {
  const parsed = parseN8nWorkflow(input, options);
  const sanitized = sanitizeN8nWorkflow(parsed);
  const canonicalWorkflow = canonicalizeN8nWorkflow(sanitized.workflow);

  return {
    sanitizedWorkflow: sanitized.workflow,
    canonicalWorkflow,
    sourceHash: hashCanonicalN8nWorkflow(canonicalWorkflow),
    credentialReferencesRemoved: sanitized.credentialReferencesRemoved,
    inlineSecrets: sanitized.inlineSecretPaths,
    compatibility: analyzeN8nCompatibility(
      sanitized.workflow,
      options.compatibility,
    ),
  };
}
