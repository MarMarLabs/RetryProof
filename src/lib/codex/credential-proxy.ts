import { randomBytes } from "node:crypto";
import { createServer } from "node:http";
import { request as httpsRequest } from "node:https";

const MAX_PROXY_REQUEST_BYTES = 16 * 1024 * 1024;
const CODEX_PROXY_TIMEOUT_MS = 55_000;

export interface CodexCredentialProxy {
  apiKey: string;
  baseUrl: string;
  close(): Promise<void>;
}

function isLoopback(address: string | undefined): boolean {
  return address === "127.0.0.1" || address === "::1" || address === "::ffff:127.0.0.1";
}

export async function startCodexCredentialProxy(
  upstreamApiKey: string,
): Promise<CodexCredentialProxy> {
  if (!upstreamApiKey) throw new Error("OPENAI_API_KEY is required for live Codex repair.");
  const token = `retryproof_${randomBytes(32).toString("base64url")}`;
  const server = createServer((request, response) => {
    if (
      !isLoopback(request.socket.remoteAddress) ||
      request.method !== "POST" ||
      request.headers.authorization !== `Bearer ${token}`
    ) {
      response.writeHead(403).end();
      return;
    }
    const incomingPath = request.url ?? "";
    const upstreamPath = incomingPath.startsWith("/v1/")
      ? incomingPath
      : `/v1${incomingPath.startsWith("/") ? incomingPath : `/${incomingPath}`}`;
    if (!upstreamPath.startsWith("/v1/responses")) {
      response.writeHead(404).end();
      return;
    }

    let received = 0;
    const upstream = httpsRequest(
      {
        hostname: "api.openai.com",
        port: 443,
        agent: false,
        method: "POST",
        path: upstreamPath,
        headers: {
          accept: request.headers.accept ?? "application/json",
          "content-type": request.headers["content-type"] ?? "application/json",
          authorization: `Bearer ${upstreamApiKey}`,
          ...(process.env.OPENAI_ORGANIZATION_ID
            ? { "openai-organization": process.env.OPENAI_ORGANIZATION_ID }
            : {}),
          ...(process.env.OPENAI_PROJECT_ID
            ? { "openai-project": process.env.OPENAI_PROJECT_ID }
            : {}),
        },
      },
      (upstreamResponse) => {
        response.writeHead(upstreamResponse.statusCode ?? 502, {
          "content-type": upstreamResponse.headers["content-type"] ?? "application/json",
          ...(upstreamResponse.headers["x-request-id"]
            ? { "x-request-id": upstreamResponse.headers["x-request-id"] }
            : {}),
        });
        upstreamResponse.pipe(response);
      },
    );
    upstream.on("error", () => {
      if (!response.headersSent) response.writeHead(502);
      response.end();
    });
    upstream.setTimeout(CODEX_PROXY_TIMEOUT_MS, () => {
      upstream.destroy(new Error("Codex credential proxy upstream timed out."));
    });
    request.on("data", (chunk: Buffer) => {
      received += chunk.byteLength;
      if (received > MAX_PROXY_REQUEST_BYTES) {
        upstream.destroy();
        if (!response.headersSent) response.writeHead(413);
        response.end();
        request.destroy();
      }
    });
    request.pipe(upstream);
  });

  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      server.off("error", reject);
      resolve();
    });
  });
  const address = server.address();
  if (address === null || typeof address === "string") {
    server.close();
    throw new Error("Codex credential proxy did not bind to a TCP port.");
  }

  return {
    apiKey: token,
    baseUrl: `http://127.0.0.1:${address.port}/v1`,
    close: () =>
      new Promise<void>((resolve, reject) => {
        server.closeAllConnections();
        server.close((error) => (error ? reject(error) : resolve()));
      }),
  };
}
