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
  markStudyLaunchAvailable,
  markStudyLaunchPrompted,
  normalizeStudyState,
  reconcileStudyState,
  setAutomaticGoalTargets,
  setDailyTaskCompleted,
  setDailyTaskRecurring,
  setYuQuizIntegration,
  setPatrolEnabled,
  setPetPosition,
  setStudyAnchor,
  setVoiceEnabled,
  setVoiceVolume,
  saveYuQuizSnapshot,
  saveYuQuizNoteTotals,
  snoozeStudyLaunch,
  beginStudyLaunchRitual,
  completeStudyLaunch,
  skipStudyLaunch,
  studyLaunchPeriodAt,
  strictStudyPeriodAt,
  supervisionTierForElapsed,
  studyMsForDay,
  submitDailyReport,
  toggleStudy,
  updateDailyReportNote,
} from "../dist/game.js";

const at = (hour, minute, day = 18) => new Date(2026, 6, day, hour, minute, 0, 0);
const date = localDateKey(at(9, 0));

assert.equal(studyLaunchPeriodAt(at(8, 59)), undefined);
assert.equal(studyLaunchPeriodAt(at(9, 0)), "morning");
assert.equal(studyLaunchPeriodAt(at(11, 59)), "morning");
assert.equal(studyLaunchPeriodAt(at(12, 0)), undefined);
assert.equal(studyLaunchPeriodAt(at(15, 0)), "afternoon");
assert.equal(studyLaunchPeriodAt(at(18, 0)), "evening");
assert.equal(studyLaunchPeriodAt(at(21, 0)), undefined);
assert.equal(strictStudyPeriodAt(at(9, 4)), undefined);
assert.equal(strictStudyPeriodAt(at(9, 5))?.period, "morning");
assert.equal(strictStudyPeriodAt(at(11, 59))?.period, "morning");
assert.equal(strictStudyPeriodAt(at(12, 0)), undefined);
assert.equal(strictStudyPeriodAt(at(15, 4)), undefined);
assert.equal(strictStudyPeriodAt(at(15, 5))?.period, "afternoon");
assert.equal(strictStudyPeriodAt(at(17, 59))?.period, "afternoon");
assert.equal(strictStudyPeriodAt(at(18, 0)), undefined);
assert.equal(supervisionTierForElapsed(-1), "playful");
assert.equal(supervisionTierForElapsed(4 * 60_000 + 59_999), "playful");
assert.equal(supervisionTierForElapsed(5 * 60_000), "firm");
assert.equal(supervisionTierForElapsed(14 * 60_000 + 59_999), "firm");
assert.equal(supervisionTierForElapsed(15 * 60_000), "angry");
assert.equal(supervisionTierForElapsed(29 * 60_000 + 59_999), "angry");
assert.equal(supervisionTierForElapsed(30 * 60_000), "final");

let launchState = initialStudyState(at(8, 0));
launchState = markStudyLaunchAvailable(launchState, "morning", at(8, 0));
launchState = markStudyLaunchPrompted(launchState, "morning", false, at(8, 5));
launchState = snoozeStudyLaunch(launchState, "morning", at(8, 15), at(8, 5));
launchState = markStudyLaunchPrompted(launchState, "morning", true, at(8, 14));
assert.equal(launchState.days[date]?.studyLaunches.morning?.reminderCount, 2);
launchState = beginStudyLaunchRitual(launchState, "morning", "prompt", at(8, 15));
assert.equal(launchState.days[date]?.studyLaunches.morning?.finalPromptedAt, undefined);
assert.equal(launchState.days[date]?.studyLaunches.morning?.lastReminderAt, undefined);
assert.equal(launchState.days[date]?.studyLaunches.morning?.reminderCount, undefined);
launchState = completeStudyLaunch(launchState, "morning", "prompt", at(8, 17));
launchState = normalizeStudyState(JSON.parse(JSON.stringify(launchState)), at(8, 17));
const morningLaunch = launchState.days[date]?.studyLaunches.morning;
assert.equal(morningLaunch?.source, "prompt");
assert.equal(morningLaunch?.completedAt, at(8, 17).toISOString());
launchState = skipStudyLaunch(launchState, "afternoon", at(14, 0));
assert.equal(launchState.days[date]?.studyLaunches.afternoon?.skippedAt, at(14, 0).toISOString());

