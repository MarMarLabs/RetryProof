import postgres from "postgres";

import { PostgresStore } from "../src/lib/platform/postgres-store";

const databaseUrl = process.env.DATABASE_URL;

async function main(): Promise<void> {
  if (!databaseUrl) {
    console.log(
      JSON.stringify({
        status: "skipped",
        reason: "DATABASE_URL is not set; the local ephemeral store has no cross-process records to clean.",
      }),
    );
    return;
  }

  const sql = postgres(databaseUrl, {
    max: 1,
    idle_timeout: 5,
    connect_timeout: 10,
  });
  try {
    const result = await new PostgresStore(sql).cleanupExpired(new Date());
    console.log(JSON.stringify({ status: "complete", ...result }, null, 2));
  } finally {
    await sql.end({ timeout: 5 });
  }
}

void main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "Cleanup failed");
  process.exitCode = 1;
});
