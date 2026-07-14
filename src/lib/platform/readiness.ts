import postgres from "postgres";

export type SchemaReadiness = "not_required" | "ready" | "missing" | "unavailable";

export interface ReadinessResult {
  ready: boolean;
  storage: "ephemeral" | "postgres";
  schema: SchemaReadiness;
  appliedMigrations: number | null;
}

interface SchemaInspection {
  sessions: boolean;
  jobs: boolean;
  idempotencyKeys: boolean;
  globalRateLimitBuckets: boolean;
  labRuntimeRecords: boolean;
  appliedMigrations: number;
}

type SchemaInspector = (databaseUrl: string) => Promise<SchemaInspection>;

async function inspectPostgres(databaseUrl: string): Promise<SchemaInspection> {
  const sql = postgres(databaseUrl, {
    max: 1,
    idle_timeout: 2,
    connect_timeout: 5,
  });

  try {
    const [tables] = await sql<{
      sessions: string | null;
      jobs: string | null;
      idempotency_keys: string | null;
      global_rate_limit_buckets: string | null;
      lab_runtime_records: string | null;
      migrations: string | null;
    }[]>`
      select
        to_regclass('public.sessions')::text as sessions,
        to_regclass('public.jobs')::text as jobs,
        to_regclass('public.idempotency_keys')::text as idempotency_keys,
        to_regclass('public.global_rate_limit_buckets')::text as global_rate_limit_buckets,
        to_regclass('public.lab_runtime_records')::text as lab_runtime_records,
        to_regclass('public.retryproof_schema_migrations')::text as migrations
    `;

    let appliedMigrations = 0;
    if (tables?.migrations) {
      const [count] = await sql<{ count: number }[]>`
        select count(*)::integer as count from retryproof_schema_migrations
      `;
      appliedMigrations = count?.count ?? 0;
    }

    return {
      sessions: Boolean(tables?.sessions),
      jobs: Boolean(tables?.jobs),
      idempotencyKeys: Boolean(tables?.idempotency_keys),
      globalRateLimitBuckets: Boolean(tables?.global_rate_limit_buckets),
      labRuntimeRecords: Boolean(tables?.lab_runtime_records),
      appliedMigrations,
    };
  } finally {
    await sql.end({ timeout: 1 });
  }
}

export async function checkReadiness(
  options: {
    databaseUrl?: string;
    inspect?: SchemaInspector;
  } = {},
): Promise<ReadinessResult> {
  const databaseUrl = options.databaseUrl ?? process.env.DATABASE_URL;
  if (!databaseUrl) {
    return {
      ready: true,
      storage: "ephemeral",
      schema: "not_required",
      appliedMigrations: null,
    };
  }

  try {
    const inspection = await (options.inspect ?? inspectPostgres)(databaseUrl);
    const ready = inspection.sessions
      && inspection.jobs
      && inspection.idempotencyKeys
      && inspection.globalRateLimitBuckets
      && inspection.labRuntimeRecords
      && inspection.appliedMigrations >= 3;
    return {
      ready,
      storage: "postgres",
      schema: ready ? "ready" : "missing",
      appliedMigrations: inspection.appliedMigrations,
    };
  } catch {
    return {
      ready: false,
      storage: "postgres",
      schema: "unavailable",
      appliedMigrations: null,
    };
  }
}