const repairedLaunchState = normalizeStudyState({
  ...initialStudyState(at(15, 0)),
  days: {
    [date]: {
      date,
      sessions: [],
      checkIns: {},
      tasks: [],
      taskReminders: [],
      studyLaunches: {
        afternoon: {
          ritualStartedAt: at(14, 38).toISOString(),
          finalPromptedAt: at(14, 26).toISOString(),
          source: "double-click",
        },
      },
    },
  },
}, at(15, 0));
assert.equal(repairedLaunchState.days[date]?.studyLaunches.afternoon?.finalPromptedAt, undefined);
assert.equal(repairedLaunchState.days[date]?.studyLaunches.afternoon?.ritualStartedAt, at(14, 38).toISOString());

let state = initialStudyState(at(8, 50));
assert.equal(state.settings.voiceEnabled, true);
assert.equal(state.settings.voiceVolume, 0.82);
assert.equal(state.settings.patrolEnabled, true);
state = setVoiceEnabled(state, false, at(8, 51));
state = setVoiceVolume(state, 0.35, at(8, 52));
state = setPatrolEnabled(state, false, at(8, 52));
assert.equal(state.settings.voiceEnabled, false);
assert.equal(state.settings.voiceVolume, 0.35);
assert.equal(state.settings.patrolEnabled, false);
state = setPetPosition(state, { x: 0.03125, y: 0.2875 }, at(8, 52));
assert.deepEqual(state.settings.petPosition, { x: 0.03125, y: 0.2875 });
state = setPetPosition(state, { x: -8, y: 9 }, at(8, 52));
assert.deepEqual(state.settings.petPosition, { x: -0.25, y: 1.25 });
state = setStudyAnchor(state, { x: 0.42, y: 0.36 }, at(8, 52));
assert.deepEqual(state.settings.studyAnchor, { x: 0.42, y: 0.36 });
state = setVoiceEnabled(state, true, at(8, 53));
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

let integratedState = setYuQuizIntegration(state, true, at(14, 0));
integratedState = saveYuQuizSnapshot(integratedState, {
  date,
  todayQuestions: 12,
  todayCorrect: 0,
  todayAccuracy: null,
  todayLearningSeconds: 30 * 60,
  currentView: "quiz",
  isLearning: false,
  activeSession: false,
  syncedAt: at(14, 30).toISOString(),
}, at(14, 30));
assert.equal(studyMsForDay(integratedState, date, at(14, 30)), 150 * 60_000);
integratedState = setYuQuizIntegration(integratedState, false, at(15, 0));
integratedState = toggleStudy(integratedState, at(15, 0)).state;
integratedState = toggleStudy(integratedState, at(15, 30)).state;
assert.equal(studyMsForDay(integratedState, date, at(15, 30)), 180 * 60_000);

state = submitDailyReport(state, {
  problemCount: 42,
  accuracy: 81.5,
  noteEntries: 3,
  noteCharacters: 426,
  note: "完成了一套练习",
  selfCompleted: true,
  friendCompleted: true,
}, at(21, 2));
assert.equal(state.days[date]?.report?.bookmark, "together");
assert.equal(state.days[date]?.report?.accuracy, 81.5);
assert.equal(state.days[date]?.report?.noteEntries, 3);
assert.equal(state.days[date]?.report?.noteCharacters, 426);
assert.equal(toggleStudy(state, at(21, 20)).messageKey, "day-closed");

const summaries = daySummaries(state, at(21, 20));
assert.equal(summaries[0]?.studyMs, 120 * 60_000);
assert.equal(summaries[0]?.report?.problemCount, 42);
const stats = calculateStats(state, at(21, 20));
assert.equal(stats.totalProblems, 42);
assert.equal(stats.togetherBookmarks, 1);
state = updateDailyReportNote(state, date, "后来补写的一句话", at(22, 0));
assert.equal(state.days[date]?.report?.note, "后来补写的一句话");
assert.equal(state.days[date]?.report?.problemCount, 42);

