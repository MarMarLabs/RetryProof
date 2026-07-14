import { randomUUID } from "node:crypto";

import type { Store } from "./store";
import type { JobRecord, JsonValue } from "./types";

export const JOB_TTL_MS = 24 * 60 * 60 * 1_000;
export const DEFAULT_STALE_LOCK_MS = 2 * 60 * 1_000;

export async function enqueueJob(
  store: Store,
  input: {
    sessionId: string;
    type: string;
    payload: JsonValue;
    now?: Date;
    availableAt?: Date;
    id?: string;
    ttlMs?: number;
  },
): Promise<JobRecord> {
  const now = input.now ?? new Date();
  const ttlMs = input.ttlMs ?? JOB_TTL_MS;
  if (!Number.isFinite(ttlMs) || ttlMs <= 0) {
    throw new Error("Job TTL must be positive.");
  }
  const newJob = {
    id: input.id ?? randomUUID(),
    sessionId: input.sessionId,
    type: input.type,
    payload: input.payload,
    availableAt: input.availableAt ?? now,
    createdAt: now,
    expiresAt: new Date(now.getTime() + ttlMs),
  };
  await store.enqueueJob(newJob);
  const job = await store.getJob(newJob.id);
  if (!job) throw new Error("Enqueued job could not be read.");
  return job;
}

export function claimNextJob(
  store: Store,
  workerId: string,
  options: {
    now?: Date;
    staleAfterMs?: number;
    types?: string[];
  } = {},
): Promise<JobRecord | null> {
  return store.claimNextJob({
    workerId,
    now: options.now ?? new Date(),
    staleAfterMs: options.staleAfterMs ?? DEFAULT_STALE_LOCK_MS,
    types: options.types,
  });
}
