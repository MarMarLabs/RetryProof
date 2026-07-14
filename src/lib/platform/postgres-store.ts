import type { Sql } from "postgres";

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

type Row = Record<string, unknown>;

const asDate = (value: unknown): Date =>
  value instanceof Date ? value : new Date(String(value));
const asJson = (value: unknown): JsonValue | null =>
  value === undefined || value === null ? null : (value as JsonValue);

function mapSession(row: Row): SessionRecord {
  return {
    id: String(row.id),
    createdAt: asDate(row.created_at),
    expiresAt: asDate(row.expires_at),
    demoSeed: Boolean(row.demo_seed),
  };
}

function mapJob(row: Row): JobRecord {
  return {
    id: String(row.id),
    sessionId: String(row.session_id),
    type: String(row.job_type),
    status: row.status as JobRecord["status"],
    payload: asJson(row.payload) ?? {},
    progress: asJson(row.progress),
    attempts: Number(row.attempts),
    availableAt: asDate(row.available_at),
    lockedAt: row.locked_at ? asDate(row.locked_at) : null,
    lockedBy: row.locked_by ? String(row.locked_by) : null,
    completedAt: row.completed_at ? asDate(row.completed_at) : null,
    errorCode: row.error_code ? String(row.error_code) : null,
    createdAt: asDate(row.created_at),
    expiresAt: asDate(row.expires_at),
  };
}

export class PostgresStore implements Store {
  constructor(private readonly sql: Sql) {}

  async createSession(session: SessionRecord): Promise<void> {
    await this.sql.unsafe(
      `insert into sessions (id, created_at, expires_at, demo_seed)
       values ($1::uuid, $2::timestamptz, $3::timestamptz, $4::boolean)`,
      [session.id, session.createdAt, session.expiresAt, session.demoSeed],
    );
  }

  async getSession(id: string): Promise<SessionRecord | null> {
    const rows = await this.sql.unsafe<Row[]>(
      `select id, created_at, expires_at, demo_seed
       from sessions where id = $1::uuid limit 1`,
      [id],
    );
    return rows[0] ? mapSession(rows[0]) : null;
  }

  async deleteSession(id: string): Promise<boolean> {
    const rows = await this.sql.unsafe<Row[]>(
      `delete from sessions where id = $1::uuid returning id`,
      [id],
    );
    return rows.length > 0;
  }

