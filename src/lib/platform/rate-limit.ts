import { PlatformError } from "./errors";
import type { Store } from "./store";
import type { RateLimitResult } from "./types";

export const RATE_LIMITS = {
  imports: 10,
  analyses: 5,
  repairs: 3,
  executions: 30,
} as const;

export const GLOBAL_RATE_LIMITS = {
  liveAnalyses: 60,
  liveRepairs: 20,
} as const;

export type RateLimitedAction = keyof typeof RATE_LIMITS;
export type GloballyRateLimitedAction = keyof typeof GLOBAL_RATE_LIMITS;

function assertRateLimitOptions(limit: number, windowMs: number): void {
  if (!Number.isInteger(limit) || limit <= 0 || !Number.isFinite(windowMs) || windowMs <= 0) {
    throw new Error("Rate limit and window must be positive.");
  }
}

export async function enforceRateLimit(
  store: Store,
  sessionId: string,
  action: RateLimitedAction,
  options: { now?: Date; limit?: number; windowMs?: number } = {},
): Promise<RateLimitResult> {
  const now = options.now ?? new Date();
  const limit = options.limit ?? RATE_LIMITS[action];
  const windowMs = options.windowMs ?? 60 * 60 * 1_000;
  assertRateLimitOptions(limit, windowMs);

  const result = await store.consumeRateLimit({
    sessionId,
    action,
    now,
    limit,
    windowMs,
  });
  if (!result.allowed) {
    const retryAfterSeconds = Math.max(
      1,
      Math.ceil((result.resetAt.getTime() - now.getTime()) / 1_000),
    );
    throw new PlatformError(
      "RATE_LIMITED",
      "This session has reached the request limit.",
      429,
      { retryAfterSeconds },
    );
  }
  return result;
}

export async function enforceGlobalRateLimit(
  store: Store,
  action: GloballyRateLimitedAction,
  options: { now?: Date; limit?: number; windowMs?: number } = {},
): Promise<RateLimitResult> {
  const now = options.now ?? new Date();
  const limit = options.limit ?? GLOBAL_RATE_LIMITS[action];
  const windowMs = options.windowMs ?? 60 * 60 * 1_000;
  assertRateLimitOptions(limit, windowMs);

  const result = await store.consumeGlobalRateLimit({
    scope: action,
    now,
    limit,
    windowMs,
  });
  if (!result.allowed) {
    const retryAfterSeconds = Math.max(
      1,
      Math.ceil((result.resetAt.getTime() - now.getTime()) / 1_000),
    );
    throw new PlatformError(
      "GLOBAL_RATE_LIMITED",
      "RetryProof has reached its shared request budget.",
      429,
      { retryAfterSeconds },
    );
  }
  return result;
}
