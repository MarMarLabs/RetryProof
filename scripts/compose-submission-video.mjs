import { spawnSync } from "node:child_process";
import { rmSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const broll = join(root, "submission", "video", "retryproof-browser-broll.mov");
const review = join(root, "submission", "video", "retryproof-demo-review-cut.mp4");
const composed = join(root, "submission", "video", "retryproof-demo-composed.tmp.mp4");
const output = join(root, "submission", "video", "retryproof-demo-final.mp4");

const filter = [
  "[1:v]trim=start=0:end=12,setpts=PTS-STARTPTS,scale=1280:720,setsar=1,fps=30,tpad=stop_mode=clone:stop_duration=12,trim=duration=12[v0]",
  "[0:v]trim=start=0:end=18,setpts=PTS-STARTPTS,scale=1280:-2,crop=1280:720,setsar=1,fps=30,tpad=stop_mode=clone:stop_duration=18,trim=duration=18[v1]",
  "[0:v]trim=start=25:end=42,setpts=(22/17)*(PTS-STARTPTS),scale=1280:-2,crop=1280:720,setsar=1,fps=30,tpad=stop_mode=clone:stop_duration=22,trim=duration=22[v2]",
  "[0:v]trim=start=38:end=45,setpts=(10/7)*(PTS-STARTPTS),scale=1280:-2,crop=1280:720,setsar=1,fps=30,tpad=stop_mode=clone:stop_duration=10,trim=duration=10[v3]",
  "[0:v]trim=start=45:end=58,setpts=(25/13)*(PTS-STARTPTS),scale=1280:-2,crop=1280:720,setsar=1,fps=30,tpad=stop_mode=clone:stop_duration=25,trim=duration=25[v4]",
  "[0:v]trim=start=58:end=68,setpts=3*(PTS-STARTPTS),scale=1280:-2,crop=1280:720,setsar=1,fps=30,tpad=stop_mode=clone:stop_duration=30,trim=duration=30[v5]",
  "[0:v]trim=start=68:end=75,setpts=(26/7)*(PTS-STARTPTS),scale=1280:-2,crop=1280:720,setsar=1,fps=30,tpad=stop_mode=clone:stop_duration=26,trim=duration=26[v6]",
  "[1:v]trim=start=143:end=162.021333,setpts=PTS-STARTPTS,scale=1280:720,setsar=1,fps=30,tpad=stop_mode=clone:stop_duration=20,trim=duration=19.021333[v7]",
  "[v0][v1][v2][v3][v4][v5][v6][v7]concat=n=8:v=1:a=0[v]",
  "[1:a]atrim=start=0:end=162.021333,asetpts=PTS-STARTPTS[a]",
].join(";");

const result = spawnSync(
  "ffmpeg",
  [
    "-loglevel",
    "error",
    "-y",
    "-i",
    broll,
    "-i",
    review,
    "-filter_complex",
    filter,
    "-map",
    "[v]",
    "-map",
    "[a]",
    "-t",
    "162.021333",
    "-c:v",
    "libx264",
    "-preset",
    "medium",
    "-crf",
    "18",
    "-pix_fmt",
    "yuv420p",
    "-c:a",
    "aac",
    "-b:a",
    "192k",
    "-metadata",
    "title=RetryProof — OpenAI Build Week 2026 demo",
    "-movflags",
    "+faststart",
    composed,
  ],
  { cwd: root, encoding: "utf8" },
);

if (result.status !== 0) {
  throw new Error(result.stderr || result.stdout || "Final video composition failed.");
}

const finalize = spawnSync(
  "ffmpeg",
  [
    "-loglevel",
    "error",
    "-y",
    "-i",
    composed,
    "-i",
    review,
    "-filter_complex",
    "[0:v]tpad=stop_mode=clone:stop_duration=12,trim=duration=165.021333,setpts=PTS-STARTPTS[v];[1:a]atrim=start=0:end=162.021333,asetpts=PTS-STARTPTS,apad=pad_dur=3.1,atrim=duration=165.021333[a]",
    "-map",
    "[v]",
    "-map",
    "[a]",
    "-t",
    "165.021333",
    "-c:v",
    "libx264",
    "-preset",
    "medium",
    "-crf",
    "18",
    "-pix_fmt",
    "yuv420p",
    "-c:a",
    "aac",
    "-b:a",
    "192k",
    "-metadata",
    "title=RetryProof — OpenAI Build Week 2026 demo",
    "-movflags",
    "+faststart",
    output,
  ],
  { cwd: root, encoding: "utf8" },
);

rmSync(composed, { force: true });

if (finalize.status !== 0) {
  throw new Error(finalize.stderr || finalize.stdout || "Final video timing pass failed.");
}

const probe = spawnSync(
  "ffprobe",
  [
    "-v",
    "error",
    "-show_entries",
    "format=duration",
    "-of",
    "default=noprint_wrappers=1:nokey=1",
    output,
  ],
  { cwd: root, encoding: "utf8" },
);
const duration = Number.parseFloat(probe.stdout.trim());

if (probe.status !== 0 || duration < 165 || duration >= 180) {
  throw new Error(`Unexpected final-video duration: ${probe.stderr || duration}`);
}

console.log(JSON.stringify({ status: "ready", output, duration }));