  async beginIdempotentRequest(
    record: IdempotencyRecord,
  ): Promise<IdempotencyStart> {
    return this.sql.begin(async (transaction) => {
      const inserted = await transaction.unsafe<Row[]>(
        `insert into idempotency_keys
           (session_id, route, key, request_hash, response_status, response_body, created_at, expires_at)
         values ($1::uuid, $2, $3, $4, null, null, $5::timestamptz, $6::timestamptz)
         on conflict (session_id, route, key) do nothing
         returning key`,
        [
          record.sessionId,
          record.route,
          record.key,
          record.requestHash,
          record.createdAt,
          record.expiresAt,
        ],
      );
      if (inserted.length > 0) return { state: "acquired" } as const;

      const rows = await transaction.unsafe<Row[]>(
        `select request_hash, response_status, response_body, expires_at
         from idempotency_keys
         where session_id = $1::uuid and route = $2 and key = $3
         for update`,
        [record.sessionId, record.route, record.key],
      );
      const existing = rows[0];
      if (!existing) {
        throw new PlatformError(
          "IDEMPOTENCY_LOST",
          "The idempotency reservation could not be read.",
          409,
        );
      }
      if (asDate(existing.expires_at).getTime() <= record.createdAt.getTime()) {
        await transaction.unsafe(
          `update idempotency_keys
           set request_hash = $4, response_status = null, response_body = null,
               created_at = $5::timestamptz, expires_at = $6::timestamptz
           where session_id = $1::uuid and route = $2 and key = $3`,
          [
            record.sessionId,
            record.route,
            record.key,
            record.requestHash,
            record.createdAt,
            record.expiresAt,
          ],
        );
        return { state: "acquired" } as const;
      }
      if (String(existing.request_hash) !== record.requestHash) {
        return { state: "conflict" } as const;
      }
      if (existing.response_status === null) return { state: "in_progress" } as const;
      return {
        state: "replay",
        responseStatus: Number(existing.response_status),
        responseBody: asJson(existing.response_body),
      } as const;
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
    const rows = await this.sql.unsafe<Row[]>(
      `update idempotency_keys
       set response_status = $5, response_body = $6::jsonb
       where session_id = $1::uuid and route = $2 and key = $3
         and request_hash = $4 and response_status is null
       returning key`,
      [
        sessionId,
        route,
        key,
        requestHash,
        responseStatus,
        JSON.stringify(responseBody),
      ],
    );
    if (rows.length === 0) {
      throw new PlatformError(
        "IDEMPOTENCY_LOST",
        "The idempotency reservation no longer exists.",
        409,
      );
    }
  }

  async abandonIdempotentRequest(
    sessionId: string,
    route: string,
    key: string,
    requestHash: string,
  ): Promise<void> {
    await this.sql.unsafe(
      `delete from idempotency_keys
       where session_id = $1::uuid and route = $2 and key = $3
         and request_hash = $4 and response_status is null`,
      [sessionId, route, key, requestHash],
    );
  }

  async consumeRateLimit(input: {
    sessionId: string;
    action: string;
    now: Date;
    limit: number;
    windowMs: number;
  }): Promise<RateLimitResult> {
    const windowStartMs =
      Math.floor(input.now.getTime() / input.windowMs) * input.windowMs;
    const windowStart = new Date(windowStartMs);
    const resetAt = new Date(windowStartMs + input.windowMs);
    const rows = await this.sql.unsafe<Row[]>(
      `insert into rate_limit_buckets
         (session_id, action, window_start, count, expires_at)
       values ($1::uuid, $2, $3::timestamptz, 1, $4::timestamptz)
       on conflict (session_id, action, window_start)
       do update set count = rate_limit_buckets.count + 1
       returning count`,
      [input.sessionId, input.action, windowStart, resetAt],
    );
    const count = Number(rows[0]?.count ?? 1);
    return {
      allowed: count <= input.limit,
      count,
      limit: input.limit,
      remaining: Math.max(0, input.limit - count),
      resetAt,
    };
  }

  async consumeGlobalRateLimit(input: {
    scope: string;
    now: Date;
    limit: number;
    windowMs: number;
  }): Promise<RateLimitResult> {
    const windowStartMs =
      Math.floor(input.now.getTime() / input.windowMs) * input.windowMs;
    const windowStart = new Date(windowStartMs);
    const resetAt = new Date(windowStartMs + input.windowMs);
    const rows = await this.sql.unsafe<Row[]>(
      `insert into global_rate_limit_buckets
         (scope, window_start, count, expires_at)
       values ($1, $2::timestamptz, 1, $3::timestamptz)
       on conflict (scope, window_start)
       do update set count = global_rate_limit_buckets.count + 1
       returning count`,
      [input.scope, windowStart, resetAt],
    );
    const count = Number(rows[0]?.count ?? 1);
    return {
      allowed: count <= input.limit,
      count,
      limit: input.limit,
      remaining: Math.max(0, input.limit - count),
      resetAt,
    };
  }

  async enqueueJob(job: NewJob): Promise<void> {
    await this.sql.unsafe(
      `insert into jobs
         (id, session_id, job_type, status, payload, progress, attempts,
          available_at, locked_at, locked_by, completed_at, error_code,
          created_at, expires_at)
       values ($1::uuid, $2::uuid, $3, 'queued', $4::jsonb, null, 0,
               $5::timestamptz, null, null, null, null,
               $6::timestamptz, $7::timestamptz)`,
      [
        job.id,
        job.sessionId,
        job.type,
        JSON.stringify(job.payload),
        job.availableAt,
        job.createdAt,
        job.expiresAt,
      ],
    );
  }

  async getJob(id: string): Promise<JobRecord | null> {
    const rows = await this.sql.unsafe<Row[]>(
      `select * from jobs where id = $1::uuid limit 1`,
      [id],
    );
    return rows[0] ? mapJob(rows[0]) : null;
  }

  async claimNextJob(input: {
    workerId: string;
    now: Date;
    staleAfterMs: number;
    types?: string[];
  }): Promise<JobRecord | null> {
    const staleBefore = new Date(input.now.getTime() - input.staleAfterMs);
    const typeClause = input.types?.length
      ? `and job_type in (${input.types.map((_, index) => `$${index + 4}`).join(", ")})`
      : "";
    const parameters: (string | Date)[] = [
      input.now,
      staleBefore,
      input.workerId,
      ...(input.types ?? []),
    ];
    const rows = await this.sql.unsafe<Row[]>(
      `with candidate as (
         select id from jobs
         where expires_at > $1::timestamptz
           and available_at <= $1::timestamptz
           and (
             status = 'queued'
             or (status = 'running' and locked_at <= $2::timestamptz)
           )
           ${typeClause}
         order by available_at, created_at, id
         for update skip locked
         limit 1
       )
       update jobs
       set status = 'running', locked_at = $1::timestamptz, locked_by = $3,
           attempts = attempts + 1, error_code = null
       from candidate
       where jobs.id = candidate.id
       returning jobs.*`,
      parameters,
    );
    return rows[0] ? mapJob(rows[0]) : null;
  }

  async completeJob(
    id: string,
    workerId: string,
    input: { now: Date; progress?: JsonValue },
  ): Promise<void> {
    const rows = await this.sql.unsafe<Row[]>(
      `update jobs
       set status = 'completed', progress = coalesce($4::jsonb, progress),
           completed_at = $3::timestamptz, locked_at = null, locked_by = null
       where id = $1::uuid and status = 'running' and locked_by = $2
       returning id`,
      [
        id,
        workerId,
        input.now,
        input.progress === undefined ? null : JSON.stringify(input.progress),
      ],
    );
    this.assertLockUpdated(rows);
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
    const rows = await this.sql.unsafe<Row[]>(
      `update jobs
       set status = case
             when $5::timestamptz is not null and $5::timestamptz < expires_at
             then 'queued' else 'failed' end,
           available_at = coalesce($5::timestamptz, available_at),
           progress = coalesce($6::jsonb, progress), error_code = $4,
           completed_at = case
             when $5::timestamptz is not null and $5::timestamptz < expires_at
             then null else $3::timestamptz end,
           locked_at = null, locked_by = null
       where id = $1::uuid and status = 'running' and locked_by = $2
       returning id`,
      [
        id,
        workerId,
        input.now,
        input.errorCode,
        input.retryAt ?? null,
        input.progress === undefined ? null : JSON.stringify(input.progress),
      ],
    );
    this.assertLockUpdated(rows);
  }

  private assertLockUpdated(rows: Row[]): void {
    if (rows.length === 0) {
      throw new PlatformError(
        "JOB_LOCK_LOST",
        "The worker does not hold this job lock.",
        409,
      );
    }
  }

  async appendAuditEvent(event: AuditEventRecord): Promise<void> {
    const metadata = sanitizeAuditMetadata(event.metadata);
    await this.sql.unsafe(
      `insert into audit_events
         (id, session_id, workflow_id, event_type, request_id, metadata, created_at)
       values ($1::uuid, $2::uuid, $3::uuid, $4, $5, $6::jsonb, $7::timestamptz)`,
      [
        event.id,
        event.sessionId,
        event.workflowId ?? null,
        event.eventType,
        event.requestId,
        JSON.stringify(metadata),
        event.createdAt,
      ],
    );
  }

  async cleanupExpired(now: Date): Promise<CleanupResult> {
    return this.sql.begin(async (transaction) => {
      const counts = await transaction.unsafe<Row[]>(
        `select
           (select count(*) from sessions where expires_at <= $1::timestamptz)::int as sessions,
           (select count(*) from jobs where expires_at <= $1::timestamptz
             or session_id in (select id from sessions where expires_at <= $1::timestamptz))::int as jobs,
           (select count(*) from idempotency_keys where expires_at <= $1::timestamptz
             or session_id in (select id from sessions where expires_at <= $1::timestamptz))::int as idempotency,
           (select count(*) from audit_events where session_id in
             (select id from sessions where expires_at <= $1::timestamptz))::int as audit,
           ((select count(*) from rate_limit_buckets where expires_at <= $1::timestamptz
             or session_id in (select id from sessions where expires_at <= $1::timestamptz)) +
            (select count(*) from global_rate_limit_buckets where expires_at <= $1::timestamptz))::int as buckets`,
        [now],
      );
      await transaction.unsafe(
        `delete from jobs where expires_at <= $1::timestamptz`,
        [now],
      );
      await transaction.unsafe(
        `delete from idempotency_keys where expires_at <= $1::timestamptz`,
        [now],
      );
      await transaction.unsafe(
        `delete from rate_limit_buckets where expires_at <= $1::timestamptz`,
        [now],
      );
      await transaction.unsafe(
        `delete from global_rate_limit_buckets where expires_at <= $1::timestamptz`,
        [now],
      );
      await transaction.unsafe(
        `delete from sessions where expires_at <= $1::timestamptz`,
        [now],
      );
      const row = counts[0] ?? {};
      return {
        sessionsDeleted: Number(row.sessions ?? 0),
        jobsDeleted: Number(row.jobs ?? 0),
        idempotencyKeysDeleted: Number(row.idempotency ?? 0),
        auditEventsDeleted: Number(row.audit ?? 0),
        rateLimitBucketsDeleted: Number(row.buckets ?? 0),
      };
    });
  }
}
