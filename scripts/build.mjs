import { cp, mkdir, rm } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const dist = join(root, "dist");

await rm(dist, { recursive: true, force: true });
await mkdir(dist, { recursive: true });

const tsc = join(root, "node_modules", "typescript", "bin", "tsc");
const result = spawnSync(process.execPath, [tsc], { cwd: root, stdio: "inherit" });
if (result.error) throw result.error;
if (result.status !== 0) process.exit(result.status ?? 1);

await Promise.all([
  cp(join(root, "src", "renderer"), join(dist, "renderer"), { recursive: true }),
  cp(join(root, "src", "preload"), join(dist, "preload"), { recursive: true }),
  cp(join(root, "assets"), join(dist, "assets"), { recursive: true }),
]);

console.log("Xiaolu build complete.");
