import {
  createLabService,
  jsonResponse,
  LabHttpError,
  parseJsonObject,
  publicExecution,
  requireCsrf,
  requireLabSession,
  routeError,
} from "@/lib/lab";
import { getStore, runIdempotent, type JsonValue } from "@/lib/platform";

export const runtime = "nodejs";

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  try {
    const session = await requireLabSession(request);
    requireCsrf(request, session.sessionId);
    const { id } = await context.params;
    const body = await parseJsonObject(request);
    const phase = body.phase;
    if (phase !== "before" && phase !== "after") {
      throw new LabHttpError("INVALID_PHASE", "Execution phase must be 'before' or 'after'.", 400);
    }
    const key = request.headers.get("idempotency-key");
    if (!key) throw new LabHttpError("IDEMPOTENCY_KEY_REQUIRED", "Idempotency-Key is required.", 400);
    const repairId = typeof body.repairId === "string" ? body.repairId : undefined;
    const result = await runIdempotent(
      getStore(),
      {
        sessionId: session.sessionId,
        route: `/api/v1/analyses/${id}/executions`,
        key,
        request: {
          phase,
          seed: typeof body.seed === "string" ? body.seed : null,
          repairId: repairId ?? null,
        },
      },
      async () => {
        const execution = await createLabService().execute({
          sessionId: session.sessionId,
          analysisId: id,
          phase,
          repairId,
          seed: typeof body.seed === "string" ? body.seed : undefined,
        });
        return {
          status: 201,
          body: { execution: publicExecution(execution) } as unknown as JsonValue,
        };
      },
    );
    return jsonResponse(result.body, result.status, {
      "idempotency-replayed": String(result.replayed),
    });
  } catch (error) {
    return routeError(error);
  }
}
