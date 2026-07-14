import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import postgres from "postgres";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  console.log(JSON.stringify({ status: "skipped", reason: "DATABASE_URL is not configured" }));
  process.exit(0);
}

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const migrationsDirectory = join(root, "database", "migrations");
const sql = postgres(databaseUrl, {
  max: 1,
  idle_timeout: 2,
  connect_timeout: 10,
  onnotice: () => {},
});
const lockId = 7_411_904_202_607_140;

try {
  await sql`select pg_advisory_lock(${lockId})`;
  await sql`
    create table if not exists retryproof_schema_migrations (
      filename text primary key,
      sha256 text not null check (sha256 ~ '^[0-9a-f]{64}$'),
      applied_at timestamptz not null default now()
    )
  `;

  const filenames = (await readdir(migrationsDirectory))
    .filter((filename) => /^\d+_[a-z0-9_]+\.sql$/.test(filename))
    .sort();
  const applied = [];
  const skipped = [];

  for (const filename of filenames) {
    const source = await readFile(join(migrationsDirectory, filename), "utf8");
    const sha256 = createHash("sha256").update(source).digest("hex");
    const [existing] = await sql`
      select sha256 from retryproof_schema_migrations where filename = ${filename}
    `;

    if (existing) {
      if (existing.sha256 !== sha256) {
        throw new Error(`Applied migration ${filename} has changed on disk.`);
      }
      skipped.push(filename);
      continue;
    }

    await sql.unsafe(source);
    await sql`
      insert into retryproof_schema_migrations (filename, sha256)
      values (${filename}, ${sha256})
    `;
    applied.push(filename);
  }

  console.log(JSON.stringify({ status: "ready", applied, skipped }));
} finally {
  try {
    await sql`select pg_advisory_unlock(${lockId})`;
  } finally {
    await sql.end({ timeout: 1 });
  }
}
