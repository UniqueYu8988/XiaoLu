import assert from "node:assert/strict";

import {
  addDailyTask,
  calculateStats,
  checkIn,
  daySummaries,
  deleteDailyTask,
  editDailyTask,
  findPendingCheckIn,
  initialStudyState,
  localDateKey,
  reconcileStudyState,
  setBountyDefinition,
  setDailyTaskCompleted,
  setDailyTaskRecurring,
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

let taskState = initialStudyState(at(8, 0, 19));
taskState = addDailyTask(taskState, "task-1", " 完成 第一章  ", at(8, 1, 19));
assert.equal(taskState.days[localDateKey(at(8, 1, 19))]?.tasks[0]?.title, "完成 第一章");
taskState = editDailyTask(taskState, "task-1", "完成第二章", at(8, 2, 19));
assert.equal(taskState.days[localDateKey(at(8, 2, 19))]?.tasks[0]?.title, "完成第二章");
taskState = setDailyTaskCompleted(taskState, "task-1", true, at(9, 0, 19));
assert.equal(taskState.days[localDateKey(at(9, 0, 19))]?.tasks[0]?.completedAt, at(9, 0, 19).toISOString());
const taskSummary = daySummaries(taskState, at(9, 1, 19))[0];
assert.equal(taskSummary?.taskCount, 1);
assert.equal(taskSummary?.completedTaskCount, 1);
assert.equal(calculateStats(taskState, at(9, 1, 19)).completedTasks, 1);
taskState = setDailyTaskCompleted(taskState, "task-1", false, at(9, 2, 19));
assert.equal(taskState.days[localDateKey(at(9, 2, 19))]?.tasks[0]?.completedAt, undefined);
taskState = deleteDailyTask(taskState, "task-1", at(9, 3, 19));
assert.equal(taskState.days[localDateKey(at(9, 3, 19))]?.tasks.length, 0);

let recurringState = initialStudyState(at(8, 0, 19));
recurringState = addDailyTask(recurringState, "daily-reading", "阅读一章", at(8, 1, 19));
recurringState = setDailyTaskRecurring(recurringState, "daily-reading", true, "repeat-reading", at(8, 2, 19));
assert.equal(recurringState.recurringTasks[0]?.title, "阅读一章");
recurringState = setDailyTaskCompleted(recurringState, "daily-reading", true, at(20, 0, 19));
recurringState = reconcileStudyState(recurringState, at(8, 0, 20)).state;
const day20 = localDateKey(at(8, 0, 20));
const repeatedDay20 = recurringState.days[day20]?.tasks.find((task) => task.recurringTaskId === "repeat-reading");
assert.equal(repeatedDay20?.title, "阅读一章");
assert.equal(repeatedDay20?.completedAt, undefined);
recurringState = reconcileStudyState(recurringState, at(8, 1, 20)).state;
assert.equal(recurringState.days[day20]?.tasks.filter((task) => task.recurringTaskId === "repeat-reading").length, 1);
recurringState = editDailyTask(recurringState, repeatedDay20.id, "阅读两章", at(8, 2, 20));
assert.equal(recurringState.recurringTasks[0]?.title, "阅读两章");
recurringState = reconcileStudyState(recurringState, at(8, 0, 21)).state;
const day21 = localDateKey(at(8, 0, 21));
const repeatedDay21 = recurringState.days[day21]?.tasks.find((task) => task.recurringTaskId === "repeat-reading");
assert.equal(repeatedDay21?.title, "阅读两章");
recurringState = setDailyTaskRecurring(recurringState, repeatedDay21.id, false, "unused", at(8, 1, 21));
assert.equal(recurringState.recurringTasks.length, 0);
recurringState = reconcileStudyState(recurringState, at(8, 0, 22)).state;
assert.equal(recurringState.days[localDateKey(at(8, 0, 22))]?.tasks.length, 0);

let bountyState = initialStudyState(at(8, 0, 19));
bountyState = setBountyDefinition(bountyState, "self", "晨读二十分钟", at(8, 1, 19));
const bountyDay19 = bountyState.days[localDateKey(at(8, 1, 19))]?.tasks.find((task) => task.bountySlot === "self");
assert.equal(bountyDay19?.title, "晨读二十分钟");
bountyState = setDailyTaskCompleted(bountyState, bountyDay19.id, true, at(8, 30, 19));
bountyState = submitDailyReport(bountyState, {
  problemCount: 0,
  note: "",
  selfCompleted: true,
  friendCompleted: false,
}, at(21, 0, 19));
assert.equal(bountyState.days[localDateKey(at(21, 0, 19))]?.report?.bookmark, undefined);
bountyState = reconcileStudyState(bountyState, at(8, 0, 20)).state;
const bountyDay20 = bountyState.days[localDateKey(at(8, 0, 20))]?.tasks.find((task) => task.bountySlot === "self");
assert.equal(bountyDay20?.title, "晨读二十分钟");
assert.equal(bountyDay20?.completedAt, undefined);
bountyState = editDailyTask(bountyState, bountyDay20.id, "晨读三十分钟", at(8, 1, 20));
assert.equal(bountyState.bounties.self?.title, "晨读三十分钟");
bountyState = setBountyDefinition(bountyState, "gift", "完成一篇阅读训练", at(8, 2, 20));
const giftDay20 = bountyState.days[localDateKey(at(8, 2, 20))]?.tasks.find((task) => task.bountySlot === "gift");
bountyState = setDailyTaskCompleted(bountyState, giftDay20.id, true, at(18, 0, 20));
let bountyStats = calculateStats(bountyState, at(18, 1, 20));
assert.equal(bountyStats.selfBountyBookmarks, 1);
assert.equal(bountyStats.giftBountyBookmarks, 1);
assert.equal(bountyStats.completedBounties, 2);
bountyState = reconcileStudyState(bountyState, at(8, 0, 21)).state;
const bountyDay21 = bountyState.days[localDateKey(at(8, 0, 21))]?.tasks.find((task) => task.bountySlot === "self");
assert.equal(bountyDay21?.title, "晨读三十分钟");
assert.equal(bountyState.days[localDateKey(at(8, 0, 21))]?.tasks.filter((task) => task.bountySlot).length, 2);

let clearedBountyState = initialStudyState(at(9, 0, 19));
clearedBountyState = setBountyDefinition(clearedBountyState, "gift", "今日挑战", at(9, 1, 19));
clearedBountyState = setBountyDefinition(clearedBountyState, "gift", "", at(9, 2, 19));
assert.equal(clearedBountyState.bounties.gift, undefined);
assert.equal(clearedBountyState.days[localDateKey(at(9, 2, 19))]?.tasks.some((task) => task.bountySlot === "gift"), false);
clearedBountyState = reconcileStudyState(clearedBountyState, at(9, 0, 20)).state;
assert.equal(clearedBountyState.days[localDateKey(at(9, 0, 20))]?.tasks.some((task) => task.bountySlot === "gift"), false);

let overnight = initialStudyState(at(23, 50));
overnight = toggleStudy(overnight, at(23, 50)).state;
const rolled = reconcileStudyState(overnight, at(0, 10, 19)).state;
assert.equal(studyMsForDay(rolled, localDateKey(at(23, 50)), at(0, 10, 19)), 10 * 60_000);
assert.equal(studyMsForDay(rolled, localDateKey(at(0, 10, 19)), at(0, 10, 19)), 10 * 60_000);

console.log("Xiaolu study-state tests passed.");
