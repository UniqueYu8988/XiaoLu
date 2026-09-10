import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const preview = join(root, "tmp", "pdfs", "manual-preview");
const renderer = join(preview, "renderer");

const yuReaderSnapshot = {
  date: "2026-09-10",
  learningSeconds: 12_480,
  reading: { actual: 18_900, target: 18_000, percent: 105 },
  questions: { actual: 96, target: 110, percent: 87.3 },
  vocabularyCount: 160,
  vocabularyTarget: 100,
  subjects: {
    medicine: { percent: 92, readingPercent: 108, questionsPercent: 76 },
    english: { percent: 70, readingPercent: 80, questionsPercent: 60 },
    politics: { percent: 81, readingPercent: 72, questionsPercent: 90 },
  },
  oralReviewCompleted: true,
  mistakeReviewCompleted: true,
  pageOpen: true,
  pageVisible: true,
  studyState: "learning",
  pauseReason: "none",
  currentView: "reader",
  lastMeaningfulActivityAt: "2026-09-10T20:58:00+08:00",
  syncedAt: "2026-09-10T21:00:00+08:00",
};

const demoState = {
  version: 2,
  now: "2026-09-10T21:00:00+08:00",
  date: "2026-09-10",
  isStudying: false,
  activeSessionStartedAt: null,
  persistentAnimation: "idle",
  pendingCheckIn: null,
  today: {
    date: "2026-09-10",
    studyMs: 12_480_000,
    checkIns: [
      { slot: "09:00", status: "checked" }, { slot: "12:00", status: "checked" },
      { slot: "15:00", status: "checked" }, { slot: "18:00", status: "checked" },
      { slot: "21:00", status: "pending" },
    ],
    tasks: [
      { id: "task-1", title: "整理下一周的阅读清单", createdAt: "2026-09-10T09:10:00+08:00" },
      { id: "task-2", title: "把想到的新功能记下来", createdAt: "2026-09-10T09:12:00+08:00", completedAt: "2026-09-10T18:20:00+08:00" },
      { id: "task-3", title: "周末归档资料", createdAt: "2026-09-10T09:14:00+08:00", recurringTaskId: "daily-1" },
    ],
    goals: { readingPercent: 121, questionsPercent: 107.3, overallPercent: 118.2, studyCompletedAt: "2026-09-10T20:20:00+08:00", secondStudyCompletedAt: "2026-09-10T20:45:00+08:00", togetherCompletedAt: "2026-09-10T20:45:00+08:00" },
    report: { submittedAt: "2026-09-10T21:01:00+08:00", problemCount: 96, note: "", vocabularyCount: 160, overallProgress: 118.2, readingPercent: 121, questionsPercent: 107.3, oralReviewCompleted: true, mistakeReviewCompleted: true, bookmark: "together" },
    yuReader: yuReaderSnapshot,
  },
  automaticGoals: { studyMinutes: 180, secondStudyMinutes: 240, updatedAt: "2026-09-01T09:00:00+08:00" },
  bounties: {},
  history: [
    { date: "2026-09-10", studyMs: 12_480_000, checkedCount: 5, taskCount: 3, completedTaskCount: 1, goals: { readingPercent: 121, questionsPercent: 107.3 }, yuReader: yuReaderSnapshot, report: { note: "把最难开始的一段稳稳走完了。", vocabularyCount: 160, overallProgress: 118.2, readingPercent: 121, questionsPercent: 107.3 } },
    { date: "2026-09-09", studyMs: 10_860_000, checkedCount: 4, taskCount: 2, completedTaskCount: 2, goals: { readingPercent: 96, questionsPercent: 102 }, report: { note: "今天读完了计划里的章节。", vocabularyCount: 120, overallProgress: 101, readingPercent: 96, questionsPercent: 102 } },
    { date: "2026-09-08", studyMs: 8_340_000, checkedCount: 5, taskCount: 4, completedTaskCount: 3, goals: { readingPercent: 84, questionsPercent: 91 }, report: { note: "节奏不快，但一直在向前。", vocabularyCount: 100, overallProgress: 96.5, readingPercent: 84, questionsPercent: 91 } },
    { date: "2026-09-07", studyMs: 13_020_000, checkedCount: 5, taskCount: 2, completedTaskCount: 2, goals: { readingPercent: 112, questionsPercent: 106 }, report: { note: "认真完成以后，晚上也轻松了一点。", vocabularyCount: 180, overallProgress: 123, readingPercent: 112, questionsPercent: 106 } },
    { date: "2026-09-06", studyMs: 7_200_000, checkedCount: 3, taskCount: 1, completedTaskCount: 0, goals: { readingPercent: 70, questionsPercent: 62 }, report: { note: "休息好，明天再继续。", vocabularyCount: 80, overallProgress: 77, readingPercent: 70, questionsPercent: 62 } },
  ],
  stats: { totalStudyMs: 68 * 60 * 60 * 1000 + 24 * 60 * 1000, checkedCount: 74, togetherBookmarks: 18, selfBountyBookmarks: 22, giftBountyBookmarks: 20, totalVocabulary: 2860 },
  settings: { launchAtLogin: true, yuReaderIntegration: true, patrolEnabled: true, voiceEnabled: true, voiceVolume: 0.82, studyAnchor: { x: 0.82, y: 0.68 } },
  yuReader: { enabled: true, connected: true, statusAvailable: true, snapshot: yuReaderSnapshot },
};

await rm(preview, { recursive: true, force: true });
await mkdir(renderer, { recursive: true });
await cp(join(root, "dist", "renderer"), renderer, { recursive: true });
await cp(join(root, "dist", "assets"), join(preview, "assets"), { recursive: true });

const mockApi = `
const demoState = ${JSON.stringify(demoState, null, 2)};
const respond = async () => structuredClone(demoState);
window.xiaoluHome = {
  getState: respond,
  hide: () => {},
  toggleStudy: respond,
  checkIn: respond,
  submitReport: respond,
  updateHistoryNote: async (date, note) => {
    const day = demoState.history.find((item) => item.date === date);
    if (day) day.report = { ...(day.report || {}), note };
    return structuredClone(demoState);
  },
  addTask: respond,
  editTask: respond,
  setTaskCompleted: respond,
  setTaskRecurring: respond,
  deleteTask: respond,
  setBounty: respond,
  setAutomaticGoals: respond,
  setLaunchAtLogin: respond,
  setYuQuizIntegration: respond,
  setPatrolEnabled: respond,
  setVoiceEnabled: respond,
  setVoiceVolume: respond,
  previewVoice: respond,
  setStudyAnchor: respond,
  onView: () => {},
  onAction: () => {},
  onState: () => {},
};
`;
await writeFile(join(renderer, "manual-mock.js"), mockApi, "utf8");

const htmlPath = join(renderer, "panel.html");
const html = await readFile(htmlPath, "utf8");
await writeFile(htmlPath, html.replace('<script src="panel.js"></script>', '<script src="manual-mock.js"></script>\n    <script src="panel.js"></script>'), "utf8");

console.log(join(renderer, "panel.html"));
