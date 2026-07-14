import { sanitizeAuditMetadata } from "../observability/audit";
import { PlatformError } from "./errors";
import type { IdempotencyStart, Store } from "./store";
import type {
  AuditEventRecord,
  CleanupResult,
  IdempotencyRecord,
  JobRecord,
  JsonValue,
  NewJob,
  RateLimitResult,
  SessionRecord,
} from "./types";

interface RateBucket {
  sessionId: string;
  action: string;
  count: number;
  windowStart: Date;
  expiresAt: Date;
}

interface GlobalRateBucket {
  scope: string;
  count: number;
  windowStart: Date;
  expiresAt: Date;
}

const clone = <T>(value: T): T => structuredClone(value);
const idempotencyKey = (sessionId: string, route: string, key: string) =>
  `${sessionId}\u0000${route}\u0000${key}`;

export class InMemoryStore implements Store {
  private readonly sessions = new Map<string, SessionRecord>();
  private readonly idempotency = new Map<string, IdempotencyRecord>();
  private readonly rateBuckets = new Map<string, RateBucket>();
  private readonly globalRateBuckets = new Map<string, GlobalRateBucket>();
  private readonly jobs = new Map<string, JobRecord>();
  private readonly auditEvents = new Map<string, AuditEventRecord>();
  private tail: Promise<void> = Promise.resolve();

  private async atomic<T>(operation: () => T | Promise<T>): Promise<T> {
    const previous = this.tail;
    let release!: () => void;
    this.tail = new Promise<void>((resolve) => {
      release = resolve;
    });
    await previous;
    try {
      return await operation();
    } finally {
      release();
    }
  }

  async createSession(session: SessionRecord): Promise<void> {
    await this.atomic(() => {
      if (this.sessions.has(session.id)) {
        throw new PlatformError("SESSION_EXISTS", "Session already exists.", 409);
      }
      this.sessions.set(session.id, clone(session));
    });
  }

  async getSession(id: string): Promise<SessionRecord | null> {
    return this.atomic(() => {
      const session = this.sessions.get(id);
      return session ? clone(session) : null;
    });
  }

  async deleteSession(id: string): Promise<boolean> {
    return this.atomic(() => this.deleteSessionRecords(id));
  }

  private deleteSessionRecords(id: string): boolean {
    const deleted = this.sessions.delete(id);
    for (const [key, record] of this.idempotency) {
      if (record.sessionId === id) this.idempotency.delete(key);
    }
    for (const [key, record] of this.rateBuckets) {
      if (record.sessionId === id) this.rateBuckets.delete(key);
    }
    for (const [key, record] of this.jobs) {
      if (record.sessionId === id) this.jobs.delete(key);
    }
    for (const [key, record] of this.auditEvents) {
      if (record.sessionId === id) this.auditEvents.delete(key);
    }
    return deleted;
  }

  async beginIdempotentRequest(
    record: IdempotencyRecord,
  ): Promise<IdempotencyStart> {
    return this.atomic(() => {
      const composite = idempotencyKey(record.sessionId, record.route, record.key);
      const existing = this.idempotency.get(composite);
      if (!existing || existing.expiresAt.getTime() <= record.createdAt.getTime()) {
        this.idempotency.set(composite, clone(record));
        return { state: "acquired" };
      }
      if (existing.requestHash !== record.requestHash) return { state: "conflict" };
      if (existing.responseStatus === null) return { state: "in_progress" };
      return {
        state: "replay",
        responseStatus: existing.responseStatus,
        responseBody: clone(existing.responseBody),
      };
    });
  }

  async completeIdempotentRequest(
    sessionId: string,
    route: string,
    key: string,
    requestHash: string,
    responseStatus: number,
    responseBody: JsonValue | null,
  ): Promise<void> {
    await this.atomic(() => {
      const composite = idempotencyKey(sessionId, route, key);
      const existing = this.idempotency.get(composite);
      if (!existing || existing.requestHash !== requestHash) {
        throw new PlatformError(
          "IDEMPOTENCY_LOST",
          "The idempotency reservation no longer exists.",
          409,
        );
      }
      existing.responseStatus = responseStatus;
      existing.responseBody = clone(responseBody);
    });
  }