const unknownTimeState = normalizeStudyState({
  ...initialStudyState(at(8, 0)),
  days: {
    [date]: {
      date,
      studyTimeUnknown: true,
      sessions: [],
      checkIns: {},
      tasks: [],
      taskReminders: [],
      studyLaunches: {},
    },
  },
}, at(8, 0));
assert.equal(daySummaries(unknownTimeState, at(8, 0))[0]?.studyTimeUnknown, true);

const authoritativeYuQuizState = normalizeStudyState({
  version: 2,
  days: {
    [date]: {
      date,
      sessions: [],
      checkIns: {},
      tasks: [],
      taskReminders: [],
      yuQuiz: {
        date,
        todayQuestions: 84,
        todayCorrect: 53,
        todayAccuracy: 63.1,
        todayNoteEntries: 4,
        todayNoteCharacters: 518,
        totalNoteEntries: 130,
        totalNoteCharacters: 74880,
        totalNoteFiles: 34,
        todayLearningSeconds: 5596,
        currentView: "home",
        isLearning: false,
        activeSession: false,
        pageOpen: true,
        pageVisible: true,
        studyState: "ready",
        pauseReason: "none",
        aiConsulting: false,
        lastMeaningfulActivityAt: at(23, 35).toISOString(),
        syncedAt: at(23, 40).toISOString(),
      },
      report: {
        submittedAt: at(22, 4).toISOString(),
        problemCount: 47,
        note: "旧日报值",
        selfCompleted: true,
        friendCompleted: true,
      },
    },
  },
  recurringTasks: [],
  bounties: {},
  settings: { launchAtLogin: true, yuQuizIntegration: false, yuQuizEventCursor: 47 },
  lastEvaluatedAt: at(23, 50).toISOString(),
}, at(23, 50));
assert.equal(authoritativeYuQuizState.settings.yuQuizEventCursor, 47);
assert.equal(authoritativeYuQuizState.days[date]?.yuQuiz?.todayQuestions, 84);
assert.equal(authoritativeYuQuizState.days[date]?.yuQuiz?.todayNoteEntries, 4);
assert.equal(authoritativeYuQuizState.days[date]?.yuQuiz?.todayNoteCharacters, 518);
assert.equal(authoritativeYuQuizState.days[date]?.yuQuiz?.totalNoteEntries, 130);
assert.equal(authoritativeYuQuizState.days[date]?.yuQuiz?.totalNoteCharacters, 74880);
assert.equal(authoritativeYuQuizState.days[date]?.yuQuiz?.totalNoteFiles, 34);
assert.equal(authoritativeYuQuizState.days[date]?.yuQuiz?.studyState, "ready");
assert.equal(authoritativeYuQuizState.days[date]?.yuQuiz?.lastMeaningfulActivityAt, at(23, 35).toISOString());
assert.equal(authoritativeYuQuizState.days[date]?.report?.problemCount, 84);
assert.equal(authoritativeYuQuizState.days[date]?.report?.accuracy, 63.1);
assert.equal(authoritativeYuQuizState.days[date]?.report?.noteEntries, 4);
assert.equal(authoritativeYuQuizState.days[date]?.report?.noteCharacters, 518);
assert.equal(daySummaries(authoritativeYuQuizState, at(23, 50))[0]?.problemCount, 84);
assert.equal(calculateStats(authoritativeYuQuizState, at(23, 50)).totalProblems, 84);
assert.equal(calculateStats(authoritativeYuQuizState, at(23, 50)).totalNoteEntries, 130);
assert.equal(calculateStats(authoritativeYuQuizState, at(23, 50)).totalNoteCharacters, 74880);
assert.equal(calculateStats(authoritativeYuQuizState, at(23, 50)).totalNoteFiles, 34);
const noteTotalsState = saveYuQuizNoteTotals({
  ...authoritativeYuQuizState,
  settings: { ...authoritativeYuQuizState.settings, yuQuizIntegration: false },
}, authoritativeYuQuizState.days[date].yuQuiz, at(23, 51));
assert.deepEqual(noteTotalsState.noteTotals, {
  entries: 130,
  characters: 74880,
  files: 34,
  syncedAt: at(23, 40).toISOString(),
});
assert.equal(calculateStats(noteTotalsState, at(23, 51)).totalNoteCharacters, 74880);

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

