import { spawnSync } from "node:child_process";
import { readFileSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const finalMode = process.argv.includes("--final");
const submissionFiles = [
  "submission/DEVPOST.md",
  "submission/JUDGE-INSTRUCTIONS.md",
  "submission/ASSET-CHECKLIST.md",
  "submission/VERIFICATION.md",
  "submission/video/YOUTUBE.md",
];
const expectedExternalFields = [
  "DEPLOYED_HTTPS_URL",
  "REPOSITORY_URL",
  "YOUTUBE_URL",
  "FEEDBACK_SESSION_ID",
];

function run(script) {
  const result = spawnSync("npm", ["run", script, "--silent"], {
    cwd: root,
    encoding: "utf8",
  });
  if (result.status !== 0) {
    throw new Error(result.stderr || result.stdout || `${script} failed`);
  }
}

run("security:secrets");
run("submission:verify");

const content = submissionFiles
  .map((path) => {
    statSync(join(root, path));
    return readFileSync(join(root, path), "utf8");
  })
  .join("\n");
const placeholders = [...content.matchAll(/\[(DEPLOYED_HTTPS_URL|REPOSITORY_URL|YOUTUBE_URL|FEEDBACK_SESSION_ID)\]/g)].map(
  (match) => match[1],
);
const unresolved = expectedExternalFields.filter((field) => placeholders.includes(field));

if (finalMode && unresolved.length > 0) {
  console.error(JSON.stringify({ status: "fail", reason: "external placeholders remain", unresolved }));
  process.exit(1);
}
if (!finalMode && unresolved.length !== expectedExternalFields.length) {
  throw new Error("Dry-run mode expects all four external fields to remain explicit until publication is approved.");
}

console.log(
  JSON.stringify({
    status: finalMode ? "final-audit-pass" : "local-ready-awaiting-external-state",
    unresolved,
    submissionFiles: submissionFiles.length,
  }),
);
