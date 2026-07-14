import type { Store } from "./store";
import type { CleanupResult } from "./types";

export function cleanupExpired(
  store: Store,
  now = new Date(),
): Promise<CleanupResult> {
  return store.cleanupExpired(now);
}
