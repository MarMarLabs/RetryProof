import {
  createLabService,
  establishLabSession,
  jsonResponse,
  requireCsrf,
  requireLabSession,
  routeError,
  sessionDeleteCookie,
  withSessionCookie,
} from "@/lib/lab";

export const runtime = "nodejs";

export async function GET(request: Request): Promise<Response> {
  try {
    const session = await establishLabSession(request);
    return withSessionCookie(
      jsonResponse(
        { session: { csrfToken: session.csrfToken, expiresInSeconds: 86_400 } },
        200,
        { "cache-control": "private, no-store", vary: "Cookie" },
      ),
      session.setCookie,
    );
  } catch (error) {
    return routeError(error);
  }
}

export async function DELETE(request: Request): Promise<Response> {
  try {
    const session = await requireLabSession(request);
    requireCsrf(request, session.sessionId);
    await createLabService().deleteSession(session.sessionId);
    return withSessionCookie(jsonResponse({ deleted: true }), sessionDeleteCookie());
  } catch (error) {
    return routeError(error);
  }
}
