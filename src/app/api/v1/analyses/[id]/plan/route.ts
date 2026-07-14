import {
  createLabService,
  jsonResponse,
  parseJsonObject,
  requireCsrf,
  requireLabSession,
  routeError,
  type ApprovedPlan,
} from "@/lib/lab";

export const runtime = "nodejs";

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  try {
    const session = await requireLabSession(request);
    requireCsrf(request, session.sessionId);
    const { id } = await context.params;
    const body = await parseJsonObject(request);
    const approvedPlan = (body.approvedPlan ?? body) as Partial<ApprovedPlan> & { approved?: boolean };
    const analysis = await createLabService().approvePlan({
      sessionId: session.sessionId,
      analysisId: id,
      ifMatch: request.headers.get("if-match"),
      approvedPlan,
    });
    const response = jsonResponse({ analysis });
    response.headers.set("etag", `"${analysis.planHash}"`);
    return response;
  } catch (error) {
    return routeError(error);
  }
}
