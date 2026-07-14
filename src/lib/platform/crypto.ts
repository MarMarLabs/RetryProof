import {
  createHash,
  createHmac,
  timingSafeEqual,
} from "node:crypto";

import type { JsonValue } from "./types";

export function assertSigningSecret(secret: string): void {
  if (Buffer.byteLength(secret, "utf8") < 32) {
    throw new Error("Signing secrets must contain at least 32 bytes.");
  }
}

export function hmacSha256(value: string, secret: string): string {
  assertSigningSecret(secret);
  return createHmac("sha256", secret).update(value, "utf8").digest("base64url");
}

export function constantTimeEqual(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left, "utf8");
  const rightBuffer = Buffer.from(right, "utf8");
  return (
    leftBuffer.length === rightBuffer.length &&
    timingSafeEqual(leftBuffer, rightBuffer)
  );
}

function canonicalize(value: JsonValue): string {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map(canonicalize).join(",")}]`;
  }
  return `{${Object.entries(value)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, entry]) => `${JSON.stringify(key)}:${canonicalize(entry)}`)
    .join(",")}}`;
}

export function hashJson(value: JsonValue): string {
  return createHash("sha256").update(canonicalize(value), "utf8").digest("hex");
}
