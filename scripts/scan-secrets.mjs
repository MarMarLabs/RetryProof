import { readdirSync, readFileSync } from "node:fs";
import { dirname, extname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const ignoredDirectories = new Set([".git", ".next", "node_modules", "coverage", "artifacts"]);
const ignoredFiles = new Set([".env.local", "OpenAI-Build-Week-RetryProof-Research-and-Plan.md"]);
const textExtensions = new Set([
  "",
  ".css",
  ".example",
  ".html",
  ".js",
  ".json",
  ".md",
  ".mjs",
  ".mts",
  ".sql",
  ".svg",
  ".ts",
  ".tsx",
  ".txt",
  ".yaml",
  ".yml",
]);
const patterns = [
  /sk-(?:proj-)?[A-Za-z0-9_-]{20,}/g,
  /postgres(?:ql)?:\/\/[^\s:]+:[^\s@]+@/g,
  /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/g,
  /gh[pousr]_[A-Za-z0-9]{30,}/g,
];
const syntheticApiKey = ["sk", "proj", "abcdefghijklmnopqrstuv"].join("-");
const syntheticPrivateKeyHeader = ["-----BEGIN", "PRIVATE KEY-----"].join(" ");
const syntheticExfiltrationCanary = ["sk", "proj", "SENTINEL_EXFILTRATED_SECRET_1234567890"].join("-");
const allowedSyntheticMatches = new Map([
  ["tests/unit/n8n/ingest.test.ts", new Set([syntheticApiKey])],
  ["tests/unit/n8n/sanitizer.test.ts", new Set([syntheticApiKey, syntheticPrivateKeyHeader])],
  ["tests/unit/codex/repair.test.ts", new Set([syntheticExfiltrationCanary])],
]);

function walk(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    if (entry.isDirectory() && ignoredDirectories.has(entry.name)) return [];
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return walk(path);
    if (ignoredFiles.has(entry.name) || !textExtensions.has(extname(entry.name))) return [];
    return [path];
  });
}

let scannedFiles = 0;
let allowedCanaries = 0;
const unexpectedFiles = new Set();

for (const path of walk(root)) {
  scannedFiles += 1;
  const projectPath = relative(root, path);
  const text = readFileSync(path, "utf8");
  const allowed = allowedSyntheticMatches.get(projectPath) ?? new Set();
  for (const pattern of patterns) {
    pattern.lastIndex = 0;
    for (const match of text.matchAll(pattern)) {
      if (allowed.has(match[0])) {
        allowedCanaries += 1;
      } else {
        unexpectedFiles.add(projectPath);
      }
    }
  }
}

if (unexpectedFiles.size > 0) {
  console.error(
    JSON.stringify({
      status: "fail",
      message: "credential-shaped values require review",
      files: [...unexpectedFiles].sort(),
    }),
  );
  process.exit(1);
}

console.log(JSON.stringify({ status: "pass", scannedFiles, allowedSyntheticCanaries: allowedCanaries }));
