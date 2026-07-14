import { PlatformError } from "./errors";
import type { OwnedResource } from "./types";

export function requireOwnedResource<T extends OwnedResource>(
  sessionId: string,
  resource: T | null | undefined,
): T {
  if (!resource) {
    throw new PlatformError("RESOURCE_NOT_FOUND", "Resource was not found.", 404);
  }
  if (resource.sessionId !== sessionId) {
    throw new PlatformError(
      "RESOURCE_NOT_OWNED",
      "The current session does not own this resource.",
      403,
    );
  }
  return resource;
}

export function assertSessionOwns(
  sessionId: string,
  resource: OwnedResource | null | undefined,
): asserts resource is OwnedResource {
  requireOwnedResource(sessionId, resource);
}
