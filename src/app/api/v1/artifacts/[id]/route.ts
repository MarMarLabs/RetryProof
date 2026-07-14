import {
  createLabService,
  jsonResponse,
  publicArtifact,
  requireLabSession,
  routeError,
} from "@/lib/lab";

export const runtime = "nodejs";

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  try {
    const session = await requireLabSession(request);
    const { id } = await context.params;
    const artifact = await createLabService().getArtifact(session.sessionId, id);
    return jsonResponse({ artifact: publicArtifact(artifact) }, 200, {
      etag: `"${artifact.sha256}"`,
      "cache-control": "private, no-store",
    });
  } catch (error) {
    return routeError(error);
  }
}
