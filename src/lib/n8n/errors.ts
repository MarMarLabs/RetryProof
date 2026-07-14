export type N8nIngestionErrorCode =
  | "UPLOAD_TOO_LARGE"
  | "INVALID_UTF8"
  | "INVALID_JSON"
  | "MAX_DEPTH_EXCEEDED"
  | "JSON_VALUE_LIMIT_EXCEEDED"
  | "DANGEROUS_PROPERTY"
  | "INVALID_WORKFLOW"
  | "GRAPH_TOO_LARGE"
  | "DUPLICATE_NODE_ID"
  | "DUPLICATE_NODE_NAME"
  | "GRAPH_REFERENCE_INVALID"
  | "INLINE_SECRET_DETECTED";

export type SafeErrorDetails = Readonly<{
  jsonPaths?: readonly string[];
  line?: number;
  column?: number;
  limit?: number;
}>;

/**
 * A deliberately value-free ingestion error. Details may contain locations and
 * limits, but never source fragments or secret values.
 */
export class N8nIngestionError extends Error {
  readonly code: N8nIngestionErrorCode;
  readonly details: SafeErrorDetails;

  constructor(
    code: N8nIngestionErrorCode,
    message: string,
    details: SafeErrorDetails = {},
  ) {
    super(message);
    this.name = "N8nIngestionError";
    this.code = code;
    this.details = details;
  }
}
