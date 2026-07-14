import { spawnSync } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const transcriptPath = join(root, "submission", "video", "transcript.md");
const outputPath = join(root, "submission", "video", "retryproof-demo-review-cut.mp4");
const images = [
  "03-red-counterexample.png",
  "01-import.png",
  "02-contract.png",
  "02-contract.png",
  "03-red-counterexample.png",
  "04-codex-repair.png",
  "05-green-comparison.png",
  "06-evidence-receipt.png",
  "../thumbnail/retryproof-thumbnail.png",
];

function run(command, args) {
  const result = spawnSync(command, args, { cwd: root, encoding: "utf8" });
  if (result.status !== 0) {
    throw new Error(`${command} failed: ${result.stderr || result.stdout}`);
  }
  return result.stdout.trim();
}

function seconds(minutes, secondsValue) {
  return Number(minutes) * 60 + Number(secondsValue);
}

function narrationText(markdown) {
  return markdown
    .replaceAll("GPT-5.6", "GPT five point six")
    .replaceAll("event.id", "event I D")
    .replaceAll("demo-v1", "demo V one")
    .replaceAll("evt_refund_001", "event refund zero zero one")
    .replaceAll("`", "");
}

function atempoChain(factor) {
  const filters = [];
  let remaining = factor;
  while (remaining > 2) {
    filters.push("atempo=2");
    remaining /= 2;
  }
  while (remaining < 0.5) {
    filters.push("atempo=0.5");
    remaining /= 0.5;
  }
  filters.push(`atempo=${remaining.toFixed(6)}`);
  return filters.join(",");
}

const markdown = await readFile(transcriptPath, "utf8");
const sectionPattern = /^## (\d+):(\d+)–(\d+):(\d+) —[^\n]*\n\n([\s\S]*?)(?=\n## |$)/gm;
const sections = [...markdown.matchAll(sectionPattern)].map((match) => ({
  start: seconds(match[1], match[2]),
  end: seconds(match[3], match[4]),
  text: narrationText(match[5].trim()),
}));

if (sections.length !== images.length || sections.at(-1)?.end !== 162) {
  throw new Error("The transcript must contain nine sections ending at 2:42.");
}

const workspace = await mkdtemp(join(tmpdir(), "retryproof-video-"));
try {
  const segmentPaths = [];
  for (const [index, section] of sections.entries()) {
    const duration = section.end - section.start;
    const textPath = join(workspace, `narration-${index}.txt`);
    const rawAudioPath = join(workspace, `narration-${index}.aiff`);
    const timedAudioPath = join(workspace, `narration-${index}.wav`);
    const segmentPath = join(workspace, `segment-${index}.mp4`);
    await writeFile(textPath, `${section.text}\n`, { mode: 0o600 });

    run("say", [
      "-v",
      "Samantha (English (US))",
      "-r",
      "175",
      "-f",
      textPath,
      "-o",
      rawAudioPath,
    ]);
    const rawDuration = Number(
      run("ffprobe", [
        "-v",
        "error",
        "-show_entries",
        "format=duration",
        "-of",
        "default=noprint_wrappers=1:nokey=1",
        rawAudioPath,
      ]),
    );
    const narrationDuration = Math.max(1, duration - 0.4);
    const tempo = rawDuration / narrationDuration;
    run("ffmpeg", [
      "-loglevel",
      "error",
      "-y",
      "-i",
      rawAudioPath,
      "-af",
      `${atempoChain(tempo)},apad=whole_dur=${duration},atrim=0:${duration},afade=t=in:st=0:d=0.12,afade=t=out:st=${Math.max(0, duration - 0.35)}:d=0.3`,
      "-ar",
      "48000",
      "-ac",
      "2",
      timedAudioPath,
    ]);

    const imagePath = resolve(
      root,
      "submission",
      "screenshots",
      images[index],
    );
    run("ffmpeg", [
      "-loglevel",
      "error",
      "-y",
      "-loop",
      "1",
      "-framerate",
      "30",
      "-i",
      imagePath,
      "-i",
      timedAudioPath,
      "-t",
      String(duration),
      "-vf",
      `scale=1280:720:force_original_aspect_ratio=decrease,pad=1280:720:(ow-iw)/2:(oh-ih)/2:color=0x02060d,fade=t=in:st=0:d=0.18,fade=t=out:st=${Math.max(0, duration - 0.18)}:d=0.18`,
      "-c:v",
      "libx264",
      "-preset",
      "medium",
      "-crf",
      "18",
      "-r",
      "30",
      "-pix_fmt",
      "yuv420p",
      "-c:a",
      "aac",
      "-b:a",
      "192k",
      "-movflags",
      "+faststart",
      segmentPath,
    ]);
    segmentPaths.push(segmentPath);
  }

  const concatPath = join(workspace, "segments.txt");
  await writeFile(
    concatPath,
    segmentPaths.map((segmentPath) => `file '${segmentPath}'`).join("\n"),
    { mode: 0o600 },
  );
  run("ffmpeg", [
    "-loglevel",
    "error",
    "-y",
    "-f",
    "concat",
    "-safe",
    "0",
    "-i",
    concatPath,
    "-c",
    "copy",
    "-metadata",
    "title=RetryProof — OpenAI Build Week 2026 review cut",
    "-movflags",
    "+faststart",
    outputPath,
  ]);

  const duration = Number(
    run("ffprobe", [
      "-v",
      "error",
      "-show_entries",
      "format=duration",
      "-of",
      "default=noprint_wrappers=1:nokey=1",
      outputPath,
    ]),
  );
  if (duration >= 180 || duration < 160) {
    throw new Error(`Unexpected review-cut duration: ${duration}`);
  }
  console.log(JSON.stringify({ status: "ready", outputPath, durationSeconds: duration }));
} finally {
  await rm(workspace, { recursive: true, force: true });
}
