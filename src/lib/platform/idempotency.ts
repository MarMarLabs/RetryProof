import { PlatformError } from "./errors";
import { hashJson } from "./crypto";
import type { Store } from "./store";
import type { JsonValue } from "./types";

const DEFAULT_TTL_MS = 24 * 60 * 60 * 1_000;

export interface IdempotencyInput {
  sessionId: string;
  route: string;
  key: string;
  request: JsonValue;
  now?: Date;
  ttlMs?: number;
}

export interface IdempotentResponse {
  status: number;
  body: JsonValue | null;
  replayed: boolean;
}

export async function runIdempotent(
  store: Store,
  input: IdempotencyInput,
  operation: () => Promise<{ status: number; body: JsonValue | null }>,
): Promise<IdempotentResponse> {
  validateIdempotencyKey(input.key);
  const now = input.now ?? new Date();
  const ttlMs = input.ttlMs ?? DEFAULT_TTL_MS;
  const requestHash = hashJson(input.request);
  const start = await store.beginIdempotentRequest({
    sessionId: input.sessionId,
    route: input.route,
    key: input.key,
    requestHash,
    responseStatus: null,
    responseBody: null,
    createdAt: now,
    expiresAt: new Date(now.getTime() + ttlMs),
  });

  if (start.state === "conflict") {
    throw new PlatformError(
      "IDEMPOTENCY_CONFLICT",
      "The idempotency key was already used with a different request.",
      409,
    );
  }
  if (start.state === "in_progress") {
    throw new PlatformError(
      "IDEMPOTENCY_IN_PROGRESS",
      "A request with this idempotency key is still in progress.",
      409,
    );
  }
  if (start.state === "replay") {
    return {
      status: start.responseStatus,
      body: start.responseBody,
      replayed: true,
    };
  }

  let response: { status: number; body: JsonValue | null };
  try {
    response = await operation();
  } catch (error) {
    await store.abandonIdempotentRequest(
      input.sessionId,
      input.route,
      input.key,
      requestHash,
    );
    throw error;
  }

  // Persisting the response is deliberately outside the catch above. If the
  // operation succeeded but this write fails, retaining an in-progress claim
  // is safer than deleting it and allowing the operation to run twice.
  await store.completeIdempotentRequest(
    input.sessionId,
    input.route,
    input.key,
    requestHash,
    response.status,
    response.body,
  );
  return { ...response, replayed: false };
}

export function validateIdempotencyKey(key: string): void {
  if (!/^[A-Za-z0-9._:-]{8,128}$/.test(key)) {
    throw new PlatformError(
      "INVALID_IDEMPOTENCY_KEY",
      "Idempotency keys must be 8-128 URL-safe characters.",
      400,
    );
  }
}
