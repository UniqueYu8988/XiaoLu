import { execFileSync, spawnSync } from "node:child_process";
import { mkdirSync, readFileSync, rmSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const batch = process.argv[2];
if (batch !== "hourly" && batch !== "functional") {
  throw new Error("Usage: node scripts/split-pending-voice.mjs <hourly|functional> <master.mp3>");
}

const input = resolve(process.argv[3] ?? join(root, "voice-source", `xiaolu-${batch}-v1.5-master.mp3`));
const map = JSON.parse(readFileSync(join(root, "voice-source", `pending-${batch}-v1.5-map.json`), "utf8"));
const clipNames = map.entries.map((entry) => entry.id);
const output = join(root, "assets", "voice");
const temporary = join(root, "tmp", `${batch}-v1.5-normalized.wav`);

function run(program, args, options = {}) {
  return execFileSync(program, args, {
    encoding: "utf8",
    stdio: options.capture ? ["ignore", "pipe", "pipe"] : "inherit",
  });
}

const detectionResult = spawnSync("ffmpeg", [
  "-hide_banner", "-i", input,
  "-af", "silencedetect=noise=-40dB:d=1.25",
  "-f", "null", "NUL",
], { encoding: "utf8", stdio: ["ignore", "ignore", "pipe"] });
if (detectionResult.error) throw detectionResult.error;
if (detectionResult.status !== 0) throw new Error(detectionResult.stderr || "Silence detection failed.");
const starts = [...detectionResult.stderr.matchAll(/silence_start:\s*([\d.]+)/g)].map((match) => Number(match[1]));
const ends = [...detectionResult.stderr.matchAll(/silence_end:\s*([\d.]+)/g)].map((match) => Number(match[1]));
if (starts.length !== clipNames.length - 1 || ends.length !== starts.length) {
  throw new Error(`Expected ${clipNames.length - 1} separators for ${clipNames.length} clips, found ${starts.length}.`);
}

const probe = JSON.parse(run("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "json", input], { capture: true }));
const duration = Number(probe.format?.duration);
if (!Number.isFinite(duration)) throw new Error("Could not determine master duration.");

mkdirSync(dirname(temporary), { recursive: true });
mkdirSync(output, { recursive: true });
run("ffmpeg", [
  "-y", "-hide_banner", "-loglevel", "error", "-i", input,
  "-af", "loudnorm=I=-18:TP=-1.5:LRA=7", "-ar", "44100", "-ac", "1", temporary,
]);

for (let index = 0; index < clipNames.length; index += 1) {
  const start = index === 0 ? 0 : Math.max(0, ends[index - 1] - 0.12);
  const end = index === clipNames.length - 1 ? duration : Math.min(duration, starts[index] + 0.15);
  run("ffmpeg", [
    "-y", "-hide_banner", "-loglevel", "error",
    "-ss", start.toFixed(6), "-to", end.toFixed(6), "-i", temporary,
    "-codec:a", "libmp3lame", "-b:a", "80k", "-ar", "44100", "-ac", "1",
    join(output, `${clipNames[index]}.mp3`),
  ]);
}

rmSync(temporary, { force: true });
console.log(`Created ${clipNames.length} ${batch} clips in ${output} from ${basename(input)}.`);
