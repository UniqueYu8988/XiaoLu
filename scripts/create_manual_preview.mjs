import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const preview = join(root, "tmp", "pdfs", "manual-preview");
const renderer = join(preview, "renderer");

const demoState = {
  version: 2,
  now: "2026-08-10T21:05:00+08:00",
  date: "2026-08-10",
  isStudying: false,
  activeSessionStartedAt: null,
  persistentAnimation: "idle",
  pendingCheckIn: null,
  today: {
    date: "2026-08-10",
    studyMs: 2 * 60 * 60 * 1000 + 36 * 60 * 1000,
    checkIns: [
      { slot: "09:00", status: "checked" },
      { slot: "12:00", status: "checked" },
      { slot: "15:00", status: "checked" },
      { slot: "18:00", status: "checked" },
      { slot: "21:00", status: "checked" },
    ],
    tasks: [
      { id: "bounty-gift", title: "完成一组综合练习", createdAt: "2026-08-10T09:00:00+08:00", bountySlot: "gift" },
      { id: "bounty-self", title: "背诵二十个知识点", createdAt: "2026-08-10T09:00:00+08:00", bountySlot: "self" },
      { id: "task-1", title: "复习第一章", createdAt: "2026-08-10T09:10:00+08:00", completedAt: "2026-08-10T11:20:00+08:00", recurringTaskId: "daily-1" },
      { id: "task-2", title: "整理今天的错题", createdAt: "2026-08-10T09:12:00+08:00" },
      { id: "task-3", title: "阅读三十分钟", createdAt: "2026-08-10T09:14:00+08:00", recurringTaskId: "daily-2" },
    ],
    report: {
      submittedAt: "2026-08-10T21:01:00+08:00",
      problemCount: 48,
      note: "完成了两章复习，也把今天的错题整理好了。",
      selfCompleted: true,
      friendCompleted: true,
      bookmark: "together",
    },
    yuQuiz: null,
  },
  bounties: {
    gift: { slot: "gift", title: "完成一组综合练习", updatedAt: "2026-08-01T09:00:00+08:00" },
    self: { slot: "self", title: "背诵二十个知识点", updatedAt: "2026-08-01T09:00:00+08:00" },
  },
  history: [
    { date: "2026-08-10", studyMs: 9360000, checkedCount: 5, bountyCount: 2, completedBountyCount: 0, taskCount: 3, completedTaskCount: 1, problemCount: 48, report: { note: "完成了两章复习，也把今天的错题整理好了。" } },
    { date: "2026-08-09", studyMs: 11460000, checkedCount: 5, bountyCount: 2, completedBountyCount: 2, taskCount: 4, completedTaskCount: 4, problemCount: 62, report: { note: "今天按计划完成了复习，明天继续。" } },
    { date: "2026-08-08", studyMs: 7740000, checkedCount: 4, bountyCount: 2, completedBountyCount: 1, taskCount: 3, completedTaskCount: 2, problemCount: 35, report: { note: "把最难开始的一部分做完了。" } },
    { date: "2026-08-07", studyMs: 10200000, checkedCount: 5, bountyCount: 2, completedBountyCount: 2, taskCount: 3, completedTaskCount: 3, problemCount: 51, report: { note: "完成今日目标。" } },
  ],
  stats: {
    totalStudyMs: 41 * 60 * 60 * 1000 + 18 * 60 * 1000,
    totalProblems: 728,
    checkedCount: 46,
    togetherBookmarks: 11,
    completedTasks: 37,
    completedBounties: 24,
    selfBountyBookmarks: 13,
    giftBountyBookmarks: 11,
  },
  settings: {
    launchAtLogin: true,
    yuQuizIntegration: false,
    patrolEnabled: true,
    voiceEnabled: true,
    voiceVolume: 0.82,
    studyAnchor: { x: 0.82, y: 0.68 },
  },
  yuQuiz: { enabled: false, connected: false, statusAvailable: false, snapshot: null },
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
  addTask: respond,
  editTask: respond,
  setTaskCompleted: respond,
  setTaskRecurring: respond,
  deleteTask: respond,
  setBounty: respond,
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
