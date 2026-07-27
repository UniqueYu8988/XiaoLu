import { execFileSync, spawnSync } from "node:child_process";
import { mkdirSync, rmSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const input = resolve(process.argv[2] ?? join(root, "voice-source", "xiaolu-voice-master.mp3"));
const output = join(root, "assets", "voice");
const temporary = join(root, "tmp", "voice-master-normalized.wav");

const clipNames = [
  "checkin-09-1", "checkin-09-2", "checkin-09-3",
  "checkin-12-1", "checkin-12-2", "checkin-12-3",
  "checkin-15-1", "checkin-15-2", "checkin-15-3",
  "checkin-18-1", "checkin-18-2", "checkin-18-3",
  "checkin-21-1", "checkin-21-2", "checkin-21-3",
  "checkin-success-1", "checkin-success-2", "checkin-success-3",
  "checkin-missed-1", "checkin-missed-2", "checkin-missed-3",
  "launch-prompt-1", "launch-prompt-2", "launch-prompt-3",
  "launch-snooze-1", "launch-snooze-2",
  "launch-skip-1", "launch-skip-2",
  "launch-final-1", "launch-final-2",
  "launch-success-1", "launch-success-2", "launch-success-3",
  "yuquiz-paused-1", "yuquiz-paused-2", "yuquiz-paused-3",
  "yuquiz-ready-1", "yuquiz-ready-2", "yuquiz-ready-3",
  "yuquiz-set-complete-1", "yuquiz-set-complete-2", "yuquiz-set-complete-3",
  "task-reminder-1", "task-reminder-2", "task-reminder-3",
  "task-completed-1", "task-completed-2", "all-tasks-completed-1",
  "bounty-self-1", "bounty-self-2",
  "bounty-gift-1", "bounty-gift-2",
  "settlement-together-1", "settlement-self-1", "settlement-friend-1", "settlement-none-1",
  "study-started-1", "study-started-2", "study-started-3",
  "study-stopped-1", "study-stopped-2", "study-stopped-3",
];

function run(program, args, options = {}) {
  return execFileSync(program, args, { encoding: "utf8", stdio: options.capture ? ["ignore", "pipe", "pipe"] : "inherit" });
}

const detectionResult = spawnSync("ffmpeg", [
  "-hide_banner", "-i", input,
  "-af", "silencedetect=noise=-42dB:d=1.25",
  "-f", "null", "NUL",
], { encoding: "utf8", stdio: ["ignore", "ignore", "pipe"] });
if (detectionResult.error) throw detectionResult.error;
if (detectionResult.status !== 0) throw new Error(detectionResult.stderr || "Silence detection failed.");
const detection = detectionResult.stderr;
const starts = [...detection.matchAll(/silence_start:\s*([\d.]+)/g)].map((match) => Number(match[1]));
const ends = [...detection.matchAll(/silence_end:\s*([\d.]+)/g)].map((match) => Number(match[1]));
if (starts.length !== clipNames.length - 1 || ends.length !== starts.length) {
  throw new Error(`Expected ${clipNames.length - 1} separators for ${clipNames.length} clips, found ${starts.length}.`);
}

const probe = JSON.parse(run("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "json", input], { capture: true }));
const duration = Number(probe.format?.duration);
if (!Number.isFinite(duration)) throw new Error("Could not determine master duration.");

mkdirSync(dirname(temporary), { recursive: true });
mkdirSync(output, { recursive: true });
rmSync(output, { recursive: true, force: true });
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
console.log(`Created ${clipNames.length} normalized clips in ${output} from ${basename(input)}.`);
