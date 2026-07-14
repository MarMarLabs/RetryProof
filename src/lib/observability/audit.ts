import type { AuditEventRecord, AuditMetadata, JsonPrimitive } from "../platform/types";
import type { Store } from "../platform/store";

const FORBIDDEN_METADATA_KEY =
  /(body|payload|content|fixture|secret|token|authorization|cookie|password|raw|workflowjson)/i;
const MAX_KEY_LENGTH = 64;
const MAX_STRING_LENGTH = 256;
const MAX_METADATA_FIELDS = 24;

export function sanitizeAuditMetadata(
  metadata: Record<string, unknown>,
): AuditMetadata {
  const entries = Object.entries(metadata);
  if (entries.length > MAX_METADATA_FIELDS) {
    throw new Error("Audit metadata has too many fields.");
  }

  const sanitized: AuditMetadata = {};
  for (const [key, value] of entries) {
    if (!key || key.length > MAX_KEY_LENGTH) {
      throw new Error("Audit metadata keys must be between 1 and 64 characters.");
    }
    if (FORBIDDEN_METADATA_KEY.test(key)) {
      throw new Error(`Audit metadata key \"${key}\" is payload-like metadata.`);
    }
    if (
      value !== null &&
      typeof value !== "string" &&
      typeof value !== "number" &&
      typeof value !== "boolean"
    ) {
      throw new Error("Audit metadata values must be scalar.");
    }
    if (typeof value === "string" && value.length > MAX_STRING_LENGTH) {
      throw new Error("Audit metadata string values must not exceed 256 characters.");
    }
    if (typeof value === "number" && !Number.isFinite(value)) {
      throw new Error("Audit metadata numbers must be finite.");
    }
    sanitized[key] = value as JsonPrimitive;
  }
  return sanitized;
}

export async function recordAuditEvent(
  store: Store,
  event: Omit<AuditEventRecord, "metadata"> & {
    metadata?: Record<string, unknown>;
  },
): Promise<void> {
  await store.appendAuditEvent({
    ...event,
    metadata: sanitizeAuditMetadata(event.metadata ?? {}),
  });
}
