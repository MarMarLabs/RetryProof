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
    const analysis = await createLabService().analyzeWorkflow({
      sessionId: session.sessionId,
      workflowId: id,
      mode: body.mode === "live" ? "live" : "cached",
      invariantHint: typeof body.invariantHint === "string" ? body.invariantHint : undefined,
    });
    const response = jsonResponse({ analysis }, 201);
    response.headers.set("etag", `"${analysis.planHash}"`);
    return response;
  } catch (error) {
    return routeError(error);
  }
}
