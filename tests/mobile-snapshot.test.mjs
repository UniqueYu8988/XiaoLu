import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createMobileSnapshot } from "../dist/mobile-snapshot.js";
import { initialStudyState } from "../dist/game.js";

const now = new Date("2026-09-26T10:00:00+08:00");
const day = "2026-09-26";
const empty = createMobileSnapshot(initialStudyState(now), day, now);
assert.equal(empty.schemaVersion, 2);
assert.equal(empty.studyDay, day);
assert.equal(empty.today.studySeconds, 0);
assert.equal(empty.today.checkIns.length, 5);
assert.equal(empty.todos.length, 0);
assert.equal(empty.history.length, 0);
assert.equal(empty.stats.totalStudySeconds, 0);

const state = {
  ...initialStudyState(now),
  days: {
    [day]: {
      date: day,
      sessions: [{ startedAt: "2026-09-26T08:00:00+08:00", endedAt: "2026-09-26T08:30:00+08:00" }],
      checkIns: { "09:00": { status: "checked", checkedAt: now.toISOString() } },
      tasks: [{ id: "done", title: "整理笔记", createdAt: now.toISOString(), completedAt: now.toISOString() }],
      taskReminders: [],
      studyLaunches: {},
      goals: { studyMinutesTarget: 180, readingPercent: 42, questionsPercent: 70, overallPercent: 57 },
      report: { note: "这里是私人的今日总结", vocabularyCount: 23 },
      externalDiary: { title: "私人日记标题", sourceName: "private.md", modifiedAt: now.toISOString() },
    },
  },
  backlogTasks: [{ id: "todo", title: "下周想做的事", createdAt: now.toISOString() }],
};
const snapshot = createMobileSnapshot(state, day, now);
assert.equal(snapshot.today.studySeconds, 1_800);
assert.equal(snapshot.today.readingPercent, 42);
assert.equal(snapshot.today.vocabularyCount, 23);
assert.deepEqual(snapshot.todos.map((task) => task.id), ["todo", "done"]);
assert.equal(snapshot.today.checkIns[0].status, "checked");
assert.equal(snapshot.today.checkIns[1].status, "upcoming");
assert.equal(snapshot.stats.totalStudySeconds, 1_800);
assert.equal(snapshot.history[0].note, "私人日记标题");
const serialized = JSON.stringify(snapshot);
assert.ok(!serialized.includes("这里是私人的今日总结"));
assert.ok(!serialized.includes("private.md"));
assert.ok(!serialized.includes("sourceName"));
assert.ok(!serialized.includes("petPosition"));

const sample = JSON.parse(readFileSync(new URL("../android-app/sample-snapshot.json", import.meta.url), "utf8"));
assert.equal(sample.schemaVersion, 1);
assert.ok(Object.keys(sample.today).every((key) => key in empty.today));
assert.equal(sample.today.checkIns.length, empty.today.checkIns.length);
assert.ok(sample.todos.every((todo) => Object.keys(todo).sort().join() === "completed,daily,id,title"));

console.log("Xiaolu Android snapshot contract tests passed.");
