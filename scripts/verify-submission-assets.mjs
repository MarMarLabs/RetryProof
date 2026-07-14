import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const submission = join(root, "submission");
const screenshotNames = [
  "01-import.png",
  "02-contract.png",
  "03-red-counterexample.png",
  "04-codex-repair.png",
  "05-green-comparison.png",
  "06-evidence-receipt.png",
];
const screenshotPaths = screenshotNames.map((name) => join(submission, "screenshots", name));
const thumbnailPath = join(submission, "thumbnail", "retryproof-thumbnail.png");
const videoPath = join(submission, "video", "retryproof-demo-final.mp4");
const captionPath = join(submission, "video", "captions.srt");
const transcriptPath = join(submission, "video", "transcript.md");

function fail(message) {
  throw new Error(`Submission asset verification failed: ${message}`);
}

function probe(path) {
  const result = spawnSync(
    "ffprobe",
    ["-v", "error", "-show_entries", "format=duration:stream=codec_name,width,height,sample_rate,channels", "-of", "json", path],
    { cwd: root, encoding: "utf8" },
  );
  if (result.status !== 0) {
    fail(`${relative(root, path)} is not readable by ffprobe: ${result.stderr.trim()}`);
  }
  return JSON.parse(result.stdout);
}

function sha256(path) {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

function assetRecord(path, metadata = {}) {
  return {
    path: relative(root, path),
    bytes: statSync(path).size,
    sha256: sha256(path),
    ...metadata,
  };
}

for (const path of [...screenshotPaths, thumbnailPath, videoPath, captionPath, transcriptPath]) {
  try {
    statSync(path);
  } catch {
    fail(`missing ${relative(root, path)}`);
  }
}

const screenshots = screenshotPaths.map((path) => {
  const info = probe(path).streams[0];
  if (info.width < 1280 || info.height < 720 || Math.abs(info.width / info.height - 16 / 9) > 0.01) {
    fail(`${relative(root, path)} must be a wide image at least 1280x720`);
  }
  return assetRecord(path, { width: info.width, height: info.height });
});

const thumbnailInfo = probe(thumbnailPath).streams[0];
if (thumbnailInfo.width !== 1280 || thumbnailInfo.height !== 720) {
  fail("thumbnail must be exactly 1280x720");
}

const videoInfo = probe(videoPath);
const durationSeconds = Number.parseFloat(videoInfo.format.duration);
const videoStream = videoInfo.streams.find((stream) => stream.codec_name === "h264");
const audioStream = videoInfo.streams.find((stream) => stream.codec_name === "aac");
if (!videoStream || videoStream.width !== 1280 || videoStream.height !== 720) {
  fail("final video must contain 1280x720 H.264 video");
}
if (!audioStream || audioStream.sample_rate !== "48000" || audioStream.channels !== 2) {
  fail("final video must contain 48 kHz stereo AAC audio");
}
if (durationSeconds < 165 || durationSeconds >= 180) {
  fail(`final video duration must be 2:45-2:59.999, received ${durationSeconds}`);
}

const captions = readFileSync(captionPath, "utf8");
const captionTimes = [...captions.matchAll(/-->\s*(\d{2}):(\d{2}):(\d{2}),(\d{3})/g)];
if (captionTimes.length === 0) {
  fail("captions contain no valid SRT end times");
}
const lastCaption = captionTimes.at(-1);
const lastCaptionSeconds =
  Number(lastCaption[1]) * 3600 +
  Number(lastCaption[2]) * 60 +
  Number(lastCaption[3]) +
  Number(lastCaption[4]) / 1000;
if (lastCaptionSeconds > durationSeconds || lastCaptionSeconds < 161) {
  fail(`captions end at ${lastCaptionSeconds}s for a ${durationSeconds}s video`);
}

const transcript = readFileSync(transcriptPath, "utf8");
for (const requiredText of ["GPT-5.6 proposes", "Codex repairs", "Deterministic software proves"]) {
  if (!transcript.includes(requiredText)) {
    fail(`transcript is missing required close: ${requiredText}`);
  }
}

const manifest = {
  schemaVersion: 1,
  video: assetRecord(videoPath, {
    durationSeconds,
    width: videoStream.width,
    height: videoStream.height,
    videoCodec: videoStream.codec_name,
    audioCodec: audioStream.codec_name,
    sampleRate: Number(audioStream.sample_rate),
    channels: audioStream.channels,
  }),
  captions: assetRecord(captionPath, { endSeconds: lastCaptionSeconds }),
  transcript: assetRecord(transcriptPath),
  thumbnail: assetRecord(thumbnailPath, { width: thumbnailInfo.width, height: thumbnailInfo.height }),
  screenshots,
};

const manifestPath = join(submission, "asset-manifest.json");
writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
console.log(JSON.stringify({ status: "ready", manifest: relative(root, manifestPath), durationSeconds }));
