import { jsonResponse, requireLabSession, routeError } from "@/lib/lab";
import { getStore, requireOwnedResource } from "@/lib/platform";

export const runtime = "nodejs";

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  try {
    const session = await requireLabSession(request);
    const { id } = await context.params;
    const job = requireOwnedResource(session.sessionId, await getStore().getJob(id));
    return jsonResponse({
      job: {
        id: job.id,
        type: job.type,
        status: job.status,
        progress: job.progress,
        attempts: job.attempts,
        errorCode: job.errorCode,
      },
    });
  } catch (error) {
    return routeError(error);
  }
}
