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

export type IdempotencyStart =
  | { state: "acquired" }
  | { state: "in_progress" }
  | { state: "conflict" }
  | {
      state: "replay";
      responseStatus: number;
      responseBody: JsonValue | null;
    };

export interface Store {
  createSession(session: SessionRecord): Promise<void>;
  getSession(id: string): Promise<SessionRecord | null>;
  deleteSession(id: string): Promise<boolean>;

  beginIdempotentRequest(record: IdempotencyRecord): Promise<IdempotencyStart>;
  completeIdempotentRequest(
    sessionId: string,
    route: string,
    key: string,
    requestHash: string,
    responseStatus: number,
    responseBody: JsonValue | null,
  ): Promise<void>;
  abandonIdempotentRequest(
    sessionId: string,
    route: string,
    key: string,
    requestHash: string,
  ): Promise<void>;

  consumeRateLimit(input: {
    sessionId: string;
    action: string;
    now: Date;
    limit: number;
    windowMs: number;
  }): Promise<RateLimitResult>;
  consumeGlobalRateLimit(input: {
    scope: string;
    now: Date;
    limit: number;
    windowMs: number;
  }): Promise<RateLimitResult>;

  enqueueJob(job: NewJob): Promise<void>;
  getJob(id: string): Promise<JobRecord | null>;
  claimNextJob(input: {
    workerId: string;
    now: Date;
    staleAfterMs: number;
    types?: string[];
  }): Promise<JobRecord | null>;
  completeJob(
    id: string,
    workerId: string,
    input: { now: Date; progress?: JsonValue },
  ): Promise<void>;
  failJob(
    id: string,
    workerId: string,
    input: {
      now: Date;
      errorCode: string;
      retryAt?: Date;
      progress?: JsonValue;
    },
  ): Promise<void>;

  appendAuditEvent(event: AuditEventRecord): Promise<void>;
  cleanupExpired(now: Date): Promise<CleanupResult>;
}
