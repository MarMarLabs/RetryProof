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
    const repair = await createLabService().createRepair({
      sessionId: session.sessionId,
      analysisId: id,
      mode: body.mode === "live" ? "live" : "cached",
    });
    return jsonResponse({ repair }, 201);
  } catch (error) {
    return routeError(error);
  }
}
