import { strToU8, zipSync } from "fflate";

import { createLabService, requireLabSession, routeError } from "@/lib/lab";

export const runtime = "nodejs";

function json(value: unknown): Uint8Array {
  return strToU8(`${JSON.stringify(value, null, 2)}\n`);
}

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  try {
    const session = await requireLabSession(request);
    const { id } = await context.params;
    const artifact = await createLabService().getArtifact(session.sessionId, id);
    const receipt = artifact.receipt;
    const archive = zipSync(
      {
        "evidence-receipt.json": json(receipt),
        "repair.patch.json": json(receipt.repair.patch),
        "regression-fixture.json": json(receipt.repair.regressionFixture),
        "before-suite.json": json(receipt.before),
        "after-suite.json": json(receipt.after),
        "repair-manifest.json": json(receipt.repair.manifest),
        "README.md": strToU8(`${receipt.repair.readme}\n\n## Evidence limitations\n\n${receipt.limitations.map((item) => `- ${item}`).join("\n")}\n`),
      },
      { level: 6 },
    );
    return new Response(archive as BodyInit, {
      status: 200,
      headers: {
        "content-type": "application/zip",
        "content-disposition": `attachment; filename="retryproof-${artifact.id}.zip"`,
        "content-length": String(archive.byteLength),
        "cache-control": "private, no-store",
        etag: `"${artifact.sha256}"`,
      },
    });
  } catch (error) {
    return routeError(error);
  }
}
