import { createHash } from "node:crypto";

function normalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(normalize);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, item]) => [key, normalize(item)]),
    );
  }
  if (typeof value === "number" && !Number.isFinite(value)) {
    throw new Error("Deterministic serialization does not support non-finite numbers");
  }
  if (value === undefined || typeof value === "function" || typeof value === "symbol") {
    throw new Error("Deterministic serialization received an unsupported value");
  }
  return value;
}

export function deterministicSerialize(value: unknown): string {
  return JSON.stringify(normalize(value));
}

export function deterministicHash(value: unknown): string {
  return createHash("sha256").update(deterministicSerialize(value)).digest("hex");
}
