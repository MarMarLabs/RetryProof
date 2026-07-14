import postgres from "postgres";

import { InMemoryStore } from "./memory-store";
import { PostgresStore } from "./postgres-store";
import type { Store } from "./store";

const globalStore = globalThis as typeof globalThis & {
  __retryProofStore?: Store;
};

export function getStore(options: { forceMemory?: boolean } = {}): Store {
  if (options.forceMemory) return new InMemoryStore();
  if (globalStore.__retryProofStore) return globalStore.__retryProofStore;

  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    globalStore.__retryProofStore = new InMemoryStore();
    return globalStore.__retryProofStore;
  }

  const configuredPoolSize = Number(process.env.DATABASE_POOL_SIZE ?? 10);
  const poolSize = Number.isInteger(configuredPoolSize) && configuredPoolSize > 0
    ? configuredPoolSize
    : 10;
  const sql = postgres(databaseUrl, {
    max: poolSize,
    idle_timeout: 20,
    connect_timeout: 10,
  });
  globalStore.__retryProofStore = new PostgresStore(sql);
  return globalStore.__retryProofStore;
}

export function setStoreForTests(store: Store | undefined): void {
  globalStore.__retryProofStore = store;
}
