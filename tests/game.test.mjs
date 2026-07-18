import assert from "node:assert/strict";

import {
  calculateStats,
  checkIn,
  daySummaries,
  findPendingCheckIn,
  initialStudyState,
  localDateKey,
  reconcileStudyState,
  studyMsForDay,
  submitDailyReport,
  toggleStudy,
} from "../dist/game.js";

const at = (hour, minute, day = 18) => new Date(2026, 6, day, hour, minute, 0, 0);
const date = localDateKey(at(9, 0));

let state = initialStudyState(at(8, 50));
assert.equal(findPendingCheckIn(state, at(8, 54)), undefined);
state = reconcileStudyState(state, at(8, 55)).state;
assert.equal(findPendingCheckIn(state, at(8, 55))?.slot, "09:00");

const checked = checkIn(state, at(9, 3));
assert.equal(checked.accepted, true);
assert.equal(checked.slot, "09:00");
state = checked.state;
assert.equal(state.days[date]?.checkIns["09:00"]?.status, "checked");

const afterDeadline = reconcileStudyState(state, at(12, 6));
assert.equal(afterDeadline.state.days[date]?.checkIns["12:00"]?.status, "missed");
assert.deepEqual(afterDeadline.newlyMissed, ["12:00"]);
state = afterDeadline.state;

const started = toggleStudy(state, at(9, 10));
assert.equal(started.changed, true);
assert.equal(started.isStudying, true);
const stopped = toggleStudy(started.state, at(10, 40));
assert.equal(stopped.isStudying, false);
assert.equal(studyMsForDay(stopped.state, date, at(10, 40)), 90 * 60_000);
state = stopped.state;

state = toggleStudy(state, at(13, 0)).state;
state = toggleStudy(state, at(13, 30)).state;
assert.equal(studyMsForDay(state, date, at(13, 30)), 120 * 60_000);

state = submitDailyReport(state, {
  problemCount: 42,
  note: "完成了一套练习",
  selfCompleted: true,
  friendCompleted: true,
}, at(21, 2));
assert.equal(state.days[date]?.report?.bookmark, "together");
assert.equal(toggleStudy(state, at(21, 20)).messageKey, "day-closed");

const summaries = daySummaries(state, at(21, 20));
assert.equal(summaries[0]?.studyMs, 120 * 60_000);
assert.equal(summaries[0]?.report?.problemCount, 42);
const stats = calculateStats(state, at(21, 20));
assert.equal(stats.totalProblems, 42);
assert.equal(stats.togetherBookmarks, 1);
assert.equal(stats.currentTogetherStreak, 1);

let overnight = initialStudyState(at(23, 50));
overnight = toggleStudy(overnight, at(23, 50)).state;
const rolled = reconcileStudyState(overnight, at(0, 10, 19)).state;
assert.equal(studyMsForDay(rolled, localDateKey(at(23, 50)), at(0, 10, 19)), 10 * 60_000);
assert.equal(studyMsForDay(rolled, localDateKey(at(0, 10, 19)), at(0, 10, 19)), 10 * 60_000);

console.log("Xiaolu study-state tests passed.");
