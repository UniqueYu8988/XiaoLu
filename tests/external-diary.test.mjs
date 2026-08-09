import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, utimes, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { parseExternalDiaryTitle, scanExternalDiaryDirectory } from "../dist/external-diary.js";

const parsed = parseExternalDiaryTitle(
  "2026-08-08｜文件名标题.md",
  "# 正文中的标题\n\n今天的正文。\n",
  "2026-08-08T15:00:00.000Z",
);
assert.equal(parsed?.date, "2026-08-08");
assert.equal(parsed?.title, "正文中的标题");
assert.equal(parseExternalDiaryTitle("普通笔记.md", "# 不应同步", "2026-08-08T15:00:00.000Z"), undefined);

const root = await mkdtemp(join(tmpdir(), "xiaolu-diary-"));
try {
  const month = join(root, "08");
  await mkdir(month);
  const older = join(month, "2026-08-07｜较早版本.md");
  const newer = join(month, "2026-08-07｜较新版本.md");
  const fallback = join(month, "2026-08-08｜使用文件名.md");
  await writeFile(older, "# 较早标题\n", "utf8");
  await writeFile(newer, "# 最后修改的标题\n", "utf8");
  await writeFile(fallback, "没有一级标题。\n", "utf8");
  await utimes(older, new Date("2026-08-07T10:00:00Z"), new Date("2026-08-07T10:00:00Z"));
  await utimes(newer, new Date("2026-08-08T10:00:00Z"), new Date("2026-08-08T10:00:00Z"));

  const entries = await scanExternalDiaryDirectory(root);
  assert.equal(entries.length, 3);
  assert.equal(entries.find((entry) => entry.sourceName === "2026-08-08｜使用文件名.md")?.title, "使用文件名");
} finally {
  await rm(root, { recursive: true, force: true });
}

console.log("Xiaolu external-diary tests passed.");
