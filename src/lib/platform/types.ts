export type JsonPrimitive = string | number | boolean | null;
export type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue };
export type AuditMetadata = Record<string, JsonPrimitive>;

export interface SessionRecord {
  id: string;
  createdAt: Date;
  expiresAt: Date;
  demoSeed: boolean;
}

export interface OwnedResource {
  id: string;
  sessionId: string;
}

export type JobStatus = "queued" | "running" | "completed" | "failed";

export interface JobRecord extends OwnedResource {
  type: string;
  status: JobStatus;
  payload: JsonValue;
  progress: JsonValue | null;
  attempts: number;
  availableAt: Date;
  lockedAt: Date | null;
  lockedBy: string | null;
  completedAt: Date | null;
  errorCode: string | null;
  createdAt: Date;
  expiresAt: Date;
}

export interface NewJob extends OwnedResource {
  type: string;
  payload: JsonValue;
  availableAt: Date;
  createdAt: Date;
  expiresAt: Date;
}

export interface AuditEventRecord {
  id: string;
  sessionId: string;
  workflowId?: string;
  eventType: string;
  requestId: string;
  metadata: AuditMetadata;
  createdAt: Date;
}

export interface IdempotencyRecord {
  sessionId: string;
  route: string;
  key: string;
  requestHash: string;
  responseStatus: number | null;
  responseBody: JsonValue | null;
  createdAt: Date;
  expiresAt: Date;
}

export interface RateLimitResult {
  allowed: boolean;
  count: number;
  limit: number;
  remaining: number;
  resetAt: Date;
}

export interface CleanupResult {
  sessionsDeleted: number;
  jobsDeleted: number;
  idempotencyKeysDeleted: number;
  auditEventsDeleted: number;
  rateLimitBucketsDeleted: number;
}
