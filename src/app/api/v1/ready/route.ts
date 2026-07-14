import { checkReadiness } from "@/lib/platform/readiness";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  const readiness = await checkReadiness();
  return Response.json(readiness, {
    status: readiness.ready ? 200 : 503,
    headers: { "Cache-Control": "no-store" },
  });
}
