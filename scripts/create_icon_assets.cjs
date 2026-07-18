const { copyFileSync, mkdirSync } = require("node:fs");
const { join, resolve } = require("node:path");

const sourcePath = resolve(process.argv[2] || "C:/Users/Yu/Downloads/鹿美.svg");
const outputDir = resolve(process.argv[3] || join(__dirname, "..", "assets", "icons"));

mkdirSync(outputDir, { recursive: true });
copyFileSync(sourcePath, join(outputDir, "app-icon.svg"));
copyFileSync(sourcePath, join(outputDir, "tray-icon.svg"));
console.log("Copied the original SVG without visual modifications.");