  async abandonIdempotentRequest(
    sessionId: string,
    route: string,
    key: string,
    requestHash: string,
  ): Promise<void> {
    await this.atomic(() => {
      const composite = idempotencyKey(sessionId, route, key);
      const existing = this.idempotency.get(composite);
      if (
        existing?.requestHash === requestHash &&
        existing.responseStatus === null
      ) {
        this.idempotency.delete(composite);
      }
    });
  }

  async consumeRateLimit(input: {
    sessionId: string;
    action: string;
    now: Date;
    limit: number;
    windowMs: number;
  }): Promise<RateLimitResult> {
    return this.atomic(() => {
      const windowStartMs =
        Math.floor(input.now.getTime() / input.windowMs) * input.windowMs;
      const key = `${input.sessionId}\u0000${input.action}\u0000${windowStartMs}`;
      const resetAt = new Date(windowStartMs + input.windowMs);
      const bucket = this.rateBuckets.get(key) ?? {
        sessionId: input.sessionId,
        action: input.action,
        count: 0,
        windowStart: new Date(windowStartMs),
        expiresAt: resetAt,
      };
      bucket.count += 1;
      this.rateBuckets.set(key, bucket);
      return {
        allowed: bucket.count <= input.limit,
        count: bucket.count,
        limit: input.limit,
        remaining: Math.max(0, input.limit - bucket.count),
        resetAt,
      };
    });
  }

  async consumeGlobalRateLimit(input: {
    scope: string;
    now: Date;
    limit: number;
    windowMs: number;
  }): Promise<RateLimitResult> {
    return this.atomic(() => {
      const windowStartMs =
        Math.floor(input.now.getTime() / input.windowMs) * input.windowMs;
      const key = `${input.scope}\u0000${windowStartMs}`;
      const resetAt = new Date(windowStartMs + input.windowMs);
      const bucket = this.globalRateBuckets.get(key) ?? {
        scope: input.scope,
        count: 0,
        windowStart: new Date(windowStartMs),
        expiresAt: resetAt,
      };
      bucket.count += 1;
      this.globalRateBuckets.set(key, bucket);
      return {
        allowed: bucket.count <= input.limit,
        count: bucket.count,
        limit: input.limit,
        remaining: Math.max(0, input.limit - bucket.count),
        resetAt,
      };
    });
  }

  async enqueueJob(job: NewJob): Promise<void> {
    await this.atomic(() => {
      if (this.jobs.has(job.id)) {
        throw new PlatformError("JOB_EXISTS", "Job already exists.", 409);
      }
      this.jobs.set(job.id, {
        ...clone(job),
        status: "queued",
        progress: null,
        attempts: 0,
        lockedAt: null,
        lockedBy: null,
        completedAt: null,
        errorCode: null,
      });
    });
  }

  async getJob(id: string): Promise<JobRecord | null> {
    return this.atomic(() => {
      const job = this.jobs.get(id);
      return job ? clone(job) : null;
    });
  }

  async claimNextJob(input: {
    workerId: string;
    now: Date;
    staleAfterMs: number;
    types?: string[];
  }): Promise<JobRecord | null> {
    return this.atomic(() => {
      const staleBefore = input.now.getTime() - input.staleAfterMs;
      const candidate = [...this.jobs.values()]
        .filter(
          (job) =>
            job.expiresAt.getTime() > input.now.getTime() &&
            job.availableAt.getTime() <= input.now.getTime() &&
            (!input.types || input.types.includes(job.type)) &&
            (job.status === "queued" ||
              (job.status === "running" &&
                job.lockedAt !== null &&
                job.lockedAt.getTime() <= staleBefore)),
        )
        .sort(
          (left, right) =>
            left.availableAt.getTime() - right.availableAt.getTime() ||
            left.createdAt.getTime() - right.createdAt.getTime() ||
            left.id.localeCompare(right.id),
        )[0];
      if (!candidate) return null;

      candidate.status = "running";
      candidate.lockedAt = new Date(input.now);
      candidate.lockedBy = input.workerId;
      candidate.attempts += 1;
      candidate.errorCode = null;
      return clone(candidate);
    });
  }