let goalState = initialStudyState(at(8, 0, 19));
goalState = setAutomaticGoalTargets(goalState, 60, 10, at(8, 1, 19));
goalState = toggleStudy(goalState, at(8, 2, 19)).state;
goalState = toggleStudy(goalState, at(9, 2, 19)).state;
goalState = reconcileStudyState(goalState, at(9, 2, 19)).state;
const goalDate19 = localDateKey(at(9, 2, 19));
assert.ok(goalState.days[goalDate19]?.goals?.studyCompletedAt);
assert.equal(goalState.days[goalDate19]?.goals?.questionsCompletedAt, undefined);
goalState = setYuQuizIntegration(goalState, true, at(9, 3, 19));
goalState = saveYuQuizSnapshot(goalState, {
  date: goalDate19,
  todayQuestions: 10,
  todayCorrect: 8,
  todayAccuracy: 80,
  todayLearningSeconds: 0,
  currentView: "quiz",
  isLearning: true,
  activeSession: true,
  syncedAt: at(9, 4, 19).toISOString(),
}, at(9, 4, 19));
goalState = reconcileStudyState(goalState, at(9, 4, 19)).state;
assert.ok(goalState.days[goalDate19]?.goals?.questionsCompletedAt);
assert.ok(goalState.days[goalDate19]?.goals?.togetherCompletedAt);
let goalStats = calculateStats(goalState, at(9, 4, 19));
assert.equal(goalStats.selfBountyBookmarks, 1);
assert.equal(goalStats.giftBountyBookmarks, 1);
assert.equal(goalStats.togetherBookmarks, 1);
assert.equal(goalStats.completedBounties, 2);
assert.equal(goalStats.completedTasks, 2);

goalState = reconcileStudyState(goalState, at(8, 0, 20)).state;
const goalDate20 = localDateKey(at(8, 0, 20));
assert.equal(goalState.days[goalDate20]?.goals?.studyMinutesTarget, 60);
assert.equal(goalState.days[goalDate20]?.goals?.questionsTarget, 10);
assert.equal(goalState.days[goalDate20]?.goals?.studyCompletedAt, undefined);
goalState = setAutomaticGoalTargets(goalState, 120, 20, at(8, 1, 20));
assert.equal(goalState.automaticGoals.studyMinutes, 120);
assert.equal(goalState.automaticGoals.questions, 20);
assert.equal(goalState.days[goalDate20]?.goals?.studyMinutesTarget, 120);
assert.equal(goalState.days[goalDate19]?.goals?.studyMinutesTarget, 60);

let migratedGoalState = normalizeStudyState({
  version: 2,
  days: {
    [goalDate20]: {
      date: goalDate20,
      sessions: [],
      checkIns: {},
      tasks: [{
        id: `bounty:self:${goalDate20}`,
        title: "旧版手动悬赏",
        createdAt: at(8, 0, 20).toISOString(),
        completedAt: at(9, 0, 20).toISOString(),
        bountySlot: "self",
      }],
      taskReminders: [],
      studyLaunches: {},
    },
  },
  recurringTasks: [],
  bounties: {},
  settings: {},
  lastEvaluatedAt: at(9, 0, 20).toISOString(),
}, at(9, 1, 20));
assert.equal(migratedGoalState.automaticGoals.studyMinutes, 180);
assert.equal(migratedGoalState.automaticGoals.questions, 80);
migratedGoalState = reconcileStudyState(migratedGoalState, at(9, 1, 20)).state;
assert.equal(migratedGoalState.days[goalDate20]?.goals?.questionsCompletedAt, at(9, 0, 20).toISOString());
assert.equal(calculateStats(migratedGoalState, at(9, 1, 20)).selfBountyBookmarks, 1);

let overnight = initialStudyState(at(23, 50));
overnight = toggleStudy(overnight, at(23, 50)).state;
const rolled = reconcileStudyState(overnight, at(0, 10, 19)).state;
assert.equal(studyMsForDay(rolled, localDateKey(at(23, 50)), at(0, 10, 19)), 10 * 60_000);
assert.equal(studyMsForDay(rolled, localDateKey(at(0, 10, 19)), at(0, 10, 19)), 10 * 60_000);

console.log("Xiaolu study-state tests passed.");
