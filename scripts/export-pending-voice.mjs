import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const sourcePath = join(root, "voice-source", "pending-voice-v1.5.json");
const source = JSON.parse(readFileSync(sourcePath, "utf8"));

function entriesFor(groupName, items) {
  return items.map((item, index) => ({
    id: item.id ?? `${groupName}-${String(index + 1).padStart(groupName.startsWith("hourly-") ? 2 : 1, "0")}`,
    group: groupName,
    message: item.message,
    synth: item.synth,
    animation: item.animation,
  }));
}

const entries = Object.entries(source.groups).flatMap(([groupName, items]) => entriesFor(groupName, items));
const batches = {
  hourly: entries.filter((entry) => entry.group.startsWith("hourly-")),
  functional: entries.filter((entry) => !entry.group.startsWith("hourly-")),
};

for (const [batchName, batchEntries] of Object.entries(batches)) {
  const text = batchEntries.map((entry) => entry.synth).join(`\n\n${source.separator}\n\n`);
  writeFileSync(join(root, "voice-source", `pending-${batchName}-v1.5.txt`), `${text}\n`, "utf8");
  writeFileSync(
    join(root, "voice-source", `pending-${batchName}-v1.5-map.json`),
    `${JSON.stringify({ version: source.version, batch: batchName, entries: batchEntries }, null, 2)}\n`,
    "utf8",
  );
}

writeFileSync(
  join(root, "assets", "voice", "hourly-v1.5.json"),
  `${JSON.stringify({ version: source.version, entries: batches.hourly }, null, 2)}\n`,
  "utf8",
);
writeFileSync(
  join(root, "assets", "voice", "functional-v1.5.json"),
  `${JSON.stringify({ version: source.version, entries: batches.functional }, null, 2)}\n`,
  "utf8",
);

console.log(`Exported ${batches.hourly.length} hourly and ${batches.functional.length} functional voice lines.`);
