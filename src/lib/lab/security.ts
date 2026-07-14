import { N8nIngestionError, scanInlineSecretPaths } from "@/lib/n8n";

const MAX_FIXTURE_BYTES = 256 * 1024;
const MAX_FIXTURE_DEPTH = 32;

function appendPath(path: string, key: string | number): string {
  return typeof key === "number" ? `${path}[${key}]` : `${path}.${key}`;
}

export function sanitizeFixture(input: unknown): Record<string, unknown> {
  const serialized = JSON.stringify(input);
  if (Buffer.byteLength(serialized, "utf8") > MAX_FIXTURE_BYTES) {
    throw new N8nIngestionError("UPLOAD_TOO_LARGE", "Fixture exceeds the allowed size.", {
      limit: MAX_FIXTURE_BYTES,
    });
  }
  if (input === null || typeof input !== "object" || Array.isArray(input)) {
    throw new N8nIngestionError("INVALID_WORKFLOW", "Fixture must be a JSON object.");
  }

  const pending: Array<{ value: unknown; path: string; depth: number }> = [
    { value: input, path: "$", depth: 0 },
  ];
  while (pending.length > 0) {
    const item = pending.pop();
    if (!item) break;
    if (item.depth > MAX_FIXTURE_DEPTH) {
      throw new N8nIngestionError("MAX_DEPTH_EXCEEDED", "Fixture exceeds the allowed depth.", {
        jsonPaths: [item.path],
        limit: MAX_FIXTURE_DEPTH,
      });
    }
    if (item.value === null || typeof item.value !== "object") continue;
    const entries = Array.isArray(item.value)
      ? item.value.map((value, index) => [index, value] as const)
      : Object.entries(item.value);
    for (const [key, value] of entries) {
      const path = appendPath(item.path, key);
      pending.push({ value, path, depth: item.depth + 1 });
    }
  }
  const secretPaths = scanInlineSecretPaths(input);
  if (secretPaths.length > 0) {
    throw new N8nIngestionError(
      "INLINE_SECRET_DETECTED",
      "Fixture contains credential-like inline values. Remove them before upload.",
      { jsonPaths: [...secretPaths].sort() },
    );
  }
  return structuredClone(input as Record<string, unknown>);
}
