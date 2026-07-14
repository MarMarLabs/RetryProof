import { randomUUID } from "node:crypto";

import { ZodError } from "zod";

import { N8nIngestionError } from "@/lib/n8n";
import { PlatformError } from "@/lib/platform";

import { LabHttpError } from "./session";

const DEFAULT_JSON_BODY_BYTES = 64 * 1024;
const PUBLIC_SECRET_FRAGMENTS = [
  /sk-(?:proj-)?[A-Za-z0-9_-]{16,}/gi,
  /(?:gh[pousr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,})/g,
  /AKIA[0-9A-Z]{16}/g,
  /[A-Za-z0-9_-]{12,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}/g,
  /:\/\/[^/\s:@]+:[^@\s/]+@/g,
];

function redactPublicDetails(value: unknown): unknown {
  if (typeof value === "string") {
    return PUBLIC_SECRET_FRAGMENTS.reduce(
      (result, pattern) => result.replace(pattern, "[redacted]"),
      value,
    );
  }
  if (Array.isArray(value)) return value.map(redactPublicDetails);
  if (value === null || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).map(([key, child]) => [
      key,
      redactPublicDetails(child),
    ]),
  );
}

export function jsonResponse(body: unknown, status = 200, headers?: HeadersInit): Response {
  return Response.json(body, { status, headers });
}

export function withSessionCookie(response: Response, setCookie: string | null): Response {
  if (setCookie) response.headers.append("set-cookie", setCookie);
  return response;
}

export function publicExecution(execution: {
  id: string;
  analysisId: string;
  phase: "before" | "after";
  repairId?: string;
  workflowHash: string;
  fixtureHash: string;
  scenarios: unknown;
  suite: unknown;
}) {
  return {
    id: execution.id,
    analysisId: execution.analysisId,
    phase: execution.phase,
    ...(execution.repairId ? { repairId: execution.repairId } : {}),
    workflowHash: execution.workflowHash,
    fixtureHash: execution.fixtureHash,
    scenarios: execution.scenarios,
    suite: execution.suite,
  };
}

export function publicArtifact(artifact: {
  id: string;
  analysisId: string;
  repairId: string;
  sha256: string;
  receipt: unknown;
}) {
  return {
    id: artifact.id,
    analysisId: artifact.analysisId,
    repairId: artifact.repairId,
    sha256: artifact.sha256,
    receipt: artifact.receipt,
  };
}

export function routeError(error: unknown): Response {
  const requestId = `req_${randomUUID()}`;
  if (error instanceof LabHttpError) {
    return jsonResponse(
      { error: { code: error.code, message: error.message, details: redactPublicDetails(error.details), requestId } },
      error.status,
    );
  }
  if (error instanceof N8nIngestionError) {
    const status = error.code === "UPLOAD_TOO_LARGE" ? 413 : 422;
    return jsonResponse(
      { error: { code: error.code, message: error.message, details: redactPublicDetails(error.details), requestId } },
      status,
    );
  }
  if (error instanceof PlatformError) {
    const response = jsonResponse(
      { error: { code: error.code, message: error.message, requestId } },
      error.status,
    );
    if (error.retryAfterSeconds) {
      response.headers.set("retry-after", String(error.retryAfterSeconds));
    }
    return response;
  }
  if (error instanceof ZodError) {
    return jsonResponse(
      {
        error: {
          code: "INVALID_REQUEST",
          message: "The request does not match the expected shape.",
          details: redactPublicDetails({
            jsonPaths: error.issues.map((issue) => `$.${issue.path.join(".")}`),
          }),
          requestId,
        },
      },
      400,
    );
  }
  return jsonResponse(
    {
      error: {
        code: "INTERNAL_ERROR",
        message: "RetryProof could not complete the request.",
        requestId,
      },
    },
    500,
  );
}

export async function readRequestBytes(
  request: Request,
  maxBytes: number,
): Promise<Uint8Array> {
  const declaredLength = Number(request.headers.get("content-length") ?? 0);
  if (Number.isFinite(declaredLength) && declaredLength > maxBytes) {
    throw new LabHttpError("UPLOAD_TOO_LARGE", "Request body exceeds the allowed size.", 413, {
      limit: maxBytes,
    });
  }
  if (!request.body) return new Uint8Array();

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel("RetryProof request body limit exceeded");
      throw new LabHttpError("UPLOAD_TOO_LARGE", "Request body exceeds the allowed size.", 413, {
        limit: maxBytes,
      });
    }
    chunks.push(value);
  }

  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
}

export async function parseJsonObject(
  request: Request,
  maxBytes = DEFAULT_JSON_BODY_BYTES,
): Promise<Record<string, unknown>> {
  let value: unknown;
  try {
    const bytes = await readRequestBytes(request, maxBytes);
    value = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)) as unknown;
  } catch (error) {
    if (error instanceof LabHttpError) throw error;
    throw new LabHttpError("INVALID_JSON", "The request body must be valid JSON.", 400);
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new LabHttpError("INVALID_REQUEST", "The request body must be a JSON object.", 400);
  }
  return value as Record<string, unknown>;
}
