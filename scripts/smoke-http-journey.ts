const baseUrl = process.env.RETRYPROOF_BASE_URL ?? "http://localhost:3000";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function requiredString(value: string | undefined, message: string): string {
  if (!value) throw new Error(message);
  return value;
}

async function json<T>(response: Response, expected: number): Promise<T> {
  if (response.status !== expected) {
    throw new Error(`${response.url} returned ${response.status}: ${await response.text()}`);
  }
  return (await response.json()) as T;
}

async function main(): Promise<void> {
  const sessionResponse = await fetch(`${baseUrl}/api/v1/session`);
  const session = await json<{ session: { csrfToken: string } }>(sessionResponse, 200);
  const cookieHeader = requiredString(
    sessionResponse.headers.get("set-cookie")?.split(";", 1)[0],
    "Session response did not set a cookie.",
  );

async function mutate<T>(
  path: string,
  body: unknown,
  expected = 201,
  extraHeaders: Record<string, string> = {},
): Promise<T> {
  return json<T>(
    await fetch(`${baseUrl}${path}`, {
      method: path === "/api/v1/session" ? "DELETE" : path.endsWith("/plan") ? "PATCH" : "POST",
      headers: {
        cookie: cookieHeader,
        "content-type": "application/json",
        "x-csrf-token": session.session.csrfToken,
        ...extraHeaders,
      },
      body: JSON.stringify(body),
    }),
    expected,
  );
}

  const imported = await mutate<{
  workflow: { id: string; sourceHash: string; compatibility: { canExecute: boolean } };
}>("/api/v1/workflows", { demo: true });
assert(imported.workflow.compatibility.canExecute, "Seed workflow was not executable.");

  const analyzed = await mutate<{
  analysis: { id: string; planHash: string; result: { provenance: { mode: string } } };
}>(`/api/v1/workflows/${imported.workflow.id}/analyses`, { mode: "cached" });
assert(analyzed.analysis.result.provenance.mode === "cached", "Judge path provenance changed.");

  await mutate(
  `/api/v1/analyses/${analyzed.analysis.id}/plan`,
  { approved: true },
  200,
  { "if-match": analyzed.analysis.planHash },
);
  await mutate(`/api/v1/analyses/${analyzed.analysis.id}/scenarios`, {});

  const before = await mutate<{
  execution: { suite: { passed: boolean; results: Array<{ effects: unknown[] }> } };
}>(
  `/api/v1/analyses/${analyzed.analysis.id}/executions`,
  { phase: "before", seed: "demo-v1" },
  201,
  { "idempotency-key": `smoke-before-${analyzed.analysis.id}` },
);
  assert(!before.execution.suite.passed, "Unsafe suite unexpectedly passed.");
  assert(before.execution.suite.results.some((result) => result.effects.length === 2), "Red run did not record two effects.");

  const liveRepairResponse = await fetch(
    `${baseUrl}/api/v1/analyses/${analyzed.analysis.id}/repairs`,
    {
      method: "POST",
      headers: {
        cookie: cookieHeader,
        "content-type": "application/json",
        "x-csrf-token": session.session.csrfToken,
      },
      body: JSON.stringify({ mode: "live" }),
    },
  );
  const liveRepairError = await json<{ error: { code: string } }>(liveRepairResponse, 422);
  assert(
    liveRepairError.error.code === "LIVE_CODEX_LOCAL_ONLY",
    "Production server did not enforce the trusted-local live Codex boundary.",
  );

  const repaired = await mutate<{ repair: { id: string } }>(
  `/api/v1/analyses/${analyzed.analysis.id}/repairs`,
  { mode: "cached" },
);
  const verified = await mutate<{
  execution: { suite: { passed: boolean; results: Array<{ effects: unknown[] }> } };
  artifact: { id: string; sha256: string };
}>(`/api/v1/repairs/${repaired.repair.id}/recheck`, { seed: "demo-v1" });
  assert(verified.execution.suite.passed, "Repaired suite did not pass.");
  assert(verified.execution.suite.results.every((result) => result.effects.length <= 1), "Green run exceeded one effect.");

  const archive = await fetch(`${baseUrl}/api/v1/artifacts/${verified.artifact.id}/download`, {
    headers: { cookie: cookieHeader },
  });
  assert(archive.status === 200, "Artifact bundle download failed.");
  assert(archive.headers.get("content-type") === "application/zip", "Artifact bundle is not a ZIP.");
  assert((await archive.arrayBuffer()).byteLength > 500, "Artifact bundle was unexpectedly empty.");

  await mutate("/api/v1/session", {}, 200);
  process.stdout.write(
    `RetryProof HTTP journey passed: live-codex=blocked, red=2, green=1, artifact=${verified.artifact.id}, hash=${verified.artifact.sha256.slice(0, 12)}…\n`,
  );
}

void main().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.stack : String(error)}\n`);
  process.exitCode = 1;
});
