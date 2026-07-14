import {
  createLabService,
  jsonResponse,
  parseJsonObject,
  publicArtifact,
  publicExecution,
  requireCsrf,
  requireLabSession,
  routeError,
} from "@/lib/lab";

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
    const result = await createLabService().recheck({
      sessionId: session.sessionId,
      repairId: id,
      seed: typeof body.seed === "string" ? body.seed : undefined,
    });
    return jsonResponse(
      {
        execution: publicExecution(result.execution),
        artifact: publicArtifact(result.artifact),
      },
      201,
    );
  } catch (error) {
    return routeError(error);
  }
}
