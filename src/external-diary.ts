import { readFile, readdir, stat } from "node:fs/promises";
import { basename, join } from "node:path";

import type { ExternalDiaryTitleInput } from "./game.js";

const DIARY_FILE_PATTERN = /^(\d{4}-\d{2}-\d{2})(?:[｜|]\s*(.+))?\.md$/i;
const MARKDOWN_TITLE_PATTERN = /^\uFEFF?\s*#\s+(.+?)\s*#*\s*$/m;

export function parseExternalDiaryTitle(
  fileName: string,
  markdown: string,
  modifiedAt: string,
): ExternalDiaryTitleInput | undefined {
  const match = DIARY_FILE_PATTERN.exec(fileName);
  if (!match) return undefined;
  const date = match[1];
  if (!date || !isCalendarDate(date)) return undefined;
  const heading = MARKDOWN_TITLE_PATTERN.exec(markdown)?.[1]?.trim();
  const fileTitle = match[2]?.trim();
  const title = (heading || fileTitle || "").replace(/\s+/g, " ").slice(0, 120);
  if (!title || !Number.isFinite(Date.parse(modifiedAt))) return undefined;
  return { date, title, sourceName: fileName, modifiedAt };
}

export async function scanExternalDiaryDirectory(directory: string): Promise<readonly ExternalDiaryTitleInput[]> {
  const files = await collectMarkdownFiles(directory);
  const entries: ExternalDiaryTitleInput[] = [];
  let incomplete = false;
  for (const filePath of files) {
    try {
      const [markdown, metadata] = await Promise.all([readFile(filePath, "utf8"), stat(filePath)]);
      const entry = parseExternalDiaryTitle(basename(filePath), markdown, metadata.mtime.toISOString());
      if (entry) entries.push(entry);
    } catch (error) {
      // OneDrive placeholders may be temporarily unavailable. A single file
      // must not make a previously synced title look as though it was deleted.
      incomplete = true;
      console.warn("Skipped unavailable external diary file", filePath, error);
    }
  }
  if (incomplete) throw new Error("The external diary scan was incomplete.");
  return entries;
}

async function collectMarkdownFiles(directory: string): Promise<readonly string[]> {
  const results: string[] = [];
  const pending = [directory];
  while (pending.length > 0) {
    const current = pending.pop();
    if (!current) continue;
    const entries = await readdir(current, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = join(current, entry.name);
      if (entry.isDirectory()) {
        if (!entry.name.startsWith(".")) pending.push(fullPath);
      } else if (entry.isFile() && entry.name.toLowerCase().endsWith(".md")) {
        results.push(fullPath);
      }
    }
  }
  return results;
}

function isCalendarDate(value: string): boolean {
  const [year, month, day] = value.split("-").map(Number);
  if (!year || !month || !day) return false;
  const candidate = new Date(Date.UTC(year, month - 1, day));
  return candidate.getUTCFullYear() === year
    && candidate.getUTCMonth() === month - 1
    && candidate.getUTCDate() === day;
}
