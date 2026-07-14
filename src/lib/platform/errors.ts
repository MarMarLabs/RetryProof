export class PlatformError extends Error {
  readonly code: string;
  readonly status: number;
  readonly retryAfterSeconds?: number;

  constructor(
    code: string,
    message: string,
    status: number,
    options: { retryAfterSeconds?: number; cause?: unknown } = {},
  ) {
    super(message, { cause: options.cause });
    this.name = "PlatformError";
    this.code = code;
    this.status = status;
    this.retryAfterSeconds = options.retryAfterSeconds;
  }
}
