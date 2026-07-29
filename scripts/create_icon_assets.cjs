const { copyFileSync, mkdirSync } = require("node:fs");
const { join, resolve } = require("node:path");

if (!process.argv[2]) {
  throw new Error("Usage: node scripts/create_icon_assets.cjs <source-svg> [output-directory]");
}

const sourcePath = resolve(process.argv[2]);
const outputDir = resolve(process.argv[3] || join(__dirname, "..", "assets", "icons"));

mkdirSync(outputDir, { recursive: true });
copyFileSync(sourcePath, join(outputDir, "app-icon.svg"));
copyFileSync(sourcePath, join(outputDir, "tray-icon.svg"));
console.log("Copied the original SVG without visual modifications.");
