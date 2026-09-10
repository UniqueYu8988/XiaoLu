import assert from "node:assert/strict";

import { calculateYuReaderRewardProgress, initialStudyState, saveYuReaderSnapshot } from "../dist/game.js";
import { parseYuReaderStatus } from "../dist/yureader.js";

const now = new Date("2026-09-09T22:00:00+08:00");
const status = {
  study_day: "2026-09-09",
  goals_updated_at: "2026-09-09T21:55:00+08:00",
  last_event_id: 42,
  page: { open: true, visible: true, study_state: "learning", pause_reason: "none", last_meaningful_activity_at: "2026-09-09T21:59:00+08:00" },
  current_activity: { view: "reader" },
  today: {
    learning_seconds: 7200,
    reading: { actual_seconds: 19800, target_seconds: 18000, percent: 110 },
    questions: { actual_count: 88, target_count: 110, percent: 80 },
    vocabulary: { count: 200, target_count: 100 },
    subjects: {
      medicine: { percent: 105, reading: { percent: 110 }, questions: { percent: 100 } },
      politics: { percent: 70, reading: { percent: 80 }, questions: { percent: 60 } },
      english: { percent: 60, reading: { percent: 50 }, questions: { percent: 70 } },
    },
    clearances: {
      oral_review: { completed: true },
      mistake_review: { completed: false },
    },
  },
};

const snapshot = parseYuReaderStatus(status, now);
assert.equal(snapshot.date, "2026-09-09");
assert.equal(snapshot.reading.percent, 110);
assert.equal(snapshot.questions.percent, 80);
assert.equal(snapshot.subjects.medicine.percent, 105);
assert.equal(snapshot.pageOpen, true);
assert.equal(snapshot.studyState, "learning");

const reward = calculateYuReaderRewardProgress(snapshot, 4);
assert.deepEqual(reward, {
  readingPercent: 130,
  questionsPercent: 90,
  overallPercent: 114,
});

const state = saveYuReaderSnapshot(initialStudyState(now), snapshot, now);
const goals = state.days["2026-09-09"].goals;
assert.equal(goals.readingPercent, 130);
assert.equal(goals.questionsPercent, 90);
assert.equal(goals.overallPercent, 110);
assert.ok(goals.studyCompletedAt, "reading bookmark should unlock at 100%");
assert.equal(goals.secondStudyCompletedAt, undefined);
assert.ok(goals.togetherCompletedAt, "combined bookmark should unlock from overall progress");

console.log("Xiaolu YuReader integration tests passed.");