  async completeJob(
    id: string,
    workerId: string,
    input: { now: Date; progress?: JsonValue },
  ): Promise<void> {
    await this.atomic(() => {
      const job = this.requireRunningJob(id, workerId);
      job.status = "completed";
      job.progress = clone(input.progress ?? job.progress);
      job.completedAt = new Date(input.now);
      job.lockedAt = null;
      job.lockedBy = null;
    });
  }

  async failJob(
    id: string,
    workerId: string,
    input: {
      now: Date;
      errorCode: string;
      retryAt?: Date;
      progress?: JsonValue;
    },
  ): Promise<void> {
    await this.atomic(() => {
      const job = this.requireRunningJob(id, workerId);
      job.progress = clone(input.progress ?? job.progress);
      job.errorCode = input.errorCode;
      job.lockedAt = null;
      job.lockedBy = null;
      if (input.retryAt && input.retryAt.getTime() < job.expiresAt.getTime()) {
        job.status = "queued";
        job.availableAt = new Date(input.retryAt);
      } else {
        job.status = "failed";
        job.completedAt = new Date(input.now);
      }
    });
  }

  private requireRunningJob(id: string, workerId: string): JobRecord {
    const job = this.jobs.get(id);
    if (!job || job.status !== "running" || job.lockedBy !== workerId) {
      throw new PlatformError(
        "JOB_LOCK_LOST",
        "The worker does not hold this job lock.",
        409,
      );
    }
    return job;
  }

  async appendAuditEvent(event: AuditEventRecord): Promise<void> {
    await this.atomic(() => {
      if (this.auditEvents.has(event.id)) {
        throw new PlatformError("AUDIT_EVENT_EXISTS", "Audit event exists.", 409);
      }
      this.auditEvents.set(event.id, {
        ...clone(event),
        metadata: sanitizeAuditMetadata(event.metadata),
      });
    });
  }

  async cleanupExpired(now: Date): Promise<CleanupResult> {
    return this.atomic(() => {
      const expiredSessionIds = new Set(
        [...this.sessions.values()]
          .filter((session) => session.expiresAt.getTime() <= now.getTime())
          .map((session) => session.id),
      );
      const counts = {
        sessionsDeleted: expiredSessionIds.size,
        jobsDeleted: [...this.jobs.values()].filter(
          (job) =>
            expiredSessionIds.has(job.sessionId) ||
            job.expiresAt.getTime() <= now.getTime(),
        ).length,
        idempotencyKeysDeleted: [...this.idempotency.values()].filter(
          (record) =>
            expiredSessionIds.has(record.sessionId) ||
            record.expiresAt.getTime() <= now.getTime(),
        ).length,
        auditEventsDeleted: [...this.auditEvents.values()].filter((event) =>
          expiredSessionIds.has(event.sessionId),
        ).length,
        rateLimitBucketsDeleted: [...this.rateBuckets.values()].filter(
          (bucket) =>
            expiredSessionIds.has(bucket.sessionId) ||
            bucket.expiresAt.getTime() <= now.getTime(),
        ).length + [...this.globalRateBuckets.values()].filter(
          (bucket) => bucket.expiresAt.getTime() <= now.getTime(),
        ).length,
      };

      for (const id of expiredSessionIds) this.sessions.delete(id);
      for (const [key, record] of this.jobs) {
        if (
          expiredSessionIds.has(record.sessionId) ||
          record.expiresAt.getTime() <= now.getTime()
        ) {
          this.jobs.delete(key);
        }
      }
      for (const [key, record] of this.idempotency) {
        if (
          expiredSessionIds.has(record.sessionId) ||
          record.expiresAt.getTime() <= now.getTime()
        ) {
          this.idempotency.delete(key);
        }
      }
      for (const [key, event] of this.auditEvents) {
        if (expiredSessionIds.has(event.sessionId)) this.auditEvents.delete(key);
      }
      for (const [key, bucket] of this.rateBuckets) {
        if (
          expiredSessionIds.has(bucket.sessionId) ||
          bucket.expiresAt.getTime() <= now.getTime()
        ) {
          this.rateBuckets.delete(key);
        }
      }
      for (const [key, bucket] of this.globalRateBuckets) {
        if (bucket.expiresAt.getTime() <= now.getTime()) {
          this.globalRateBuckets.delete(key);
        }
      }
      return counts;
    });
  }
}
