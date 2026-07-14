import {
  createLabService,
  jsonResponse,
  LabHttpError,
  parseJsonObject,
  readRequestBytes,
  requireCsrf,
  requireLabSession,
  routeError,
} from "@/lib/lab";
import { MAX_N8N_UPLOAD_BYTES } from "@/lib/n8n";

export const runtime = "nodejs";

const MAX_REQUEST_BYTES = MAX_N8N_UPLOAD_BYTES + 384 * 1024;

function parseFixture(source: string): unknown {
  try {
    return JSON.parse(source) as unknown;
  } catch {
    throw new LabHttpError("INVALID_FIXTURE_JSON", "Fixture must be valid JSON.", 400);
  }
}

export async function POST(request: Request): Promise<Response> {
  try {
    const session = await requireLabSession(request);
    requireCsrf(request, session.sessionId);
    const requestBytes = await readRequestBytes(request, MAX_REQUEST_BYTES);
    const boundedRequest = new Request(request.url, {
      method: request.method,
      headers: request.headers,
      body: requestBytes.buffer.slice(
        requestBytes.byteOffset,
        requestBytes.byteOffset + requestBytes.byteLength,
      ) as ArrayBuffer,
    });
    const contentType = request.headers.get("content-type") ?? "";
    let result;
    if (contentType.includes("multipart/form-data")) {
      const form = await boundedRequest.formData();
      const workflow = form.get("workflow");
      if (!(workflow instanceof File)) {
        throw new LabHttpError("WORKFLOW_REQUIRED", "Multipart field 'workflow' must be a file.", 400);
      }
      if (workflow.size > MAX_N8N_UPLOAD_BYTES) {
        throw new LabHttpError("UPLOAD_TOO_LARGE", "Workflow upload exceeds the allowed size.", 413, {
          limit: MAX_N8N_UPLOAD_BYTES,
        });
      }
      const fixturePart = form.get("fixture");
      let fixture: unknown;
      if (fixturePart instanceof File) fixture = parseFixture(await fixturePart.text());
      else if (typeof fixturePart === "string" && fixturePart) fixture = parseFixture(fixturePart);
      result = await createLabService().createWorkflow({
        sessionId: session.sessionId,
        rawWorkflow: new Uint8Array(await workflow.arrayBuffer()),
        fixture,
      });
    } else {
      const body = await parseJsonObject(boundedRequest, MAX_REQUEST_BYTES);
      if (body?.demo !== true) {
        throw new LabHttpError("DEMO_OR_MULTIPART_REQUIRED", "Send {demo:true} or a multipart workflow file.", 400);
      }
      result = await createLabService().createWorkflow({ sessionId: session.sessionId, demo: true });
    }
    return jsonResponse(
      {
        session: { csrfToken: session.csrfToken },
        workflow: result.workflow,
        fixture: result.fixture,
      },
      201,
    );
  } catch (error) {
    return routeError(error);
  }
}
