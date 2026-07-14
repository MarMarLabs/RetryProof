import postgres, { type Sql } from "postgres";

import type { LabRecord, LabRecordKind } from "./types";

export interface LabRepository {
  put(record: LabRecord): Promise<void>;
  get<T extends LabRecord>(kind: T["kind"], id: string): Promise<T | null>;
  findByParent<T extends LabRecord>(
    kind: T["kind"],
    sessionId: string,
    parentId: string,
  ): Promise<T[]>;
  deleteSession(sessionId: string): Promise<number>;
}

export class MemoryLabRepository implements LabRepository {
  private readonly records = new Map<string, LabRecord>();

  async put(record: LabRecord): Promise<void> {
    this.records.set(`${record.kind}:${record.id}`, structuredClone(record));
  }

  async get<T extends LabRecord>(kind: T["kind"], id: string): Promise<T | null> {
    const record = this.records.get(`${kind}:${id}`);
    return record ? (structuredClone(record) as T) : null;
  }

  async findByParent<T extends LabRecord>(
    kind: T["kind"],
    sessionId: string,
    parentId: string,
  ): Promise<T[]> {
    return [...this.records.values()]
      .filter(
        (record) =>
          record.kind === kind &&
          record.sessionId === sessionId &&
          recordParentId(record) === parentId,
      )
      .map((record) => structuredClone(record) as T);
  }

  async deleteSession(sessionId: string): Promise<number> {
    let deleted = 0;
    for (const [key, record] of this.records) {
      if (record.sessionId === sessionId) {
        this.records.delete(key);
        deleted += 1;
      }
    }
    return deleted;
  }
}

function recordParentId(record: LabRecord): string | null {
  if (record.kind === "analysis") return record.workflowId;
  if (record.kind === "scenario_set" || record.kind === "execution" || record.kind === "repair") {
    return record.analysisId;
  }
  if (record.kind === "artifact") return record.repairId;
  return null;
}

export class PostgresLabRepository implements LabRepository {
  constructor(private readonly sql: Sql) {}

  async put(record: LabRecord): Promise<void> {
    const parentId = recordParentId(record);
    await this.sql`
      insert into lab_runtime_records
        (id, session_id, kind, parent_id, payload, created_at, expires_at)
      values (
        ${record.id}::uuid,
        ${record.sessionId}::uuid,
        ${record.kind},
        ${parentId}::uuid,
        ${this.sql.json(record as never)},
        ${record.createdAt}::timestamptz,
        ${record.expiresAt}::timestamptz
      )
      on conflict (id) do update set
        payload = excluded.payload,
        parent_id = excluded.parent_id,
        expires_at = excluded.expires_at
    `;
  }

  async get<T extends LabRecord>(kind: T["kind"], id: string): Promise<T | null> {
    const rows = await this.sql<{ payload: T }[]>`
      select payload
      from lab_runtime_records
      where id = ${id}::uuid and kind = ${kind} and expires_at > now()
      limit 1
    `;
    return rows[0]?.payload ?? null;
  }

  async findByParent<T extends LabRecord>(
    kind: T["kind"],
    sessionId: string,
    parentId: string,
  ): Promise<T[]> {
    const rows = await this.sql<{ payload: T }[]>`
      select payload
      from lab_runtime_records
      where kind = ${kind}
        and session_id = ${sessionId}::uuid
        and parent_id = ${parentId}::uuid
        and expires_at > now()
      order by created_at asc
    `;
    return rows.map((row) => row.payload);
  }

  async deleteSession(sessionId: string): Promise<number> {
    const rows = await this.sql<{ id: string }[]>`
      delete from lab_runtime_records
      where session_id = ${sessionId}::uuid
      returning id
    `;
    return rows.length;
  }
}

const globalLab = globalThis as typeof globalThis & {
  __retryProofLabRepository?: LabRepository;
  __retryProofLabSql?: Sql;
};

export function getLabRepository(): LabRepository {
  if (globalLab.__retryProofLabRepository) return globalLab.__retryProofLabRepository;
  if (!process.env.DATABASE_URL) {
    globalLab.__retryProofLabRepository = new MemoryLabRepository();
    return globalLab.__retryProofLabRepository;
  }
  globalLab.__retryProofLabSql = postgres(process.env.DATABASE_URL, {
    max: Number(process.env.DATABASE_POOL_SIZE ?? 10),
    idle_timeout: 20,
    connect_timeout: 10,
  });
  globalLab.__retryProofLabRepository = new PostgresLabRepository(globalLab.__retryProofLabSql);
  return globalLab.__retryProofLabRepository;
}

export function setLabRepositoryForTests(repository: LabRepository | undefined): void {
  globalLab.__retryProofLabRepository = repository;
}

export function isLabRecordKind(value: string): value is LabRecordKind {
  return ["workflow", "analysis", "scenario_set", "execution", "repair", "artifact"].includes(value);
}
