import pino, { type DestinationStream } from "pino";

import { sanitizeAuditMetadata } from "./audit";

export interface SafeLogEvent {
  event: string;
  requestId?: string;
  jobId?: string;
  sessionHash?: string;
  workflowHash?: string;
  durationMs?: number;
  count?: number;
  errorCode?: string;
  cached?: boolean;
}

export interface SafeLogger {
  info(event: SafeLogEvent): void;
  warn(event: SafeLogEvent): void;
  error(event: SafeLogEvent): void;
}

export function createSafeLogger(destination?: DestinationStream): SafeLogger {
  const logger = pino(
    {
      base: undefined,
      redact: {
        paths: [
          "req.headers.authorization",
          "req.headers.cookie",
          "request.body",
          "response.body",
          "*.secret",
          "*.token",
          "*.password",
        ],
        censor: "[REDACTED]",
      },
    },
    destination,
  );

  const safe = (event: SafeLogEvent): SafeLogEvent => {
    sanitizeAuditMetadata(event as unknown as Record<string, unknown>);
    if (!event.event) throw new Error("Log events require an event name.");
    return event;
  };

  return {
    info: (event) => logger.info(safe(event)),
    warn: (event) => logger.warn(safe(event)),
    error: (event) => logger.error(safe(event)),
  };
}
