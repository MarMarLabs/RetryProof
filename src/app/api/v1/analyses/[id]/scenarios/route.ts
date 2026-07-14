import {
  createLabService,
  jsonResponse,
  parseJsonObject,
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
    const scenarioIds = Array.isArray(body.scenarioIds)
      ? body.scenarioIds.filter((value): value is string => typeof value === "string")
      : undefined;
    const scenarios = await createLabService().defineScenarios({
      sessionId: session.sessionId,
      analysisId: id,
      scenarioIds,
    });
    return jsonResponse({ scenarios }, 201);
  } catch (error) {
    return routeError(error);
  }
}
