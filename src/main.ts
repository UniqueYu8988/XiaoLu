import {
  app,
  BrowserWindow,
  ipcMain,
  Menu,
  net,
  nativeImage,
  powerMonitor,
  screen,
  shell,
  Tray,
  type IpcMainEvent,
} from "electron";
import { existsSync, readFileSync } from "node:fs";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import { dirname, join } from "node:path";
import type { Server } from "node:http";
import { fileURLToPath } from "node:url";

import {
  CHECK_IN_SLOTS,
  addDailyTask,
  calculateStats,
  checkIn,
  daySummaries,
  deleteDailyTask,
  editDailyTask,
  getDay,
  initialStudyState,
  localDateKey,
  markTaskReminderShown,
  markStudyLaunchAvailable,
  markStudyLaunchPrompted,
  normalizeStudyState,
  reconcileStudyState,
  setAutomaticGoalTargets,
  setBountyDefinition,
  setDailyTaskCompleted,
  setDailyTaskRecurring,
  setLaunchAtLogin,
  setPatrolEnabled,
  setPetPosition,
  setStudyAnchor,
  setVoiceEnabled,
  setVoiceVolume,
  setYuReaderIntegration,
  setYuReaderEventCursor,
  saveYuReaderSnapshot,
  calculateYuReaderRewardProgress,
  setYuQuizIntegration,
  setYuQuizEventCursor,
  saveYuQuizSnapshot,
  saveYuQuizNoteTotals,
  syncExternalDiaryTitles,
  skipStudyLaunch,
  snoozeStudyLaunch,
  beginStudyLaunchRitual,
  completeStudyLaunch,
  studyLaunchPeriodAt,
  strictStudyPeriodAt,
  supervisionTierForElapsed,
  studyMsForDay,
  submitDailyReport,
  updateDailyReportNote,
  toggleStudy,
  type CheckInSlot,
  type BountySlot,
  type DailyReport,
  type ReportInput,
  type StudyState,
  type StudyLaunchPeriod,
  type SupervisionTier,
  type YuQuizSnapshot,
  type YuReaderSnapshot,
} from "./game.js";
import { scanExternalDiaryDirectory } from "./external-diary.js";
import { canCheckInWhileStudying, classifyYuReaderPatrol, shouldAutoOpenYuReaderForCheckIn, shouldRepeatStudyForeground, strongSupervisionBlocksPanel, studyForegroundDecision, type StudyForegroundDecision } from "./study-enforcement.js";
import { activateExistingYuQuizTab } from "./windows-browser.js";
import { createYuQuizWakeServer } from "./yuquiz-wakeup.js";
import { parseYuReaderStatus, YUREADER_BASE_URL } from "./yureader.js";

const PET_WINDOW = { width: 128, height: 208 } as const;
const PET_HITBOX = { width: 68, height: 102, bottom: 9 } as const;
const PANEL_WINDOW = { width: 420, height: 680 } as const;
const checkInSlots = new Set<string>(CHECK_IN_SLOTS);
const panelViews = new Set(["today", "tasks", "todos", "history", "stats", "bookmarks", "report"]);
const YUQUIZ_OFFLINE_POLL_MS = 60_000;
const YUQUIZ_IDLE_POLL_MS = 15_000;
const YUQUIZ_LEARNING_POLL_MS = 2_000;
const STUDY_FOREGROUND_REPEAT_MS = 4_000;
const STUDY_LAUNCH_GRACE_MS = 10 * 60_000;
const STUDY_LAUNCH_SNOOZE_MS = 10 * 60_000;
const STUDY_LAUNCH_RITUAL_MS = 5 * 60_000;
const STUDY_LAUNCH_REPEAT_MS = 10 * 60_000;
const YUQUIZ_ACTIVITY_TIMEOUT_MS = 10 * 60_000;
const NIGHT_STROLL_RESUME_MS = 2 * 60_000;
const STUDY_ANCHOR = { x: 0.03125, y: 0.2875 } as const;
const PET_TRAVEL_SPEED = 230;
const PATROL_TRAVEL_SPEED = 115;
const NIGHT_STROLL_SPEED = 72;
const CENTER_ATTENTION_MS = 15_000;
const DRAG_FAILSAFE_MS = 30_000;
const HOURLY_CHATTER_WINDOW_MS = 90_000;
const HOURLY_CHATTER_HOURS = new Map<number, string>([
  [0, "hourly-midnight"],
  [8, "hourly-morning"], [10, "hourly-morning"], [11, "hourly-morning"],
  [13, "hourly-afternoon"], [14, "hourly-afternoon"], [16, "hourly-afternoon"], [17, "hourly-afternoon"],
  [19, "hourly-evening"], [20, "hourly-evening"], [22, "hourly-evening"], [23, "hourly-evening"],
]);
const HOURLY_GROUP_HOURS = new Map<string, readonly number[]>([
  ["hourly-midnight", [0]],
  ["hourly-morning", [8, 10, 11]],
  ["hourly-afternoon", [13, 14, 16, 17]],
  ["hourly-evening", [19, 20, 22, 23]],
]);

type CatalogVoice = {
  readonly id: string;
  readonly group: string;
  readonly message: string;
  readonly animation: string;
};

const runtimeDirectory = dirname(fileURLToPath(import.meta.url));
const runtimeVoiceDirectory = join(runtimeDirectory, "assets", "voice");
const hourlyChatter = loadVoiceCatalog("hourly-v1.5.json");
const functionalVoices = loadVoiceCatalog("functional-v1.5.json");

function loadVoiceCatalog(fileName: string): readonly CatalogVoice[] {
  try {
    const payload = JSON.parse(readFileSync(join(runtimeVoiceDirectory, fileName), "utf8")) as unknown;
    if (!isRecord(payload) || !Array.isArray(payload.entries)) return [];
    return payload.entries.filter((entry): entry is CatalogVoice => isRecord(entry)
      && typeof entry.id === "string"
      && typeof entry.group === "string"
      && typeof entry.message === "string"
      && typeof entry.animation === "string");
  } catch {
    return [];
  }
}

function functionalVoicePool(group: string): readonly VoiceVariant[] {
  return functionalVoices
    .filter((entry) => entry.group === group)
    .map((entry) => ({ voice: entry.id, message: entry.message, animation: entry.animation }));
}

function pairedVoiceVariants(messages: readonly string[], voices: readonly string[], animation: string): readonly VoiceVariant[] {
  return Array.from({ length: Math.min(messages.length, voices.length) }, (_, index) => ({
    message: messages[index] ?? "",
    voice: voices[index] ?? "",
    animation,
  }));
}

type VoiceVariant = {
  readonly message: string;
  readonly voice: string;
  readonly animation: string;
};

function voiceVariants(prefix: string, messages: readonly string[], animation: string): readonly VoiceVariant[] {
  return messages.map((message, index) => ({ message, voice: `${prefix}-${index + 1}`, animation }));
}

const voicePools = {
  checkIn: {
    "09:00": ["checkin-09-1", "checkin-09-2", "checkin-09-3"],
    "12:00": ["checkin-12-1", "checkin-12-2", "checkin-12-3"],
    "15:00": ["checkin-15-1", "checkin-15-2", "checkin-15-3"],
    "18:00": ["checkin-18-1", "checkin-18-2", "checkin-18-3"],
    "21:00": ["checkin-21-1", "checkin-21-2", "checkin-21-3"],
  },
  checkInSuccess: ["checkin-success-1", "checkin-success-2", "checkin-success-3"],
  missed: ["checkin-missed-1", "checkin-missed-2", "checkin-missed-3"],
  launchPrompt: ["launch-prompt-1", "launch-prompt-2", "launch-prompt-3"],
  launchSnooze: ["launch-snooze-1", "launch-snooze-2"],
  launchSkip: ["launch-skip-1", "launch-skip-2"],
  launchFinal: ["launch-final-1", "launch-final-2"],
  launchSuccess: ["launch-success-1", "launch-success-2", "launch-success-3"],
  yuQuizSetCompleted: ["yuquiz-set-complete-1", "yuquiz-set-complete-2", "yuquiz-set-complete-3"],
  taskReminder: ["task-reminder-1", "task-reminder-2", "task-reminder-3"],
  taskCompleted: ["task-completed-1", "task-completed-2"],
  allTasksCompleted: ["all-tasks-completed-1"],
  bountySelf: ["bounty-self-1", "bounty-self-2"],
  bountyGift: ["bounty-gift-1", "bounty-gift-2"],
  automaticStudy: ["automatic-study-1", "automatic-study-2", "automatic-study-3"],
  automaticQuestions: ["automatic-questions-1", "automatic-questions-2", "automatic-questions-3"],
  automaticTogether: ["automatic-together-1", "automatic-together-2", "automatic-together-3"],
  oralReviewCompleted: ["oral-review-complete-1", "oral-review-complete-2", "oral-review-complete-3"],
  mistakeReviewCompleted: ["mistake-review-complete-1", "mistake-review-complete-2", "mistake-review-complete-3"],
  settlementSummary: ["settlement-summary-1", "settlement-summary-2", "settlement-summary-3"],
  studyStarted: ["study-started-1", "study-started-2", "study-started-3"],
  studyStopped: ["study-stopped-1", "study-stopped-2", "study-stopped-3"],
} as const;

const lines = {
  checkIn: {
    "09:00": ["早呀，我来啦。你也到位了吗？", "九点啦，一起把今天开个好头吧。", "我已经到位啦，点一下让我知道你也在。"],
    "12:00": ["到中午啦，给我一个“我在”好不好？", "十二点报到，我来看看你还在不在。", "中午这一格，也一起点亮吧。"],
    "15:00": ["我来偷偷看一眼，你还在认真吗？", "三点啦，冒个泡让我看见你吧。", "下午这一程走到哪啦？先报个到。"],
    "18:00": ["六点报到！今天也坚持到这里啦。", "傍晚啦，我来确认一下你还在。", "到六点这一站啦，和我打个招呼吧。"],
    "21:00": ["今天辛苦啦，要不要和我一起收个尾？", "九点啦，今天的努力该收进日记了。", "最后一次报到，然后我们一起结算吧。"],
  },
  checkInSuccess: ["收到，我知道你在啦。", "好，今天这一格也点亮了。", "看见你啦，我们继续。"],
  studyStarted: ["那就开始吧，我陪你。", "专心去吧，结束时再叫我。", "这一段，我们一起认真。"],
  studyStopped: ["这一段收好啦。", "辛苦了，先喘口气也没关系。", "我记下来啦，休息一下吧。"],
  dayClosed: ["今天已经收进日记啦，明天再继续。", "今天结算完成啦，剩下的时间好好休息。"],
  missed: ["这次没等到你，下个时间点见。", "这一格先空着，我们继续往后走。", "刚才的时间点错过啦，下一次记得回应我。"],
  taskAdded: ["写下来啦，我们一件件完成。", "今天要做的事，我替你放好啦。", "好，这一件也加入今天。"],
  taskCompleted: ["划掉一件，做得好。", "这一件完成啦，继续稳稳往前走。", "收到，又认真完成了一件。"],
  allTasksCompleted: ["今天列下的事情都完成啦！", "一件也没有落下，真棒。", "今日任务全部点亮啦。"],
  taskFixed: ["固定好啦，明天我会再放进任务栏。", "记住啦，这件事每天都会回来。", "以后每天，我都替你准备好这一项。"],
  taskUnfixed: ["好，只留在今天，不再每天重复。", "已经取消固定，明天不会自动出现啦。"],
  bountySelf: ["做题目标达成啦，这枚书签是你一道道赢回来的。", "今天的题量攒够啦，你的书签收好。", "做题目标完成，认真做过的每一道都算数。"],
  bountyGift: ["阅读目标达成啦，这枚书签被你一页页认真点亮了。", "今天的阅读进度攒够啦，我替你把书签收好。", "阅读目标完成，这份专注已经好好记下来了。"],
  automaticStudy: [
    "阅读目标达成啦。这枚书签，是你一页一页点亮的。",
    "今天读得很认真呀，阅读书签已经全部恢复颜色啦。",
    "阅读进度到一百啦。我替你把这枚书签好好收起来。",
  ],
  automaticQuestions: [
    "做题目标达成啦。这一枚，是你一道一道赢回来的。",
    "今天的题量攒够啦。第二枚书签也被你拿下了。",
    "你认真做过的每一道都算数。这枚书签，收好哦。",
  ],
  automaticTogether: [
    "今天的综合目标完成啦。双人书签，也被你完整点亮了。",
    "阅读、做题，还有额外的认真，都被你攒到一起啦。双人书签收好。",
    "综合进度到一百啦。嗯，我就知道你今天可以做到。",
  ],
  oralReviewCompleted: [
    "口腔背诵完成啦。今天最难啃的一块，又被你拿下了。",
    "背完啦？好，我帮你在今天这里打上一个勾。",
    "这一轮背诵收好啦。记住的东西，又多了一点。",
  ],
  mistakeReviewCompleted: [
    "错题攻坚完成。那些卡住你的地方，现在都变成你的了。",
    "错题也清干净啦。还不错嘛，今天很稳。",
    "终于把错题抓住啦。这次不许它再偷偷跑掉。",
  ],
  settlementSummary: [
    "今天的数据和这句话，我都替你好好收起来啦。",
    "今天走过的每一步，都在这里。晚安之前，记得夸夸自己。",
    "这一天已经写进日记了。无论结果怎样，我都陪你走到这里啦。",
  ],
  yuQuizSetCompleted: ["这一组收好啦，今天又向前走了一小步。", "这组题完成啦，认真留下了新的痕迹。", "题目一组组做完，今天的努力也亮起来啦。"],
  studyLaunchPrompt: ["先不想学多久。点一下开始，我陪你把开头走过去。", "不用先决定学多久，我们只把计时打开。", "先迈最小的一步吧，我陪你认真十分钟。"],
  studyLaunchSuccess: ["好啦，已经开始了。最难的那一步过去了。", "计时开始啦，接下来交给状态。", "你已经走进学习里了，我就不再催你啦。"],
  studyLaunchReturn: ["刚才的学习还在等你。点一下开始，我们接着来。", "别在门口停太久，我们进去学一点吧。", "再拉你一下：先开始计时，进入状态以后我就安静。"],
} as const;

const supervisionVoices = {
  startPlayful: voiceVariants("patrol-start-playful", [
    "你还没有开始，我可要在这里巡逻啦。",
    "我先跑一圈。等我回来，你会不会已经开始了？",
    "先做一点点也算开始呀。我就在这里等你。",
    "你不叫我停，我就继续跑喽。",
    "我又路过一次。第一题还是没有打开吗？",
    "我都跑到这里啦。你也该往前走一步了。",
    "不用想今天要学多久。现在先开始三分钟。",
    "我去那边看看。回来时，希望能看见你已经开始。",
  ], "waiting"),
  startFirm: voiceVariants("patrol-start-firm", [
    "我已经回来好几次啦。我们先把第一步走出去吧。",
    "不用等状态变好。开始以后，状态会慢慢跟上的。",
    "先打开题目。剩下的事情，我们开始以后再想。",
    "我知道你不是不想学。只是还没有迈出去。",
    "这段时间是我们约好的。我还没有等到你开始。",
    "已经拖得够久啦。现在，先做第一题。",
  ], "waiting"),
  startAngry: voiceVariants("patrol-start-angry", [
    "我真的要生气了。我们约好的学习时间，不是拿来一直拖延的。",
    "已经提醒你好几次了。现在，把别的事情放下，打开第一题。",
    "你明明知道，开始以后就能学进去。为什么还要一直躲着第一步？",
    "别再看着我跑啦。看题目。现在就开始。",
    "这段时间是我们约好的。我已经等了很久，可你还是没有开始。",
    "我不是来陪你继续拖延的。先坐好，把题目打开。",
    "不要再告诉自己等一会儿。你已经等过很多个一会儿了。",
    "这次我不哄你了。别想今天要学多久，先把第一题做掉。",
  ], "failed"),
  startFinal: voiceVariants("patrol-start-final", [
    "听好。现在打开题目，不要再给拖延找理由。",
    "已经拖得太久了。你答应过的事情，需要认真对待。",
    "我现在真的很生气。先开始学习，再去做其他事情。",
    "不要继续消耗今天了。现在开始，还来得及把时间拿回来。",
    "这不是状态好不好的问题。是你现在愿不愿意迈出第一步。",
    "我会继续在这里盯着你。直到你真正进入学习。",
  ], "waiting"),
  returning: voiceVariants("patrol-return", [
    "休息得差不多啦。我们回来继续吧。",
    "我来接你回去。下一小段，从哪里开始？",
    "刚才那一段已经收好了。现在接着往下走吧。",
    "十五分钟到啦。该从休息里回来喽。",
    "你已经开始过一次了。重新回来，也不会很难。",
    "这一程还没有结束。我来带你回去。",
    "先回来做一点。别让短短的休息，变成长长的拖延。",
    "我又开始巡逻啦。等你重新进入学习，我就停下。",
  ], "review"),
  success: voiceVariants("patrol-success", [
    "好啦，这次是真的开始了。我回去陪你。",
    "已经稳稳开始三分钟啦。接下来交给你。",
    "你已经回到学习里了。我不再到处跑啦。",
  ], "jumping"),
  night: voiceVariants("night-stroll", [
    "今天这一页已经收好啦。我随便走走。",
    "你忙你的。我就在这里待一会儿。",
    "今天也留下了一点，值得记住的东西。",
    "已经九点以后啦。接下来慢慢来就好。",
    "我去那边看看。一会儿再回来。",
    "今天的事情暂时告一段落。桌面借我散散步吧。",
    "我没有在催你。只是想四处走一走。",
    "夜晚安静下来啦。我也慢一点陪着你。",
  ], "idle"),
  nightResume: voiceVariants("night-resume", [
    "这一段也结束啦。那我继续随便走走。",
    "你先休息。我去桌面上转一圈。",
    "学习的时候我安静陪你。现在我又可以散步啦。",
  ], "review"),
} as const;

let petWindow: BrowserWindow | null = null;
let panelWindow: BrowserWindow | null = null;
let tray: Tray | null = null;
let studyState: StudyState = initialStudyState();
let stateFile = "";
let externalDiaryDirectory = "";
let externalDiarySyncInFlight = false;
let lastExternalDiaryScheduledDate = "";
let cursorTimer: NodeJS.Timeout | null = null;
let scheduleTimer: NodeJS.Timeout | null = null;
let stateTimer: NodeJS.Timeout | null = null;
let yuQuizTimer: NodeJS.Timeout | null = null;
let yuQuizWakeServer: Server | null = null;
let yuQuizSyncInFlight = false;
let yuQuizSyncQueued = false;
let dragTimer: NodeJS.Timeout | null = null;
let petTravelTimer: NodeJS.Timeout | null = null;
let dragging: { startX: number; startY: number; windowX: number; windowY: number; lastCursorX: number; startedAt: number } | null = null;
let persistDraggedPositionAsHome = true;
type PetTravelKind = "outbound" | "return" | "attention" | "attention-return-dock" | "attention-return-home" | "patrol" | "stroll" | "roaming-return";
type RoamingMode = "strong-start" | "strong-return" | "night";

let petTravel: {
  kind: PetTravelKind;
  startedAt: number;
  horizontalMs: number;
  verticalMs: number;
  fromX: number;
  fromY: number;
  toX: number;
  toY: number;
} | null = null;
let studyDockHome: { x: number; y: number } | null = null;
let studyDocked = false;
let studyDockSuppressedUntilClose = false;
let petReady = false;
let centerAttentionActive = false;
let centerAttentionTimer: NodeJS.Timeout | null = null;
let centerAttentionArrival: (() => void) | null = null;
let isPetIgnoringMouse = false;
let bubblePromptActive = false;
let bubbleHitbox: { left: number; top: number; width: number; height: number } | null = null;
let activePromptKey: string | null = null;
let activePromptType: "check-in" | "task-reminder" | "study-launch" | null = null;
let activePromptExpiresAt = 0;
let lastDragDirection: "left" | "right" = "right";
let isQuitting = false;
let persistQueue = Promise.resolve();
let nextSettlementActionAt = 0;
let settlementDate = "";
let pendingAutomaticGoalAwards: Array<"study" | "questions" | "together"> = [];
let yuQuizRuntime: { connected: boolean; statusAvailable: boolean; error?: string; snapshot?: YuReaderSnapshot } = { connected: false, statusAvailable: false };
let yuQuizEventsInitialized = false;
let yuQuizAutoSuppressed = false;
let yuQuizStatusBubble = "";
let studyLaunchStatusBubble = "";
let lastEffectiveStudyAt = 0;
let wasEffectivelyStudying = false;
let lastForcedYuQuizInterventionKey = "";
let lastForcedYuQuizInterventionAt = 0;
let lastCheckInAutoOpenKey = "";
let yuReaderOpenInFlight: Promise<boolean> | null = null;
let roamingMode: RoamingMode | null = null;
let roamingTimer: NodeJS.Timeout | null = null;
let lastHourlyChatterKey = "";
let roamingEscalationStartedAt = 0;
let roamingHome: { x: number; y: number } | null = null;
let checkInPausedHome: { x: number; y: number } | null = null;
let nightStrollHasStarted = false;
let nightStrollDate = "";
let strongPatrolSuppressedKey = "";
const studiedStrictPeriods = new Set<string>();
const lastLineByPool = new Map<string, string>();
const lastVoiceByPool = new Map<string, string>();
const lastVariantByPool = new Map<string, string>();

if (process.platform === "win32") app.commandLine.appendSwitch("disable-features", "CalculateNativeWinOcclusion");
app.commandLine.appendSwitch("autoplay-policy", "no-user-gesture-required");
app.setPath("userData", join(app.getPath("appData"), "xiaolu-desktop-pet"));

const singleInstance = app.requestSingleInstanceLock();
if (!singleInstance) app.quit();

app.on("second-instance", () => {
  showPanel();
});

app.whenReady().then(async () => {
  app.setAppUserModelId("dev.xiaolu.study-mate");
  stateFile = join(app.getPath("userData"), "xiaolu-study-state.json");
  studyState = await loadState();
  externalDiaryDirectory = await loadExternalDiaryDirectory();
  await syncExternalDiaryFromDisk(false);
  studyState = reconcileStudyState(studyState).state;
  applyLoginSetting();
  installIpc();
  createPetWindow();
  createTray();
  startBackgroundLoops();
  scheduleYuQuizSync(0);
  await persistState();
  screen.on("display-metrics-changed", keepPetOnPrimaryDisplay);
  screen.on("display-removed", keepPetOnPrimaryDisplay);
  powerMonitor.on("resume", () => void evaluateSchedule(true));
});

app.on("activate", () => {
  if (!petWindow || petWindow.isDestroyed()) createPetWindow();
  else petWindow.showInactive();
});

app.on("window-all-closed", () => {
  // Tray-first application: closing the diary does not stop reminders.
});

app.on("before-quit", () => {
  isQuitting = true;
  if (cursorTimer) clearInterval(cursorTimer);
  if (scheduleTimer) clearInterval(scheduleTimer);
  if (stateTimer) clearInterval(stateTimer);
  if (yuQuizTimer) clearTimeout(yuQuizTimer);
  if (centerAttentionTimer) clearTimeout(centerAttentionTimer);
  if (roamingTimer) clearTimeout(roamingTimer);
  cancelPetTravel();
  yuQuizWakeServer?.close();
  stopDragging();
});

function createPetWindow(): void {
  const display = screen.getPrimaryDisplay();
  const savedPosition = studyState.settings.petPosition;
  const x = savedPosition
    ? display.workArea.x + Math.round(display.workArea.width * savedPosition.x)
    : display.workArea.x + display.workArea.width - PET_WINDOW.width - 36;
  const y = savedPosition
    ? display.workArea.y + Math.round(display.workArea.height * savedPosition.y)
    : display.workArea.y + display.workArea.height - PET_WINDOW.height - 20;
  petWindow = new BrowserWindow({
    title: "共学日记",
    width: PET_WINDOW.width,
    height: PET_WINDOW.height,
    x,
    y,
    transparent: true,
    frame: false,
    thickFrame: false,
    resizable: false,
    hasShadow: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    fullscreenable: false,
    show: false,
    backgroundColor: "#00000000",
    icon: join(app.getAppPath(), "dist", "assets", "icons", "app-icon-256.png"),
    webPreferences: {
      preload: join(app.getAppPath(), "dist", "preload", "pet.cjs"),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      webSecurity: true,
    },
  });
  petWindow.setAlwaysOnTop(true, "screen-saver");
  petWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  petWindow.setMenu(null);
  hardenWindow(petWindow);
  petWindow.on("closed", () => {
    stopDragging();
    cancelPetTravel();
    centerAttentionActive = false;
    centerAttentionArrival = null;
    petReady = false;
    petWindow = null;
    isPetIgnoringMouse = false;
  });
  petWindow.on("blur", () => {
    if (dragging) stopDragging(true);
  });
  petWindow.webContents.on("did-finish-load", () => {
    if (!petWindow || petWindow.isDestroyed()) return;
    petWindow.setContentBounds({ x, y, width: PET_WINDOW.width, height: PET_WINDOW.height }, false);
    petWindow.showInactive();
    petReady = true;
    syncPetMousePassthrough();
    sendState();
    void evaluateSchedule(false);
    handleYuQuizDocking(yuQuizRuntime.snapshot);
  });
  void petWindow.loadFile(join(app.getAppPath(), "dist", "renderer", "pet.html"));
}

function createPanelWindow(): BrowserWindow {
  if (panelWindow && !panelWindow.isDestroyed()) return panelWindow;
  panelWindow = new BrowserWindow({
    title: "共学日记",
    width: PANEL_WINDOW.width,
    height: PANEL_WINDOW.height,
    frame: false,
    transparent: true,
    resizable: false,
    maximizable: false,
    fullscreenable: false,
    show: false,
    backgroundColor: "#00000000",
    icon: join(app.getAppPath(), "dist", "assets", "icons", "app-icon-256.png"),
    webPreferences: {
      preload: join(app.getAppPath(), "dist", "preload", "panel.cjs"),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      webSecurity: true,
    },
  });
  panelWindow.setMenu(null);
  hardenWindow(panelWindow);
  panelWindow.on("close", (event) => {
    if (!isQuitting) {
      event.preventDefault();
      hidePanel();
    }
  });
  panelWindow.on("closed", () => { panelWindow = null; });
  panelWindow.webContents.on("did-finish-load", sendState);
  void panelWindow.loadFile(join(app.getAppPath(), "dist", "renderer", "panel.html"));
  return panelWindow;
}

function showPanel(view = "today"): void {
  if (strongSupervisionBlocksPanel(roamingMode)) {
    panelWindow?.hide();
    petWindow?.showInactive();
    emitAction("waiting", "现在不能躲进菜单哦。先回到学习，我会继续陪着你。", undefined, 2_400);
    return;
  }
  const window = createPanelWindow();
  if (roamingMode) stopRoaming(false, false);
  petWindow?.hide();
  const display = screen.getPrimaryDisplay();
  const x = display.workArea.x + display.workArea.width - PANEL_WINDOW.width - 28;
  const y = Math.max(display.workArea.y + 20, display.workArea.y + display.workArea.height - PANEL_WINDOW.height - 28);
  window.setPosition(x, y);
  window.show();
  window.moveTop();
  window.focus();
  sendState();
  window.webContents.send("xiaolu:view", view);
}

function hidePanel(): void {
  panelWindow?.hide();
  petWindow?.showInactive();
  void evaluateSchedule(false);
}

function createTray(): void {
  const icon = nativeImage.createFromPath(join(app.getAppPath(), "dist", "assets", "icons", "tray-icon-32.png"));
  tray = new Tray(icon);
  tray.setToolTip("共学日记");
  refreshTrayMenu();
  tray.on("double-click", () => showPanel());
}

function refreshTrayMenu(): void {
  if (!tray) return;
  const strictPeriod = strictStudyPeriodAt(new Date());
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: "打开共学日记", click: () => showPanel() },
    { label: studyState.activeSessionStartedAt ? "结束本段学习" : "开始学习", click: () => void performToggleStudy() },
    { type: "separator" },
    {
      label: "开机自动启动",
      type: "checkbox",
      checked: studyState.settings.launchAtLogin,
      click: (item) => void updateLaunchAtLogin(item.checked),
    },
    { label: "显示小鹿", click: () => petWindow?.showInactive() },
    { label: "暂时隐藏", click: () => petWindow?.hide() },
    ...(strictPeriod && studyState.settings.patrolEnabled ? [{
      label: "暂停本时段强监督",
      type: "checkbox" as const,
      checked: strongPatrolSuppressedKey === strictPeriod.key,
      click: (item: Electron.MenuItem) => {
        strongPatrolSuppressedKey = item.checked ? strictPeriod.key : "";
        if (item.checked && roamingMode?.startsWith("strong")) stopRoaming(false);
        void evaluateSchedule(false);
      },
    }] : []),
    { type: "separator" },
    { label: "退出（提醒也会停止）", click: () => { isQuitting = true; app.quit(); } },
  ]));
}

function installIpc(): void {
  ipcMain.handle("xiaolu:get-state", (event) => {
    assertTrustedSender(event);
    return publicState();
  });
  ipcMain.handle("xiaolu:toggle-study", async (event) => {
    assertTrustedSender(event);
    return performToggleStudy();
  });
  ipcMain.handle("xiaolu:pet-double-click", async (event) => {
    assertTrustedSender(event);
    return performPetDoubleClick();
  });
  ipcMain.handle("xiaolu:prompt-action", async (event, promptId: unknown, action: unknown) => {
    assertTrustedSender(event);
    if (typeof promptId !== "string" || typeof action !== "string") return publicState();
    return performPromptAction(promptId, action);
  });
  ipcMain.handle("xiaolu:check-in", async (event, slot: unknown) => {
    assertTrustedSender(event);
    const requested = typeof slot === "string" && checkInSlots.has(slot) ? slot as CheckInSlot : undefined;
    return performCheckIn(requested);
  });
  ipcMain.handle("xiaolu:submit-report", async (event, value: unknown) => {
    assertTrustedSender(event);
    return performReport(value);
  });
  ipcMain.handle("xiaolu:update-history-note", async (event, date: unknown, note: unknown) => {
    assertTrustedSender(event);
    if (typeof date !== "string" || typeof note !== "string") throw new Error("日记内容格式不正确。");
    studyState = updateDailyReportNote(studyState, date, note, new Date());
    await persistState();
    sendState();
    return publicState("这句话已经替你收好了。");
  });
  ipcMain.handle("xiaolu:add-task", async (event, title: unknown) => {
    assertTrustedSender(event);
    if (typeof title !== "string") throw new Error("任务内容格式不正确。");
    return performAddTask(title);
  });
  ipcMain.handle("xiaolu:set-bounty", async (event, slot: unknown, title: unknown) => {
    assertTrustedSender(event);
    if ((slot !== "self" && slot !== "gift") || typeof title !== "string") throw new Error("悬赏内容格式不正确。");
    return performSetBounty(slot, title);
  });
  ipcMain.handle("xiaolu:set-automatic-goals", async (event, studyMinutes: unknown, secondStudyMinutes: unknown) => {
    assertTrustedSender(event);
    if (typeof studyMinutes !== "number" || typeof secondStudyMinutes !== "number") throw new Error("目标数值格式不正确。");
    studyState = setAutomaticGoalTargets(studyState, studyMinutes, secondStudyMinutes, new Date());
    await persistState();
    sendState();
    emitAction("review", "目标记好啦。达到以后，我会自动把书签收进收藏。", "◆", 1_650);
    return publicState();
  });
  ipcMain.handle("xiaolu:edit-task", async (event, id: unknown, title: unknown) => {
    assertTrustedSender(event);
    if (typeof id !== "string" || typeof title !== "string") throw new Error("任务内容格式不正确。");
    return performEditTask(id, title);
  });
  ipcMain.handle("xiaolu:set-task-completed", async (event, id: unknown, completed: unknown) => {
    assertTrustedSender(event);
    if (typeof id !== "string" || typeof completed !== "boolean") throw new Error("任务状态格式不正确。");
    return performSetTaskCompleted(id, completed);
  });
  ipcMain.handle("xiaolu:set-task-recurring", async (event, id: unknown, recurring: unknown) => {
    assertTrustedSender(event);
    if (typeof id !== "string" || typeof recurring !== "boolean") throw new Error("固定任务状态格式不正确。");
    return performSetTaskRecurring(id, recurring);
  });
  ipcMain.handle("xiaolu:delete-task", async (event, id: unknown) => {
    assertTrustedSender(event);
    if (typeof id !== "string") throw new Error("任务编号格式不正确。");
    return performDeleteTask(id);
  });
  ipcMain.handle("xiaolu:set-launch-at-login", async (event, enabled: unknown) => {
    assertTrustedSender(event);
    if (typeof enabled !== "boolean") throw new Error("启动设置格式不正确。");
    await updateLaunchAtLogin(enabled);
    return publicState();
  });
  ipcMain.handle("xiaolu:set-yuquiz-integration", async (event, enabled: unknown) => {
    assertTrustedSender(event);
    if (typeof enabled !== "boolean") throw new Error("YuReader 联动设置格式不正确。");
    studyState = setYuReaderIntegration(studyState, enabled, new Date());
    if (!enabled) {
      yuQuizRuntime = { connected: false, statusAvailable: false };
      handleYuQuizDocking(undefined);
    } else {
      scheduleYuQuizSync(0);
    }
    await persistState();
    sendState();
    return publicState(enabled ? "已经和 YuReader 接上啦。" : "好，先按普通日程模式陪你。");
  });
  ipcMain.handle("xiaolu:set-patrol-enabled", async (event, enabled: unknown) => {
    assertTrustedSender(event);
    if (typeof enabled !== "boolean") throw new Error("巡逻设置格式不正确。");
    studyState = setPatrolEnabled(studyState, enabled, new Date());
    if (!enabled && roamingMode) stopRoaming(false);
    await persistState();
    sendState();
    refreshTrayMenu();
    if (enabled) void evaluateSchedule(false);
    return publicState();
  });
  ipcMain.handle("xiaolu:set-study-anchor", async (event) => {
    assertTrustedSender(event);
    return performSetStudyAnchor();
  });
  ipcMain.handle("xiaolu:set-voice-enabled", async (event, enabled: unknown) => {
    assertTrustedSender(event);
    if (typeof enabled !== "boolean") throw new Error("语音设置格式不正确。");
    studyState = setVoiceEnabled(studyState, enabled, new Date());
    await persistState();
    sendState();
    return publicState();
  });
  ipcMain.handle("xiaolu:set-voice-volume", async (event, volume: unknown) => {
    assertTrustedSender(event);
    if (typeof volume !== "number" || !Number.isFinite(volume)) throw new Error("音量设置格式不正确。");
    studyState = setVoiceVolume(studyState, volume, new Date());
    await persistState();
    sendState();
    return publicState();
  });
  ipcMain.handle("xiaolu:preview-voice", (event) => {
    assertTrustedSender(event);
    if (!studyState.settings.voiceEnabled) return publicState("先打开“小鹿语音”，再点她试试吧。");
    const previews = [
      { voice: "checkin-09-1", animation: "waving", message: "早呀，我已经到位啦。你也到位了吗？" },
      { voice: "checkin-15-2", animation: "jumping", message: "啊，三点了。下午这一程走到哪里啦？" },
      { voice: "launch-prompt-3", animation: "waiting", message: "我抓到你还没有开始啦。我们先走到第一题，好不好？" },
      { voice: "launch-success-3", animation: "jumping", message: "我就知道你可以开始。好啦，我不再催你了。" },
      { voice: "patrol-start-angry-1", animation: "failed", message: "我真的要生气了。我们约好的学习时间，不是拿来一直拖延的。" },
      { voice: "patrol-start-final-1", animation: "waiting", message: "听好。现在打开题目，不要再给拖延找理由。" },
      { voice: "yuquiz-set-complete-3", animation: "jumping", message: "一组题做完啦。快看一眼自己的成果吧。" },
      { voice: "all-tasks-completed-1", animation: "jumping", message: "今天列下的事情都完成啦。真的一件也没有落下！" },
      { voice: "bounty-gift-2", animation: "review", message: "又替她赢下一枚。今天的努力，也有了可以留下的样子。" },
      { voice: "study-stopped-2", animation: "review", message: "我记下来啦。休息一下，也没有关系。" },
      ...hourlyChatter.map((entry) => ({ voice: entry.id, animation: entry.animation, message: entry.message })),
      ...functionalVoices
        .filter((entry) => ["task-completed-extra", "all-tasks-completed-extra", "yuquiz-set-complete-extra"].includes(entry.group))
        .map((entry) => ({ voice: entry.id, animation: entry.animation, message: entry.message })),
    ] as const;
    const previous = lastVoiceByPool.get("voicePreview");
    const candidates = previews.filter((item) => item.voice !== previous);
    const selected = candidates[Math.floor(Math.random() * candidates.length)] ?? previews[0];
    lastVoiceByPool.set("voicePreview", selected.voice);
    emitAction(selected.animation, selected.message, selected.animation === "jumping" ? "✦" : undefined, 1_900, selected.voice);
    return publicState();
  });
  ipcMain.on("xiaolu:open-panel", (event, requestedView: unknown) => {
    assertTrustedSender(event);
    const view = typeof requestedView === "string" && panelViews.has(requestedView) ? requestedView : "today";
    if (activePromptType === "task-reminder") clearActivePrompt();
    showPanel(view);
  });
  ipcMain.on("xiaolu:bubble-bounds", (event, value: unknown) => {
    if (!petWindow || event.sender !== petWindow.webContents) return;
    bubbleHitbox = normalizeWindowBounds(value);
    syncPetMousePassthrough();
  });
  ipcMain.on("xiaolu:hide-panel", (event) => { assertTrustedSender(event); hidePanel(); });
  ipcMain.on("xiaolu:drag-start", (event, point: unknown) => {
    if (!petWindow || event.sender !== petWindow.webContents || !isPoint(point)) return;
    const yuQuizSnapshot = yuQuizRuntime.snapshot;
    persistDraggedPositionAsHome = yuQuizSnapshot?.studyState === "closed" || yuQuizSnapshot?.pageOpen !== true;
    if (centerAttentionActive || petTravel?.kind === "attention" || petTravel?.kind.startsWith("attention-return")) {
      clearCenterAttentionState();
    }
    if (petTravel || studyDocked) {
      cancelPetTravel();
      studyDocked = false;
      studyDockHome = null;
      if (yuQuizRuntime.snapshot?.pageOpen) studyDockSuppressedUntilClose = true;
    }
    const expanded = petWindow.getContentBounds();
    const visualPetLeft = expanded.x + (expanded.width - PET_HITBOX.width) / 2;
    const visualPetBottom = expanded.y + expanded.height - PET_HITBOX.bottom;
    const repairedX = visualPetLeft - (PET_WINDOW.width - PET_HITBOX.width) / 2;
    const repairedY = visualPetBottom - PET_WINDOW.height + PET_HITBOX.bottom;
    petWindow.setContentBounds({
      x: Math.round(repairedX),
      y: Math.round(repairedY),
      width: PET_WINDOW.width,
      height: PET_WINDOW.height,
    }, false);
    const bounds = petWindow.getContentBounds();
    const cursor = screen.getCursorScreenPoint();
    stopDragging();
    dragging = { startX: cursor.x, startY: cursor.y, windowX: bounds.x, windowY: bounds.y, lastCursorX: cursor.x, startedAt: Date.now() };
    setPetMousePassthrough(false);
    petWindow.webContents.send("xiaolu:drag-direction", lastDragDirection);
    dragTimer = setInterval(() => {
      if (!petWindow || petWindow.isDestroyed() || !dragging) {
        stopDragging();
        return;
      }
      if (Date.now() - dragging.startedAt >= DRAG_FAILSAFE_MS) {
        stopDragging(true);
        return;
      }
      const current = screen.getCursorScreenPoint();
      const deltaX = current.x - dragging.lastCursorX;
      if (Math.abs(deltaX) >= 1) {
        const direction = deltaX < 0 ? "left" : "right";
        if (direction !== lastDragDirection) {
          lastDragDirection = direction;
          petWindow.webContents.send("xiaolu:drag-direction", direction);
        }
      }
      dragging.lastCursorX = current.x;
      movePetWindow(
        dragging.windowX + current.x - dragging.startX,
        dragging.windowY + current.y - dragging.startY,
      );
    }, 16);
    dragTimer.unref?.();
  });
  ipcMain.on("xiaolu:drag-end", (event) => {
    if (!petWindow || event.sender !== petWindow.webContents) return;
    stopDragging();
    if (persistDraggedPositionAsHome) void rememberCurrentPetPosition();
    persistDraggedPositionAsHome = true;
    if (roamingMode) scheduleRoamingStep(2_000);
  });
}

async function performToggleStudy(): Promise<Record<string, unknown>> {
  const now = new Date();
  const wasStudying = Boolean(studyState.activeSessionStartedAt);
  const result = toggleStudy(studyState, now);
  studyState = result.state;
  const period = studyLaunchPeriodAt(now);
  if (!wasStudying && result.messageKey === "started" && period) {
    studyState = completeStudyLaunch(studyState, period, "manual", now);
    if (activePromptType === "study-launch") clearActivePrompt();
    setStudyLaunchStatusBubble("");
  }
  await persistState();
  sendState();
  refreshTrayMenu();
  const stoppedStrongPatrol = Boolean(roamingMode?.startsWith("strong"));
  manageRoaming(now);
  if (result.messageKey === "started") {
    if (!stoppedStrongPatrol) emitPairedAction("studyStarted", "waving", lines.studyStarted, voicePools.studyStarted, "✦", 1_500);
  } else if (result.messageKey === "stopped") {
    emitPairedAction("studyStopped", "review", lines.studyStopped, voicePools.studyStopped, "✓", 1_650);
  } else {
    emitAction("idle", chooseLine("dayClosed", lines.dayClosed), undefined, 1_200);
  }
  return publicState();
}

async function performPetDoubleClick(): Promise<Record<string, unknown>> {
  return performToggleStudy();
}

async function performPromptAction(promptId: string, action: string): Promise<Record<string, unknown>> {
  if (promptId !== activePromptKey || !activePromptType) return publicState("这条提醒已经过去啦。");
  if (centerAttentionActive || petTravel?.kind === "attention") finishCenterAttention();
  if (activePromptType === "check-in" && action === "primary") {
    const slot = promptId.split(":").slice(-2).join(":") as CheckInSlot;
    return performCheckIn(checkInSlots.has(slot) ? slot : undefined);
  }
  if (activePromptType === "task-reminder" && action === "primary") {
    clearActivePrompt();
    showPanel("tasks");
    return publicState();
  }
  if (activePromptType !== "study-launch") return publicState();
  const now = new Date();
  const period = studyLaunchPeriodAt(now);
  if (!period || !promptId.includes(`:launch:${period}:`)) {
    clearActivePrompt();
    return publicState("这一段已经过去啦，我们从下一段重新开始。");
  }
  if (action === "start") return startStudyLaunchRitual(period, "prompt", now);
  if (action === "snooze") {
    studyState = snoozeStudyLaunch(studyState, period, new Date(now.getTime() + STUDY_LAUNCH_SNOOZE_MS), now);
    clearActivePrompt();
    await persistState();
    sendState();
    emitAction("review", "好，十分钟后我再来。先把手边这件事收个尾吧。", undefined, 1_550);
    return publicState();
  }
  if (action === "skip") {
    studyState = skipStudyLaunch(studyState, period, now);
    clearActivePrompt();
    setStudyLaunchStatusBubble("");
    await persistState();
    sendState();
    emitAction("waving", "好，这一段先不催你。下一段见。", undefined, 1_450);
  }
  return publicState();
}

async function startStudyLaunchRitual(period: StudyLaunchPeriod, source: "prompt" | "double-click", now = new Date()): Promise<Record<string, unknown>> {
  studyState = beginStudyLaunchRitual(studyState, period, source, now);
  if (activePromptType === "study-launch") clearActivePrompt();
  const result = toggleStudy(studyState, now);
  studyState = completeStudyLaunch(result.state, period, "manual", now);
  setStudyLaunchStatusBubble("");
  await persistState();
  sendState();
  refreshTrayMenu();
  emitPairedAction("studyStarted", "waving", lines.studyStarted, voicePools.studyStarted, "✦", 1_750);
  return publicState();
}

async function performCheckIn(requested?: CheckInSlot): Promise<Record<string, unknown>> {
  const now = new Date();
  if (!studyState.activeSessionStartedAt && studyState.settings.yuReaderIntegration) await syncYuQuiz(false);
  if (!canCheckInWhileStudying({
    manualSessionActive: Boolean(studyState.activeSessionStartedAt),
    yuReaderState: yuQuizRuntime.snapshot?.studyState,
  })) {
    emitAction("waiting", "先开始这一段学习，再来告诉我你已经到位啦。", "▶", 2_300);
    return publicState("打卡要在学习计时中完成。先双击小鹿开始，或进入 YuReader 的有效学习页面吧。");
  }
  const result = checkIn(studyState, now, requested);
  studyState = result.state;
  if (!result.accepted) return publicState(result.reason === "already-recorded" ? "这一格已经打过卡啦。" : "现在不在打卡时间内。");
  clearActivePrompt();
  await persistState();
  sendState();
  emitPairedAction("checkInSuccess", "waving", lines.checkInSuccess, voicePools.checkInSuccess, "✓", 1_500);
  if (result.shouldOpenReport) setTimeout(() => showPanel("report"), 650);
  return publicState();
}

async function performReport(value: unknown): Promise<Record<string, unknown>> {
  if (!isRecord(value)) throw new Error("今日结算内容格式不正确。");
  if (typeof value.vocabularyCount === "number" && studyState.settings.yuReaderIntegration) {
    await updateYuReaderVocabulary(value.vocabularyCount);
  }
  const date = activeStudyDate();
  const day = getDay(studyState, date);
  const runtimeSnapshot = yuQuizRuntime.snapshot?.date === date ? yuQuizRuntime.snapshot : undefined;
  const syncedSnapshot = runtimeSnapshot ?? day.yuReader;
  const checkedCount = Object.values(day.checkIns).filter((item) => item?.status === "checked").length;
  const progress = syncedSnapshot ? calculateYuReaderRewardProgress(syncedSnapshot, checkedCount) : undefined;
  const input: ReportInput = {
    problemCount: syncedSnapshot?.questions.actual ?? 0,
    accuracy: null,
    noteEntries: 0,
    noteCharacters: 0,
    note: "",
    selfCompleted: Boolean(day.goals?.secondStudyCompletedAt),
    friendCompleted: Boolean(day.goals?.studyCompletedAt),
    ...(progress ? {
      overallProgress: progress.overallPercent,
      readingPercent: progress.readingPercent,
      questionsPercent: progress.questionsPercent,
    } : {}),
    vocabularyCount: syncedSnapshot?.vocabularyCount ?? 0,
    oralReviewCompleted: syncedSnapshot?.oralReviewCompleted ?? false,
    mistakeReviewCompleted: syncedSnapshot?.mistakeReviewCompleted ?? false,
    togetherCompleted: Boolean(day.goals?.togetherCompletedAt || (progress && progress.overallPercent >= 100)),
  };
  studyState = submitDailyReport(studyState, input, new Date(), date);
  await persistState();
  sendState();
  refreshTrayMenu();
  const report = getDay(studyState, date).report;
  if (report) playSettlementAction(report, true);
  scheduleNextSettlementAction();
  return publicState("今天已经好好收进日记啦。");
}

async function updateYuReaderVocabulary(count: number): Promise<void> {
  const normalized = Math.max(0, Math.min(5000, Math.round(count)));
  const response = await net.fetch(`${YUREADER_BASE_URL}/api/companion/vocabulary`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ count: normalized }),
    signal: AbortSignal.timeout(4_000),
  });
  if (!response.ok) throw new Error(`YuReader 单词同步失败（HTTP ${response.status}）`);
  await syncYuQuiz(false);
}

async function performAddTask(title: string): Promise<Record<string, unknown>> {
  studyState = addDailyTask(studyState, randomUUID(), title, new Date());
  await persistState();
  sendState();
  emitAction("review", chooseLine("taskAdded", lines.taskAdded), "＋", 1_450);
  return publicState();
}

async function performSetBounty(slot: BountySlot, title: string): Promise<Record<string, unknown>> {
  studyState = setBountyDefinition(studyState, slot, title, new Date());
  await persistState();
  sendState();
  const message = title.trim()
    ? slot === "self" ? "第一份悬赏写好啦，明天也会在这里。" : "第二份悬赏也收好啦，每天都等你来赢。"
    : slot === "self" ? "今天的坚持先留白，想好了再写。" : "今天的挑战先留白，想好了再写。";
  emitAction("review", message, title.trim() ? "◆" : "·", 1_550);
  return publicState();
}

async function performEditTask(id: string, title: string): Promise<Record<string, unknown>> {
  studyState = editDailyTask(studyState, id, title, new Date());
  await persistState();
  sendState();
  return publicState("改好啦，今天就按这个来。");
}

async function performSetTaskCompleted(id: string, completed: boolean): Promise<Record<string, unknown>> {
  const taskBeforeUpdate = getDay(studyState, localDateKey()).tasks.find((task) => task.id === id);
  studyState = setDailyTaskCompleted(studyState, id, completed, new Date());
  await persistState();
  sendState();
  const tasks = getDay(studyState, localDateKey()).tasks;
  if (completed && taskBeforeUpdate?.bountySlot) {
    const pool = taskBeforeUpdate.bountySlot === "self" ? lines.bountySelf : lines.bountyGift;
    const bountyVoice = taskBeforeUpdate.bountySlot === "self" ? voicePools.bountySelf : voicePools.bountyGift;
    emitPairedAction(`bounty-${taskBeforeUpdate.bountySlot}`, "jumping", pool, bountyVoice, "✦", 1_900);
  } else if (completed && tasks.some((task) => !task.bountySlot) && tasks.filter((task) => !task.bountySlot).every((task) => task.completedAt)) {
    if (activePromptType === "task-reminder") clearActivePrompt();
    emitVoiceVariant("allTasksCompleted", [
      ...pairedVoiceVariants(lines.allTasksCompleted, voicePools.allTasksCompleted, "jumping"),
      ...functionalVoicePool("all-tasks-completed-extra"),
    ], "✦");
  } else if (completed) {
    emitVoiceVariant("taskCompleted", [
      ...pairedVoiceVariants(lines.taskCompleted, voicePools.taskCompleted, "waving"),
      ...functionalVoicePool("task-completed-extra"),
    ], "✓");
  }
  return publicState();
}

async function performSetTaskRecurring(id: string, recurring: boolean): Promise<Record<string, unknown>> {
  studyState = setDailyTaskRecurring(studyState, id, recurring, randomUUID(), new Date());
  await persistState();
  sendState();
  emitAction(
    recurring ? "review" : "idle",
    chooseLine(recurring ? "taskFixed" : "taskUnfixed", recurring ? lines.taskFixed : lines.taskUnfixed),
    recurring ? "◆" : undefined,
    1_450,
  );
  return publicState();
}

async function performDeleteTask(id: string): Promise<Record<string, unknown>> {
  studyState = deleteDailyTask(studyState, id, new Date());
  await persistState();
  sendState();
  if (getDay(studyState, localDateKey()).tasks.every((task) => task.completedAt) && activePromptType === "task-reminder") {
    clearActivePrompt();
  }
  return publicState();
}

async function updateLaunchAtLogin(enabled: boolean): Promise<void> {
  studyState = setLaunchAtLogin(studyState, enabled);
  applyLoginSetting();
  await persistState();
  sendState();
  refreshTrayMenu();
}

async function performSetStudyAnchor(): Promise<Record<string, unknown>> {
  if (!petWindow || petWindow.isDestroyed()) return publicState("现在还找不到小鹿的位置，再试一次吧。");
  if (petTravel || centerAttentionActive) return publicState("等我先跑稳，再记住这个位置吧。");
  const bounds = petWindow.getContentBounds();
  studyState = setStudyAnchor(studyState, petPositionRatio(bounds.x, bounds.y), new Date());
  await persistState();
  sendState();
  return publicState("记住啦，以后开始学习时，我会来这里陪你。");
}

function applyLoginSetting(): void {
  if (process.platform !== "win32") return;
  try {
    const settings = app.isPackaged
      ? { openAtLogin: studyState.settings.launchAtLogin, path: process.execPath, args: ["--autostart"] }
      : { openAtLogin: studyState.settings.launchAtLogin, path: process.execPath, args: [app.getAppPath(), "--autostart"] };
    app.setLoginItemSettings(settings);
  } catch (error) {
    console.error("Failed to update launch-at-login setting", error);
  }
}

function startBackgroundLoops(): void {
  cursorTimer = setInterval(() => {
    if (!petWindow || petWindow.isDestroyed() || !petWindow.isVisible()) return;
    const cursor = screen.getCursorScreenPoint();
    const bounds = petWindow.getBounds();
    const primaryDisplay = screen.getPrimaryDisplay();
    const cursorIsOnPrimary = screen.getDisplayNearestPoint(cursor).id === primaryDisplay.id;
    syncPetMousePassthrough(cursor);
    petWindow.webContents.send("xiaolu:cursor", {
      x: cursorIsOnPrimary ? cursor.x - (bounds.x + bounds.width / 2) : 0,
      y: cursorIsOnPrimary ? cursor.y - (bounds.y + bounds.height * 0.68) : 0,
    });
  }, 16);
  cursorTimer.unref?.();

  scheduleTimer = setInterval(() => void evaluateSchedule(true), 5_000);
  scheduleTimer.unref?.();
  stateTimer = setInterval(sendState, 1_000);
  stateTimer.unref?.();
}

async function syncYuQuiz(announce: boolean): Promise<void> {
  if (yuQuizSyncInFlight) {
    yuQuizSyncQueued = true;
    return;
  }
  yuQuizSyncInFlight = true;
  const previous = yuQuizRuntime.snapshot;
  let nextDelay = YUQUIZ_OFFLINE_POLL_MS;
  try {
    const status = await fetchYuQuizJson("/api/companion/status");
    if (!status) throw new Error("YuReader 返回内容为空");
    const now = new Date();
    const snapshot = parseYuReaderStatus(status, now);
    const shouldTrack = studyState.settings.yuReaderIntegration;
    const isExternalStudy = snapshot.studyState === "learning" || snapshot.studyState === "consulting";
    if (shouldTrack && isExternalStudy && studyState.activeSessionStartedAt) studyState = toggleStudy(studyState, now).state;
    if (shouldTrack) {
      const previousGoals = getDay(studyState, snapshot.date).goals;
      studyState = saveYuReaderSnapshot(studyState, snapshot, now);
      captureAutomaticGoalAwards(previousGoals, getDay(studyState, snapshot.date).goals);
    }
    await syncYuQuizEvents(shouldTrack);
    yuQuizRuntime = { connected: true, statusAvailable: Boolean(status), snapshot };
    handleYuQuizDocking(snapshot);
    if (isExternalStudy) await completeOrganicStudyLaunch(now);
    updateYuQuizStatusBubble(snapshot, now);
    if (activePromptType !== "check-in") manageRoaming(now);
    await persistState();
    if (announce && previous && (previous.studyState === "learning" || previous.studyState === "consulting") && snapshot.studyState === "paused" && activityTimedOut(snapshot, now)) {
      emitAction("waiting", "读累了就歇一会儿，回来时我还在这里。", undefined, 1_700);
    }
    nextDelay = snapshot.pageOpen || strongSupervisionBlocksPanel(roamingMode)
      ? YUQUIZ_LEARNING_POLL_MS
      : YUQUIZ_IDLE_POLL_MS;
  } catch (error) {
    yuQuizRuntime = { ...yuQuizRuntime, connected: false, error: error instanceof Error ? error.message : "YuReader 暂时无法读取" };
    setYuQuizStatusBubble("");
  }
  sendState();
  yuQuizSyncInFlight = false;
  if (yuQuizSyncQueued) {
    yuQuizSyncQueued = false;
    scheduleYuQuizSync(0);
  } else {
    scheduleYuQuizSync(nextDelay);
  }
}

type YuReaderEvent = {
  readonly id: number;
  readonly type: string;
};

async function syncYuQuizEvents(playEvents: boolean): Promise<Record<string, unknown> | undefined> {
  const cursor = studyState.settings.yuReaderEventCursor;
  const shouldStartAtHead = !yuQuizEventsInitialized || !playEvents;
  const payload = await fetchYuQuizJson(shouldStartAtHead || cursor === undefined
    ? "/api/companion/events?after=2147483647"
    : `/api/companion/events?after=${cursor}`, false);
  if (!payload) return undefined;
  yuQuizEventsInitialized = true;
  const lastEventId = clampExternalInteger(payload.last_event_id);
  if (shouldStartAtHead || cursor === undefined || lastEventId < cursor) {
    studyState = setYuReaderEventCursor(studyState, lastEventId, new Date());
    await persistState();
    return payload;
  }
  const rawEvents = Array.isArray(payload.events) ? payload.events : [];
  const events = rawEvents
    .filter((event): event is Record<string, unknown> => isRecord(event))
    .map((event): YuReaderEvent | undefined => {
      const id = clampExternalInteger(event.id);
      if (!id) return undefined;
      return { id, type: typeof event.type === "string" ? event.type : "" };
    })
    .filter((event): event is YuReaderEvent => Boolean(event))
    .sort((a, b) => a.id - b.id);
  if (events.length) {
    const latestAnswer = [...events].reverse().find((event) => event.type === "answer_correct" || event.type === "answer_wrong");
    const studyStarted = events.some((event) => event.type === "study_started" || event.type === "study_resumed");
    const launchCompleted = studyStarted || latestAnswer ? await completeActiveStudyLaunch(new Date()) : false;
    if (launchCompleted) {
      emitPairedAction("studyLaunchSuccess", "jumping", lines.studyLaunchSuccess, voicePools.launchSuccess, "✦", 1_900);
    } else if (latestAnswer?.type === "answer_correct") emitAction("waving", undefined, undefined, 750);
    else if (latestAnswer?.type === "answer_wrong") emitAction("failed", undefined, undefined, 1_250);
    else {
      const clearance = [...events].reverse().find((event) => event.type === "oral_review_completed" || event.type === "mistake_review_completed");
      if (clearance?.type === "oral_review_completed") {
        emitPairedAction("oral-review-completed", "review", lines.oralReviewCompleted, voicePools.oralReviewCompleted, "✓", 1_850);
      } else if (clearance?.type === "mistake_review_completed") {
        emitPairedAction("mistake-review-completed", "waving", lines.mistakeReviewCompleted, voicePools.mistakeReviewCompleted, "✓", 1_850);
      }
    }
  }
  studyState = setYuReaderEventCursor(studyState, Math.max(cursor, lastEventId), new Date());
  await persistState();
  return payload;
}

function scheduleYuQuizSync(delay: number): void {
  if (isQuitting) return;
  if (yuQuizTimer) clearTimeout(yuQuizTimer);
  yuQuizTimer = setTimeout(() => void syncYuQuiz(true), delay);
  yuQuizTimer.unref?.();
}

function startYuQuizWakeListener(): void {
  try {
    yuQuizWakeServer = createYuQuizWakeServer(() => scheduleYuQuizSync(100));
    yuQuizWakeServer.on("error", (error) => {
      console.error("YuQuiz wake listener unavailable; polling fallback remains active", error);
      yuQuizWakeServer = null;
    });
  } catch (error) {
    console.error("Failed to start YuQuiz wake listener; polling fallback remains active", error);
  }
}

function activityTimedOut(snapshot: YuReaderSnapshot, now: Date): boolean {
  if (!snapshot.lastMeaningfulActivityAt) return false;
  const lastActivityAt = new Date(snapshot.lastMeaningfulActivityAt).getTime();
  return Number.isFinite(lastActivityAt) && now.getTime() - lastActivityAt >= YUQUIZ_ACTIVITY_TIMEOUT_MS;
}

function updateYuQuizStatusBubble(snapshot: YuReaderSnapshot, now = new Date()): void {
  if (snapshot.pageOpen !== true) {
    setYuQuizStatusBubble("");
    return;
  }
  if (!studyLaunchPeriodAt(now)) {
    setYuQuizStatusBubble("");
    return;
  }
  // Normal study guidance is handled by the launch/patrol state machine. A
  // persistent status bubble here would duplicate those reminders.
  setYuQuizStatusBubble("");
}

async function fetchYuQuizJson(path: string, required = true): Promise<Record<string, unknown> | undefined> {
  try {
    const response = await net.fetch(`${YUREADER_BASE_URL}${path}`, { signal: AbortSignal.timeout(4_000) });
    if (!response.ok) throw new Error(`YuReader HTTP ${response.status}`);
    const value: unknown = await response.json();
    return isRecord(value) ? value : undefined;
  } catch (error) {
    if (required) throw error;
    return undefined;
  }
}

async function waitForYuReaderBackend(timeoutMs = 12_000): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await fetchYuQuizJson("/api/health", false)) return true;
    await new Promise((resolve) => setTimeout(resolve, 350));
  }
  return false;
}

function spawnYuReader(command: string, args: readonly string[], cwd: string): Promise<boolean> {
  return new Promise((resolve) => {
    try {
      const child = spawn(command, [...args], {
        cwd,
        detached: true,
        windowsHide: true,
        stdio: "ignore",
      });
      child.once("spawn", () => {
        child.unref();
        resolve(true);
      });
      child.once("error", () => resolve(false));
    } catch {
      resolve(false);
    }
  });
}

async function ensureYuReaderBackend(): Promise<boolean> {
  if (await fetchYuQuizJson("/api/health", false)) return true;
  const directory = join(app.getPath("documents"), "YuReader");
  const appFile = join(directory, "app.py");
  const executable = join(directory, "YuReader.exe");
  if (existsSync(appFile) && await spawnYuReader("py.exe", ["-3", appFile], directory) && await waitForYuReaderBackend(8_000)) return true;
  if (existsSync(executable) && await spawnYuReader(executable, [], directory) && await waitForYuReaderBackend(8_000)) return true;
  return false;
}

function openYuReaderStudyPage(): Promise<boolean> {
  if (yuReaderOpenInFlight) return yuReaderOpenInFlight;
  yuReaderOpenInFlight = (async () => {
    if (!await ensureYuReaderBackend()) return false;
    const activated = activateExistingYuQuizTab();
    if (!activated) await shell.openExternal(YUREADER_BASE_URL);
    scheduleYuQuizSync(100);
    setTimeout(ensurePetAlwaysOnTop, 180);
    return true;
  })().finally(() => { yuReaderOpenInFlight = null; });
  return yuReaderOpenInFlight;
}

function clampExternalInteger(value: unknown, max = 1_000_000): number {
  const number = typeof value === "number" ? value : Number(value);
  return Number.isFinite(number) ? Math.max(0, Math.min(max, Math.trunc(number))) : 0;
}

function formatProgress(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

function externalAccuracy(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const number = typeof value === "number" ? value : Number(value);
  return Number.isFinite(number) ? Math.max(0, Math.min(100, number)) : null;
}

function isValidDateString(value: unknown): value is string {
  return typeof value === "string" && Number.isFinite(Date.parse(value));
}

async function evaluateSchedule(announceMissed: boolean): Promise<void> {
  const now = new Date();
  await maybeSyncExternalDiary(now);
  const result = reconcileStudyState(studyState, now);
  const changed = JSON.stringify(result.state) !== JSON.stringify(studyState);
  studyState = result.state;
  if (changed) void persistState();

  if (result.pendingCheckIn) {
    await maybeAutoOpenYuReaderForCheckIn(result.pendingCheckIn, now);
    pauseRoamingForCheckIn();
    const key = `${localDateKey(now)}:${result.pendingCheckIn.slot}`;
    if (activePromptKey !== key || activePromptType !== "check-in") {
      activePromptKey = key;
      activePromptType = "check-in";
      activePromptExpiresAt = new Date(result.pendingCheckIn.windowEnd).getTime();
      bubblePromptActive = true;
      const slot = result.pendingCheckIn.slot;
      const paired = choosePaired(`checkIn-${slot}`, lines.checkIn[slot], voicePools.checkIn[slot]);
      petWindow?.webContents.send("xiaolu:prompt", {
        id: key,
        type: "check-in",
        slot,
        label: "我在",
        message: paired.message,
        voice: paired.voice,
        expiresAt: result.pendingCheckIn.windowEnd,
      });
    }
  } else if (activePromptType === "check-in") {
    clearActivePrompt();
  }

  if (announceMissed && result.newlyMissed.length > 0) {
    emitPairedAction("missed", "failed", lines.missed, voicePools.missed, undefined, 1_850);
  }
  if (!result.pendingCheckIn) {
    maybePlayHourlyChatter(now);
    manageRoaming(now);
    if (!roamingMode?.startsWith("strong")) await maybeManageStudyLaunch(now);
    if (activePromptType !== "study-launch" && !roamingMode?.startsWith("strong")) maybePromptIncompleteTasks(now);
  }
  maybePlaySettlementAction(now);
  sendState();
}

async function maybeAutoOpenYuReaderForCheckIn(
  pending: { readonly slot: CheckInSlot; readonly windowEnd: string },
  now: Date,
): Promise<void> {
  const key = `${localDateKey(now)}:${pending.slot}`;
  const [hour, minute] = pending.slot.split(":").map(Number);
  const scheduledAt = new Date(now);
  scheduledAt.setHours(hour ?? 0, minute ?? 0, 0, 0);
  const shouldOpen = shouldAutoOpenYuReaderForCheckIn({
    enabled: studyState.settings.yuReaderIntegration,
    slot: pending.slot,
    now: now.getTime(),
    scheduledAt: scheduledAt.getTime(),
    windowEnd: new Date(pending.windowEnd).getTime(),
    pageOpen: yuQuizRuntime.snapshot?.pageOpen === true,
    alreadyHandled: lastCheckInAutoOpenKey === key,
  });
  if (!shouldOpen) {
    if (now.getTime() >= scheduledAt.getTime() && yuQuizRuntime.snapshot?.pageOpen === true) lastCheckInAutoOpenKey = key;
    return;
  }
  const opened = await openYuReaderStudyPage();
  if (opened) lastCheckInAutoOpenKey = key;
  else emitAction("failed", "YuReader 后端没有启动成功。先检查一下本机的 YuReader 文件夹吧。", undefined, 3_200);
}

async function maybeSyncExternalDiary(now: Date): Promise<void> {
  if (!externalDiaryDirectory || now.getHours() !== 21) return;
  const date = localDateKey(now);
  if (lastExternalDiaryScheduledDate === date) return;
  lastExternalDiaryScheduledDate = date;
  await syncExternalDiaryFromDisk(true);
}

function maybePlayHourlyChatter(now: Date): void {
  const group = HOURLY_CHATTER_HOURS.get(now.getHours());
  if (!group || now.getMinutes() !== 0 || now.getSeconds() * 1_000 + now.getMilliseconds() >= HOURLY_CHATTER_WINDOW_MS) return;
  const key = `${localDateKey(now)}:${String(now.getHours()).padStart(2, "0")}`;
  if (lastHourlyChatterKey === key) return;
  if (activePromptType || bubblePromptActive || roamingMode?.startsWith("strong") || dragging || centerAttentionActive) return;
  if (panelWindow?.isVisible() || petTravel || powerMonitor.getSystemIdleTime() > 180) return;
  if (strictStudyPeriodAt(now) && !effectiveStudyIsActive(now)) return;

  const pool = hourlyChatter.filter((entry) => entry.group === group);
  const groupHours = HOURLY_GROUP_HOURS.get(group) ?? [];
  const slotIndex = groupHours.indexOf(now.getHours());
  if (pool.length === 0 || slotIndex < 0) return;
  const dayNumber = Math.floor(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()) / 86_400_000);
  const index = (dayNumber * groupHours.length + slotIndex) % pool.length;
  const entry = pool[index];
  if (!entry) return;

  lastHourlyChatterKey = key;
  const voice = existsSync(join(runtimeVoiceDirectory, `${entry.id}.mp3`)) ? entry.id : undefined;
  emitAction(entry.animation, entry.message, undefined, 2_800, voice);
}

function effectiveStudyIsActive(now: Date): boolean {
  void now;
  return Boolean(studyState.activeSessionStartedAt) || isYuQuizActivelyStudying();
}

function meaningfulActivityTime(): number {
  const value = yuQuizRuntime.snapshot?.lastMeaningfulActivityAt;
  const time = value ? new Date(value).getTime() : Number.NaN;
  return Number.isFinite(time) ? time : 0;
}

function manageRoaming(now: Date): void {
  if (!studyLaunchPeriodAt(now) && (centerAttentionActive || petTravel?.kind === "attention")) {
    finishCenterAttention();
  }
  if (!studyState.settings.patrolEnabled) {
    if (roamingMode) stopRoaming(false);
    return;
  }
  const date = localDateKey(now);
  if (nightStrollDate !== date) {
    nightStrollDate = date;
    nightStrollHasStarted = false;
  }
  const effectiveStudy = effectiveStudyIsActive(now);
  if (effectiveStudy) {
    const strict = strictStudyPeriodAt(now);
    if (strict) studiedStrictPeriods.add(strict.key);
    lastEffectiveStudyAt = now.getTime();
    if (roamingMode?.startsWith("strong")) stopRoaming(true);
    else if (roamingMode === "night") stopRoaming(false);
    wasEffectivelyStudying = true;
    return;
  }
  if (wasEffectivelyStudying) lastEffectiveStudyAt = now.getTime();
  wasEffectivelyStudying = false;

  const strict = strictStudyPeriodAt(now);
  if (strict) {
    if (strongPatrolSuppressedKey === strict.key) {
      if (roamingMode?.startsWith("strong")) stopRoaming(false);
      return;
    }
    const activityAt = meaningfulActivityTime();
    const completedAtValue = getDay(studyState, date).studyLaunches[strict.period]?.completedAt;
    const completedAt = completedAtValue ? new Date(completedAtValue).getTime() : 0;
    const launchCompleted = Boolean(completedAt && completedAt <= now.getTime());
    const snapshotMode = yuQuizRuntime.snapshot?.studyState;
    const recoveredPausedStudy = snapshotMode === "paused" && activityAt >= strict.startedAt && activityAt <= now.getTime();
    const studied = studiedStrictPeriods.has(strict.key)
      || launchCompleted
      || recoveredPausedStudy;
    if (studied) {
      studiedStrictPeriods.add(strict.key);
      const inactiveSince = Math.max(lastEffectiveStudyAt, activityAt, strict.startedAt);
      const intervention = studyForegroundDecision({
        now: now.getTime(),
        strictKey: strict.key,
        strictStartedAt: strict.startedAt,
        effectiveStudy,
        hasStudiedThisPeriod: true,
        inactiveSince,
        suppressed: false,
      });
      if (!intervention) {
        if (roamingMode?.startsWith("strong")) stopRoaming(false);
        return;
      }
      startRoaming("strong-return", intervention.dueAt);
      forceYuQuizToForeground(intervention);
      return;
    }
    const patrolDueAt = strict.startedAt + STUDY_LAUNCH_GRACE_MS;
    if (now.getTime() >= patrolDueAt) startRoaming("strong-start", patrolDueAt);
    else if (strongSupervisionBlocksPanel(roamingMode)) stopRoaming(false);
    const intervention = studyForegroundDecision({
      now: now.getTime(),
      strictKey: strict.key,
      strictStartedAt: strict.startedAt,
      effectiveStudy,
      hasStudiedThisPeriod: false,
      inactiveSince: strict.startedAt,
      suppressed: false,
    });
    if (intervention) forceYuQuizToForeground(intervention);
    return;
  }

  if (roamingMode?.startsWith("strong")) stopRoaming(false);
  const minutes = now.getHours() * 60 + now.getMinutes();
  const hasSettlement = Boolean(getDay(studyState, date).report);
  const mayStroll = minutes >= 21 * 60 && hasSettlement
    && (!lastEffectiveStudyAt || now.getTime() - lastEffectiveStudyAt >= NIGHT_STROLL_RESUME_MS);
  if (mayStroll) startRoaming("night");
  else if (roamingMode === "night") stopRoaming(false);
}

function forceYuQuizToForeground(intervention: StudyForegroundDecision): void {
  const now = Date.now();
  const firstIntervention = lastForcedYuQuizInterventionKey !== intervention.key;
  const pageAlreadyOpen = yuQuizRuntime.snapshot?.pageOpen === true;
  const pageIsVisible = yuQuizRuntime.snapshot?.pageVisible === true;
  if (!shouldRepeatStudyForeground({
    key: intervention.key,
    lastKey: lastForcedYuQuizInterventionKey,
    now,
    lastAt: lastForcedYuQuizInterventionAt,
    pageOpen: pageAlreadyOpen,
    pageVisible: pageIsVisible,
    repeatMs: STUDY_FOREGROUND_REPEAT_MS,
  })) {
    ensurePetAlwaysOnTop();
    return;
  }
  lastForcedYuQuizInterventionKey = intervention.key;
  lastForcedYuQuizInterventionAt = now;
  panelWindow?.hide();
  ensurePetAlwaysOnTop();
  if (firstIntervention) {
    emitAction(
      "waiting",
      intervention.kind === "return"
        ? "已经离开十五分钟啦。先回到学习台，我们从刚才那里继续。"
        : "十五分钟到了。学习台已经替你打开，先从眼前这一题开始。",
      "▶",
      3_200,
    );
  }
  void openYuReaderStudyPage().then((opened) => {
    if (!opened) {
      lastForcedYuQuizInterventionKey = "";
      lastForcedYuQuizInterventionAt = 0;
      emitAction("failed", "YuReader 后端没有启动成功。先检查一下本机的 YuReader 文件夹吧。", undefined, 3_200);
    } else if (pageAlreadyOpen && yuQuizRuntime.snapshot?.pageVisible !== true) {
      emitAction("waiting", "学习台已经开着啦，回到浏览器里的那个标签页吧。", "▶", 3_200);
    }
  }).catch((error) => {
    lastForcedYuQuizInterventionKey = "";
    lastForcedYuQuizInterventionAt = 0;
    console.error("Failed to bring YuQuiz to the foreground", error);
  });
}

function ensurePetAlwaysOnTop(): void {
  if (!petWindow || petWindow.isDestroyed()) return;
  petWindow.setAlwaysOnTop(true, "screen-saver");
  petWindow.showInactive();
  petWindow.moveTop();
}

function pauseRoamingForCheckIn(): void {
  if (!roamingMode) return;
  checkInPausedHome = checkInPausedHome ?? roamingHome;
  stopRoaming(false, false);
}

function restoreMovementAfterCheckIn(): void {
  const home = checkInPausedHome;
  checkInPausedHome = null;
  if (!home || !petWindow || petWindow.isDestroyed() || dragging || petTravel) return;
  const now = new Date();
  if (strictStudyPeriodAt(now) && studyState.settings.patrolEnabled) {
    roamingHome = home;
    manageRoaming(now);
    return;
  }
  if (yuQuizRuntime.snapshot?.pageOpen) {
    handleYuQuizDocking(yuQuizRuntime.snapshot);
    return;
  }
  startPetTravel(home.x, home.y, "roaming-return", PATROL_TRAVEL_SPEED);
}

function strongPatrolVoice(mode: Exclude<RoamingMode, "night">, now = new Date()): { key: string; pool: readonly VoiceVariant[]; tier: SupervisionTier } {
  const tier = supervisionTierForElapsed(now.getTime() - roamingEscalationStartedAt);
  if (mode === "strong-return") {
    const gentleTier: SupervisionTier = tier === "playful" ? "playful" : "firm";
    return { key: "patrol-return", pool: scheduleOnlyVoicePool(supervisionVoices.returning), tier: gentleTier };
  }
  if (tier === "final") return { key: "patrol-final", pool: scheduleOnlyVoicePool(supervisionVoices.startFinal), tier };
  if (tier === "angry") return { key: "patrol-angry", pool: scheduleOnlyVoicePool(supervisionVoices.startAngry), tier };
  if (tier === "firm") return { key: "patrol-firm", pool: scheduleOnlyVoicePool(supervisionVoices.startFirm), tier };
  return { key: "patrol-playful", pool: scheduleOnlyVoicePool(supervisionVoices.startPlayful), tier };
}

function scheduleOnlyVoicePool(pool: readonly VoiceVariant[]): readonly VoiceVariant[] {
  const compatible = pool.filter((entry) => !/[题]|学习台|教材|YuQuiz/i.test(entry.message));
  return compatible.length > 0 ? compatible : pool;
}

function strongPatrolStepDelay(tier: SupervisionTier): number {
  if (tier === "final") return randomBetween(6_000, 11_000);
  if (tier === "angry") return randomBetween(8_000, 14_000);
  if (tier === "firm") return randomBetween(10_000, 18_000);
  return randomBetween(14_000, 24_000);
}

function startRoaming(mode: RoamingMode, escalationStartedAt = Date.now()): void {
  if (strongSupervisionBlocksPanel(mode) && panelWindow?.isVisible()) {
    panelWindow.hide();
    petWindow?.showInactive();
  }
  if (!petReady || !petWindow || petWindow.isDestroyed() || (mode === "night" && panelWindow?.isVisible())) return;
  if (strongSupervisionBlocksPanel(mode)) ensurePetAlwaysOnTop();
  if (roamingMode === mode) return;
  if (roamingMode) stopRoaming(false, false);
  if (centerAttentionActive || petTravel?.kind === "attention" || petTravel?.kind.startsWith("attention-return")) {
    clearCenterAttentionState();
    cancelPetTravel();
  }
  if (petTravel) cancelPetTravel();
  studyDocked = false;
  if (!roamingHome) {
    const bounds = petWindow.getContentBounds();
    roamingHome = { x: bounds.x, y: bounds.y };
  }
  if (activePromptType === "study-launch") clearActivePrompt();
  roamingMode = mode;
  roamingEscalationStartedAt = mode === "night" ? 0 : Math.min(Date.now(), escalationStartedAt);
  if (mode === "night") {
    const pool = nightStrollHasStarted ? supervisionVoices.nightResume : supervisionVoices.night;
    emitVoiceVariant("night-stroll-entry", pool);
    nightStrollHasStarted = true;
  } else {
    const selection = strongPatrolVoice(mode);
    emitVoiceVariant(selection.key, selection.pool);
  }
  scheduleRoamingStep(mode === "night" ? randomBetween(4_000, 10_000) : randomBetween(3_200, 5_000));
  refreshTrayMenu();
}

function stopRoaming(success: boolean, returnHome = true): void {
  const stoppedMode = roamingMode;
  roamingMode = null;
  roamingEscalationStartedAt = 0;
  if (roamingTimer) clearTimeout(roamingTimer);
  roamingTimer = null;
  if (petTravel?.kind === "patrol" || petTravel?.kind === "stroll") cancelPetTravel();
  if (success && stoppedMode?.startsWith("strong")) emitVoiceVariant("patrol-success", supervisionVoices.success, "✦");
  const home = roamingHome;
  roamingHome = null;
  if (returnHome && home && !dragging && !petTravel) {
    const snapshot = yuQuizRuntime.snapshot;
    if (snapshot?.pageOpen) handleYuQuizDocking(snapshot);
    else startPetTravel(home.x, home.y, "roaming-return", PATROL_TRAVEL_SPEED);
  }
  refreshTrayMenu();
}

function scheduleRoamingStep(delay: number): void {
  if (roamingTimer) clearTimeout(roamingTimer);
  roamingTimer = setTimeout(() => {
    roamingTimer = null;
    if (!roamingMode || !petWindow || petWindow.isDestroyed() || dragging) return;
    if (panelWindow?.isVisible()) {
      if (!strongSupervisionBlocksPanel(roamingMode)) return;
      panelWindow.hide();
      petWindow.showInactive();
    }
    if (strongSupervisionBlocksPanel(roamingMode)) ensurePetAlwaysOnTop();
    const work = screen.getPrimaryDisplay().workArea;
    const marginX = roamingMode === "night" ? work.width * 0.12 : work.width * 0.04;
    const marginY = roamingMode === "night" ? work.height * 0.18 : work.height * 0.08;
    const targetX = work.x + marginX + Math.random() * Math.max(1, work.width - PET_WINDOW.width - marginX * 2);
    const targetY = work.y + marginY + Math.random() * Math.max(1, work.height - PET_WINDOW.height - marginY * 2);
    startPetTravel(
      targetX,
      targetY,
      roamingMode === "night" ? "stroll" : "patrol",
      roamingMode === "night" ? NIGHT_STROLL_SPEED : PATROL_TRAVEL_SPEED,
    );
  }, delay);
  roamingTimer.unref?.();
}

function finishRoamingStep(kind: "patrol" | "stroll"): void {
  if (!roamingMode) return;
  if (kind === "patrol") {
    if (roamingMode === "night") return;
    const selection = strongPatrolVoice(roamingMode);
    emitVoiceVariant(selection.key, selection.pool);
    scheduleRoamingStep(roamingMode === "strong-return"
      ? randomBetween(45_000, 75_000)
      : strongPatrolStepDelay(selection.tier));
  } else {
    if (Math.random() < 0.42) emitVoiceVariant("night-stroll", supervisionVoices.night);
    scheduleRoamingStep(randomBetween(35_000, 80_000));
  }
}

async function maybeManageStudyLaunch(now: Date): Promise<void> {
  const period = studyLaunchPeriodAt(now);
  if (!period) {
    if (activePromptType === "study-launch") clearActivePrompt();
    setStudyLaunchStatusBubble("");
    return;
  }
  const day = getDay(studyState, localDateKey(now));
  let record = day.studyLaunches[period] ?? {};
  if (record.completedAt || record.skippedAt) {
    if (activePromptType === "study-launch") clearActivePrompt();
    setStudyLaunchStatusBubble("");
    return;
  }
  if (studyState.activeSessionStartedAt || hasYuQuizEnteredStudyContent()) {
    studyState = completeStudyLaunch(studyState, period, "organic", now);
    if (activePromptType === "study-launch") clearActivePrompt();
    setStudyLaunchStatusBubble("");
    await persistState();
    return;
  }
  if (record.ritualStartedAt) {
    const elapsed = now.getTime() - new Date(record.ritualStartedAt).getTime();
    if (elapsed < STUDY_LAUNCH_RITUAL_MS) {
      setStudyLaunchStatusBubble("我还在这儿。点一下开始计时，我们就算正式开始。");
      return;
    }
    if (!record.finalPromptedAt && activePromptType !== "check-in") {
      studyState = markStudyLaunchPrompted(studyState, period, true, now);
      await persistState();
      record = getDay(studyState, localDateKey(now)).studyLaunches[period] ?? record;
      showStudyLaunchPrompt(period, true, now, false, record.reminderCount ?? 1);
      return;
    }
    if (isYuQuizWaitingAtHome() && reminderIsDue(record, now) && canSpeakStudyReminder()) {
      studyState = markStudyLaunchPrompted(studyState, period, true, now);
      await persistState();
      record = getDay(studyState, localDateKey(now)).studyLaunches[period] ?? record;
      presentRepeatedStudyLaunchPrompt(period, true, now, false, record.reminderCount ?? 1);
    }
    return;
  }
  if (!isUserAvailableForLaunch()) return;
  if (!record.availableAt) {
    studyState = markStudyLaunchAvailable(studyState, period, now);
    await persistState();
    return;
  }
  record = getDay(studyState, localDateKey(now)).studyLaunches[period] ?? record;
  const availableAt = record.availableAt ? new Date(record.availableAt).getTime() : now.getTime();
  const dueAt = record.snoozedUntil
    ? new Date(record.snoozedUntil).getTime()
    : availableAt + STUDY_LAUNCH_GRACE_MS;
  if (now.getTime() < dueAt || activePromptType === "check-in" || activePromptType === "task-reminder") return;
  if (!record.promptedAt) {
    studyState = markStudyLaunchPrompted(studyState, period, false, now);
    await persistState();
    record = getDay(studyState, localDateKey(now)).studyLaunches[period] ?? record;
    showStudyLaunchPrompt(period, false, now, Boolean(record.snoozedUntil), record.reminderCount ?? 1);
    return;
  }
  if (isYuQuizWaitingAtHome() && reminderIsDue(record, now) && canSpeakStudyReminder()) {
    studyState = markStudyLaunchPrompted(studyState, period, false, now);
    await persistState();
    record = getDay(studyState, localDateKey(now)).studyLaunches[period] ?? record;
    presentRepeatedStudyLaunchPrompt(period, false, now, Boolean(record.snoozedUntil), record.reminderCount ?? 1);
  }
}

function presentRepeatedStudyLaunchPrompt(
  period: StudyLaunchPeriod,
  final: boolean,
  now: Date,
  alreadySnoozed: boolean,
  reminderCount: number,
): void {
  const present = () => {
    emitAction("waiting", undefined, undefined, 2_400);
    showStudyLaunchPrompt(period, final, now, alreadySnoozed, reminderCount, true);
  };
  if (!requestCenterAttention(present)) present();
}

function showStudyLaunchPrompt(
  period: StudyLaunchPeriod,
  final: boolean,
  now: Date,
  alreadySnoozed = false,
  reminderCount = 1,
  repeated = false,
): void {
  const key = `${localDateKey(now)}:launch:${period}:${final ? "final" : "initial"}:${reminderCount}`;
  if (activePromptKey === key) return;
  activePromptKey = key;
  activePromptType = "study-launch";
  activePromptExpiresAt = Number.POSITIVE_INFINITY;
  bubblePromptActive = true;
  setStudyLaunchStatusBubble("");
  const actions = final
    ? [{ id: "start", label: "再试一次" }, { id: "skip", label: "跳过" }]
    : [{ id: "start", label: "现在开始" }, ...(!alreadySnoozed ? [{ id: "snooze", label: "10分后" }] : []), { id: "skip", label: "跳过" }];
  const repeatedPaired = repeated
    ? chooseVariant(`studyLaunchReturn-${period}`, scheduleOnlyVoicePool(functionalVoicePool("study-launch-return")))
    : undefined;
  const promptVoice = repeatedPaired?.voice;
  petWindow?.webContents.send("xiaolu:prompt", {
    id: key,
    type: "study-launch",
    message: repeated
      ? repeatedPaired?.message ?? lines.studyLaunchReturn[0]
      : final
        ? "我还在等你。现在点一下开始，今天就不算被拖延带走。"
        : lines.studyLaunchPrompt[0],
    ...(promptVoice ? { voice: promptVoice } : {}),
    actions,
  });
  syncPetMousePassthrough();
}

function isUserAvailableForLaunch(): boolean {
  const snapshot = yuQuizRuntime.snapshot;
  return powerMonitor.getSystemIdleTime() <= 60 || Boolean(snapshot?.pageOpen && snapshot.pageVisible);
}

function isYuQuizActivelyStudying(): boolean {
  return classifyYuReaderPatrol(yuQuizRuntime.snapshot).active;
}

function hasYuQuizEnteredStudyContent(): boolean {
  return classifyYuReaderPatrol(yuQuizRuntime.snapshot).enteredContent;
}

function isYuQuizWaitingAtHome(): boolean {
  return classifyYuReaderPatrol(yuQuizRuntime.snapshot).waitingAtHome;
}

function reminderIsDue(record: { readonly lastReminderAt?: string }, now: Date): boolean {
  if (!record.lastReminderAt) return true;
  const lastReminderAt = new Date(record.lastReminderAt).getTime();
  return Number.isFinite(lastReminderAt) && now.getTime() - lastReminderAt >= STUDY_LAUNCH_REPEAT_MS;
}

function canSpeakStudyReminder(): boolean {
  return powerMonitor.getSystemIdleTime() <= 120 && activePromptType !== "check-in";
}

async function completeOrganicStudyLaunch(now: Date): Promise<boolean> {
  const period = studyLaunchPeriodAt(now);
  if (!period) return false;
  const record = getDay(studyState, localDateKey(now)).studyLaunches[period];
  if (record?.completedAt || record?.skippedAt) return false;
  studyState = completeStudyLaunch(studyState, period, record?.source ?? "organic", now);
  if (activePromptType === "study-launch") clearActivePrompt();
  setStudyLaunchStatusBubble("");
  await persistState();
  return true;
}

async function completeActiveStudyLaunch(now: Date): Promise<boolean> {
  const period = studyLaunchPeriodAt(now);
  if (!period) return false;
  const record = getDay(studyState, localDateKey(now)).studyLaunches[period];
  if (!record?.ritualStartedAt || record.completedAt || record.skippedAt) return false;
  studyState = completeStudyLaunch(studyState, period, record.source ?? "prompt", now);
  if (activePromptType === "study-launch") clearActivePrompt();
  setStudyLaunchStatusBubble("");
  await persistState();
  sendState();
  return true;
}

function maybePromptIncompleteTasks(now: Date): void {
  const snapshot = yuQuizRuntime.snapshot;
  if (!studyState.settings.yuReaderIntegration || !snapshot) return;
  const date = snapshot.date;
  const day = getDay(studyState, date);
  const checkedCount = Object.values(day.checkIns).filter((item) => item?.status === "checked").length;
  const progress = calculateYuReaderRewardProgress(snapshot, checkedCount);
  if (progress.overallPercent >= 100) {
    if (activePromptType === "task-reminder") clearActivePrompt();
    return;
  }
  if (activePromptType === "task-reminder") {
    if (now.getTime() < activePromptExpiresAt) return;
    clearActivePrompt();
  }
  const hour = now.getHours();
  const reminderSlot = hour === 21 && now.getMinutes() >= 6 ? "21:00"
    : hour === 22 ? "22:00"
      : hour === 23 ? "23:00"
        : hour === 0 ? "00:00"
          : hour === 1 ? "01:00" : undefined;
  if (!reminderSlot) return;
  if (day.taskReminders.includes(reminderSlot)) return;
  const key = `${date}:tasks:${reminderSlot}`;
  studyState = markTaskReminderShown(studyState, reminderSlot, now, date);
  void persistState();
  const paired = hour >= 21 ? chooseVariant(
    `taskReminder-${reminderSlot}`,
    functionalVoicePool(reminderSlot === "21:00" ? "task-reminder-21" : "task-reminder-22"),
  ) : undefined;
  activePromptKey = key;
  activePromptType = "task-reminder";
  activePromptExpiresAt = now.getTime() + 25 * 60_000;
  bubblePromptActive = true;
  petWindow?.webContents.send("xiaolu:prompt", {
    id: key,
    type: "task-reminder",
    label: "看任务",
    message: paired?.message ?? `今天完成到 ${formatProgress(progress.overallPercent)}% 啦，再看一眼还差哪一点吧。`,
    ...(paired?.voice ? { voice: paired.voice } : {}),
    expiresAt: new Date(activePromptExpiresAt).toISOString(),
  });
}

function clearActivePrompt(): void {
  const clearedType = activePromptType;
  activePromptKey = null;
  activePromptType = null;
  activePromptExpiresAt = 0;
  bubblePromptActive = Boolean(studyLaunchStatusBubble || yuQuizStatusBubble);
  petWindow?.webContents.send("xiaolu:clear-prompt");
  if (clearedType === "check-in") restoreMovementAfterCheckIn();
}

function setYuQuizStatusBubble(message: string): void {
  if (yuQuizStatusBubble === message) return;
  yuQuizStatusBubble = message;
  syncStatusBubble();
}

function setStudyLaunchStatusBubble(message: string): void {
  if (studyLaunchStatusBubble === message) return;
  studyLaunchStatusBubble = message;
  syncStatusBubble();
}

function syncStatusBubble(): void {
  const message = studyLaunchStatusBubble || yuQuizStatusBubble;
  bubblePromptActive = Boolean(activePromptType || message);
  if (message) petWindow?.webContents.send("xiaolu:status-bubble", message);
  else petWindow?.webContents.send("xiaolu:clear-status-bubble");
  syncPetMousePassthrough();
}

function maybePlaySettlementAction(now: Date): void {
  const date = activeStudyDate(now);
  const report = getDay(studyState, date).report;
  if (!report) {
    settlementDate = "";
    nextSettlementActionAt = 0;
    return;
  }
  if (settlementDate !== date || nextSettlementActionAt === 0) scheduleNextSettlementAction(now);
  if (now.getTime() >= nextSettlementActionAt) {
    playSettlementAction(report, false);
    scheduleNextSettlementAction(now);
  }
}

function scheduleNextSettlementAction(now = new Date()): void {
  settlementDate = activeStudyDate(now);
  nextSettlementActionAt = now.getTime() + randomBetween(4 * 60_000, 7 * 60_000);
}

function playSettlementAction(_report: DailyReport, announce: boolean): void {
  if (announce) {
    emitPairedAction("settlement-summary", "review", lines.settlementSummary, voicePools.settlementSummary, undefined, 2_800);
    return;
  }
  emitAction("review", undefined, undefined, 1_850);
}

function activeStudyDate(now = new Date()): string {
  const snapshotDate = yuQuizRuntime.snapshot?.date;
  return now.getHours() < 2 && snapshotDate ? snapshotDate : localDateKey(now);
}

function publicState(message?: string): Record<string, unknown> {
  const now = new Date();
  const date = activeStudyDate(now);
  const previousGoals = getDay(studyState, date).goals;
  const reconciled = reconcileStudyState(studyState, now);
  studyState = reconciled.state;
  const today = getDay(studyState, date);
  captureAutomaticGoalAwards(previousGoals, today.goals);
  const pending = reconciled.pendingCheckIn;
  const checkIns = CHECK_IN_SLOTS.map((slot) => {
    const record = today.checkIns[slot];
    return {
      slot,
      status: record?.status ?? (pending?.slot === slot ? "pending" : "upcoming"),
      ...(record?.checkedAt ? { checkedAt: record.checkedAt } : {}),
    };
  });
  const yuReaderSnapshot = yuQuizRuntime.snapshot?.date === date ? yuQuizRuntime.snapshot : today.yuReader;
  const isStudying = Boolean(studyState.activeSessionStartedAt);
  return {
    version: studyState.version,
    now: now.toISOString(),
    date,
    isStudying,
    activeSessionStartedAt: studyState.activeSessionStartedAt ?? null,
    persistentAnimation: pending ? "waiting" : isStudying ? "running" : "idle",
    pendingCheckIn: pending ?? null,
    today: {
      date,
      studyMs: studyMsForDay(studyState, date, now),
      checkIns,
      tasks: [...today.tasks, ...studyState.backlogTasks],
      goals: today.goals ?? null,
      report: today.report ?? null,
      externalDiary: today.externalDiary ?? null,
      yuQuiz: today.yuQuiz ?? null,
      yuReader: yuReaderSnapshot ?? null,
    },
    bounties: studyState.bounties,
    automaticGoals: studyState.automaticGoals,
    history: daySummaries(studyState, now),
    stats: calculateStats(studyState, now, today.yuQuiz),
    settings: studyState.settings,
    yuReader: {
      enabled: studyState.settings.yuReaderIntegration,
      connected: yuQuizRuntime.connected,
      statusAvailable: yuQuizRuntime.statusAvailable,
      snapshot: yuReaderSnapshot ?? null,
      ...(yuQuizRuntime.error ? { error: yuQuizRuntime.error } : {}),
    },
    ...((studyLaunchStatusBubble || yuQuizStatusBubble) ? { statusBubble: studyLaunchStatusBubble || yuQuizStatusBubble } : {}),
    ...(message ? { message } : {}),
  };
}

function sendState(): void {
  const snapshot = publicState();
  if (petWindow && !petWindow.isDestroyed()) petWindow.webContents.send("xiaolu:state", snapshot);
  if (panelWindow && !panelWindow.isDestroyed()) panelWindow.webContents.send("xiaolu:state", snapshot);
  flushAutomaticGoalAwards();
}

function captureAutomaticGoalAwards(
  previous: ReturnType<typeof getDay>["goals"],
  current: ReturnType<typeof getDay>["goals"],
): void {
  if (!current) return;
  if (!previous?.studyCompletedAt && current.studyCompletedAt) pendingAutomaticGoalAwards.push("study");
  if (!previous?.secondStudyCompletedAt && current.secondStudyCompletedAt) pendingAutomaticGoalAwards.push("questions");
  if (!previous?.togetherCompletedAt && current.togetherCompletedAt) pendingAutomaticGoalAwards.push("together");
}

function flushAutomaticGoalAwards(): void {
  if (pendingAutomaticGoalAwards.length === 0) return;
  const awards = [...new Set(pendingAutomaticGoalAwards)];
  pendingAutomaticGoalAwards = [];
  if (awards.includes("together")) {
    emitPairedAction("automatic-together", "jumping", lines.automaticTogether, voicePools.automaticTogether, "✦", 2_800);
    return;
  }
  if (awards.includes("study")) {
    emitPairedAction("automatic-study", "jumping", lines.automaticStudy, voicePools.automaticStudy, "✦", 2_800);
    return;
  }
  if (awards.includes("questions")) {
    emitPairedAction("automatic-questions", "jumping", lines.automaticQuestions, voicePools.automaticQuestions, "✦", 2_800);
  }
}

function emitAction(animation: string, message?: string, effect?: string, lockMs = 1_700, voice?: string): void {
  const payload = {
    animation,
    lockMs,
    ...(message ? { message } : {}),
    ...(effect ? { effect } : {}),
    ...(voice ? { voice } : {}),
  };
  petWindow?.webContents.send("xiaolu:play-action", payload);
  panelWindow?.webContents.send("xiaolu:play-action", payload);
}

function emitVoice(voice: string): void {
  if (voice) petWindow?.webContents.send("xiaolu:play-voice", voice);
}

function emitVoiceVariant(poolKey: string, pool: readonly VoiceVariant[], effect?: string): void {
  const variant = chooseVariant(poolKey, pool);
  emitAction(variant.animation, variant.message, effect, 2_800, variant.voice);
}

function emitPairedAction(
  poolKey: string,
  animation: string,
  messages: readonly string[],
  voices: readonly string[],
  effect?: string,
  lockMs = 1_700,
): void {
  const paired = choosePaired(poolKey, messages, voices);
  emitAction(animation, paired.message, effect, lockMs, paired.voice);
}

function choosePaired(poolKey: string, messages: readonly string[], voices: readonly string[]): { message: string; voice: string } {
  const count = Math.min(messages.length, voices.length);
  if (count <= 0) return { message: messages[0] ?? "", voice: "" };
  const variants = Array.from({ length: count }, (_, index) => ({
    message: messages[index] ?? "",
    voice: voices[index] ?? "",
  }));
  const previous = lastVariantByPool.get(poolKey);
  const candidates = variants.filter((item) => item.voice !== previous);
  const selected = candidates[Math.floor(Math.random() * candidates.length)] ?? variants[0] ?? { message: "", voice: "" };
  lastVariantByPool.set(poolKey, selected.voice);
  return selected;
}

function chooseVariant(poolKey: string, pool: readonly VoiceVariant[]): VoiceVariant {
  const fallback = pool[0] ?? { message: "", voice: "", animation: "idle" };
  if (pool.length <= 1) return fallback;
  const previous = lastVariantByPool.get(poolKey);
  const candidates = pool.filter((item) => item.voice !== previous);
  const selected = candidates[Math.floor(Math.random() * candidates.length)] ?? fallback;
  lastVariantByPool.set(poolKey, selected.voice);
  return selected;
}

function chooseVoice(poolKey: string, pool: readonly string[]): string {
  if (pool.length === 1) return pool[0] ?? "";
  const previous = lastVoiceByPool.get(poolKey);
  const candidates = pool.filter((item) => item !== previous);
  const selected = candidates[Math.floor(Math.random() * candidates.length)] ?? pool[0] ?? "";
  lastVoiceByPool.set(poolKey, selected);
  return selected;
}

function chooseLine(poolKey: string, pool: readonly string[]): string {
  if (pool.length === 1) return pool[0] ?? "";
  const previous = lastLineByPool.get(poolKey);
  const candidates = pool.filter((line) => line !== previous);
  const selected = candidates[Math.floor(Math.random() * candidates.length)] ?? pool[0] ?? "";
  lastLineByPool.set(poolKey, selected);
  return selected;
}

async function loadState(): Promise<StudyState> {
  try {
    const parsed = JSON.parse(await readFile(stateFile, "utf8")) as unknown;
    return normalizeStudyState(parsed);
  } catch (error) {
    if (isNodeError(error) && error.code !== "ENOENT") console.error("Failed to load Xiaolu study state", error);
    return initialStudyState();
  }
}

async function loadExternalDiaryDirectory(): Promise<string> {
  const configFile = join(app.getPath("userData"), "xiaolu-local-integrations.json");
  try {
    const value = JSON.parse(await readFile(configFile, "utf8")) as unknown;
    if (!isRecord(value) || !isRecord(value.externalDiary) || value.externalDiary.enabled === false) return "";
    return typeof value.externalDiary.directory === "string" ? value.externalDiary.directory.trim() : "";
  } catch (error) {
    if (isNodeError(error) && error.code !== "ENOENT") console.error("Failed to load local integration settings", error);
    return "";
  }
}

async function syncExternalDiaryFromDisk(persist: boolean): Promise<void> {
  if (!externalDiaryDirectory || externalDiarySyncInFlight) return;
  externalDiarySyncInFlight = true;
  try {
    const entries = await scanExternalDiaryDirectory(externalDiaryDirectory);
    const next = syncExternalDiaryTitles(studyState, entries, new Date());
    const changed = JSON.stringify(next) !== JSON.stringify(studyState);
    studyState = next;
    if (changed && persist) await persistState();
    if (changed) sendState();
  } catch (error) {
    // A missing or temporarily offline OneDrive directory must never erase
    // existing titles. Clearing only happens after a successful full scan.
    console.error("Failed to sync external diary titles", error);
  } finally {
    externalDiarySyncInFlight = false;
  }
}

function persistState(): Promise<void> {
  persistQueue = persistQueue.then(async () => {
    await mkdir(app.getPath("userData"), { recursive: true });
    const temp = `${stateFile}.tmp`;
    await writeFile(temp, `${JSON.stringify(studyState, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
    await rename(temp, stateFile);
  }).catch((error) => console.error("Failed to persist Xiaolu study state", error));
  return persistQueue;
}

function stopDragging(notifyRenderer = false): void {
  dragging = null;
  if (dragTimer) clearInterval(dragTimer);
  dragTimer = null;
  if (notifyRenderer && petWindow && !petWindow.isDestroyed()) {
    petWindow.webContents.send("xiaolu:drag-reset");
  }
  syncPetMousePassthrough();
}

function handleYuQuizDocking(snapshot?: YuReaderSnapshot): void {
  if (!petReady || !petWindow || petWindow.isDestroyed() || !snapshot) return;
  const isClosed = snapshot.studyState === "closed" || snapshot.pageOpen === false;
  if (isClosed) {
    if (centerAttentionActive || petTravel?.kind === "attention" || petTravel?.kind === "attention-return-dock") {
      clearCenterAttentionState();
      cancelPetTravel();
    }
    if (studyDockSuppressedUntilClose) {
      studyDockSuppressedUntilClose = false;
      studyDockHome = null;
      studyDocked = false;
      return;
    }
    if (!studyDocked && petTravel?.kind !== "outbound") return;
    const returnTarget = studyDockHome
      ?? (studyState.settings.petPosition ? petPositionFromRatio(studyState.settings.petPosition) : null);
    if (!returnTarget) {
      studyDocked = false;
      return;
    }
    startPetTravel(returnTarget.x, returnTarget.y, "return");
    return;
  }
  if (snapshot.pageOpen === true) {
    if (studyDockSuppressedUntilClose || studyDocked || petTravel || dragging) return;
    const home = petWindow.getContentBounds();
    const target = petPositionFromRatio(studyState.settings.studyAnchor ?? STUDY_ANCHOR);
    studyDockHome = { x: home.x, y: home.y };
    studyState = setPetPosition(studyState, petPositionRatio(home.x, home.y), new Date());
    void persistState();
    startPetTravel(target.x, target.y, "outbound");
  }
}

function requestCenterAttention(onArrival: () => void): boolean {
  if (!petReady || !petWindow || petWindow.isDestroyed() || dragging || petTravel || centerAttentionActive) return false;
  if (panelWindow?.isVisible() || powerMonitor.getSystemIdleTime() > 120) return false;
  centerAttentionArrival = onArrival;
  const work = screen.getPrimaryDisplay().workArea;
  startPetTravel(
    work.x + (work.width - PET_WINDOW.width) / 2,
    work.y + (work.height - PET_WINDOW.height) / 2,
    "attention",
  );
  return true;
}

function finishCenterAttention(): void {
  if (!centerAttentionActive && petTravel?.kind !== "attention") return;
  clearCenterAttentionState();
  if (petTravel?.kind === "attention") cancelPetTravel();
  const snapshot = yuQuizRuntime.snapshot;
  const closed = snapshot?.studyState === "closed" || snapshot?.pageOpen === false;
  if (closed) {
    const target = studyDockHome
      ?? (studyState.settings.petPosition ? petPositionFromRatio(studyState.settings.petPosition) : null);
    if (target) startPetTravel(target.x, target.y, "attention-return-home");
    return;
  }
  const target = petPositionFromRatio(studyState.settings.studyAnchor ?? STUDY_ANCHOR);
  startPetTravel(target.x, target.y, "attention-return-dock");
}

function clearCenterAttentionState(): void {
  if (centerAttentionTimer) clearTimeout(centerAttentionTimer);
  centerAttentionTimer = null;
  centerAttentionActive = false;
  centerAttentionArrival = null;
}

function startPetTravel(targetX: number, targetY: number, kind: PetTravelKind, speed = PET_TRAVEL_SPEED): void {
  if (!petWindow || petWindow.isDestroyed()) return;
  cancelPetTravel();
  const from = petWindow.getContentBounds();
  const target = clampPetPosition(targetX, targetY);
  const horizontalMs = Math.abs(target.x - from.x) / speed * 1_000;
  const verticalMs = Math.abs(target.y - from.y) / speed * 1_000;
  const direction = target.x < from.x ? "left" : target.x > from.x ? "right" : lastDragDirection;
  lastDragDirection = direction;
  petTravel = {
    kind,
    startedAt: Date.now(),
    horizontalMs,
    verticalMs,
    fromX: from.x,
    fromY: from.y,
    toX: target.x,
    toY: target.y,
  };
  petWindow.webContents.send("xiaolu:auto-run", { active: true, direction });
  setPetMousePassthrough(true);
  petTravelTimer = setInterval(() => {
    if (!petTravel || !petWindow || petWindow.isDestroyed()) {
      cancelPetTravel();
      return;
    }
    const elapsed = Date.now() - petTravel.startedAt;
    const horizontalProgress = petTravel.horizontalMs > 0
      ? Math.min(1, elapsed / petTravel.horizontalMs)
      : 1;
    const verticalElapsed = Math.max(0, elapsed - petTravel.horizontalMs);
    const verticalProgress = petTravel.verticalMs > 0
      ? Math.min(1, verticalElapsed / petTravel.verticalMs)
      : 1;
    movePetWindow(
      petTravel.fromX + (petTravel.toX - petTravel.fromX) * horizontalProgress,
      petTravel.fromY + (petTravel.toY - petTravel.fromY) * verticalProgress,
    );
    if (elapsed < petTravel.horizontalMs + petTravel.verticalMs) return;
    const completedKind = petTravel.kind;
    cancelPetTravel();
    if (completedKind === "outbound" || completedKind === "attention-return-dock") {
      studyDocked = true;
    } else if (completedKind === "return" || completedKind === "attention-return-home") {
      studyDocked = false;
      studyDockHome = null;
      void rememberCurrentPetPosition();
    } else if (completedKind === "attention") {
      centerAttentionActive = true;
      const onArrival = centerAttentionArrival;
      centerAttentionArrival = null;
      onArrival?.();
      centerAttentionTimer = setTimeout(finishCenterAttention, CENTER_ATTENTION_MS);
      centerAttentionTimer.unref?.();
    } else if (completedKind === "patrol" || completedKind === "stroll") {
      finishRoamingStep(completedKind);
    } else if (completedKind === "roaming-return") {
      void rememberCurrentPetPosition();
    }
  }, 16);
  petTravelTimer.unref?.();
}

function cancelPetTravel(): void {
  if (petTravelTimer) clearInterval(petTravelTimer);
  petTravelTimer = null;
  if (petTravel && petWindow && !petWindow.isDestroyed()) {
    petWindow.webContents.send("xiaolu:auto-run", { active: false, direction: lastDragDirection });
  }
  petTravel = null;
  syncPetMousePassthrough();
}

async function rememberCurrentPetPosition(): Promise<void> {
  if (!petWindow || petWindow.isDestroyed() || petTravel || studyDocked) return;
  const bounds = petWindow.getContentBounds();
  studyState = setPetPosition(studyState, petPositionRatio(bounds.x, bounds.y), new Date());
  await persistState();
}

function petPositionRatio(x: number, y: number): { x: number; y: number } {
  const work = screen.getPrimaryDisplay().workArea;
  return {
    x: work.width > 0 ? (x - work.x) / work.width : 0,
    y: work.height > 0 ? (y - work.y) / work.height : 0,
  };
}

function petPositionFromRatio(position: { readonly x: number; readonly y: number }): { x: number; y: number } {
  const work = screen.getPrimaryDisplay().workArea;
  return clampPetPosition(
    work.x + work.width * position.x,
    work.y + work.height * position.y,
  );
}

function setPetMousePassthrough(ignoreMouse: boolean): void {
  if (!petWindow || petWindow.isDestroyed() || isPetIgnoringMouse === ignoreMouse) return;
  petWindow.setIgnoreMouseEvents(ignoreMouse, { forward: true });
  isPetIgnoringMouse = ignoreMouse;
}

function syncPetMousePassthrough(cursor = screen.getCursorScreenPoint()): void {
  if (!petWindow || petWindow.isDestroyed()) return;
  if (petTravel) {
    setPetMousePassthrough(true);
    return;
  }
  if (dragging) {
    setPetMousePassthrough(false);
    return;
  }
  const bounds = petWindow.getBounds();
  const petLeft = bounds.x + (bounds.width - PET_HITBOX.width) / 2;
  const petTop = bounds.y + bounds.height - PET_HITBOX.bottom - PET_HITBOX.height;
  const overPet = cursor.x >= petLeft
    && cursor.x < petLeft + PET_HITBOX.width
    && cursor.y >= petTop
    && cursor.y < petTop + PET_HITBOX.height;
  const overBubble = bubblePromptActive && bubbleHitbox
    && cursor.x >= bounds.x + bubbleHitbox.left
    && cursor.x < bounds.x + bubbleHitbox.left + bubbleHitbox.width
    && cursor.y >= bounds.y + bubbleHitbox.top
    && cursor.y < bounds.y + bubbleHitbox.top + bubbleHitbox.height;
  setPetMousePassthrough(!(overPet || overBubble));
}

function movePetWindow(x: number, y: number): void {
  if (!petWindow || petWindow.isDestroyed()) return;
  const position = clampPetPosition(x, y);
  petWindow.setContentBounds({
    x: position.x,
    y: position.y,
    width: PET_WINDOW.width,
    height: PET_WINDOW.height,
  }, false);
}

function clampPetPosition(x: number, y: number): { x: number; y: number } {
  const work = screen.getPrimaryDisplay().workArea;
  const hitboxLeft = (PET_WINDOW.width - PET_HITBOX.width) / 2;
  const hitboxTop = PET_WINDOW.height - PET_HITBOX.bottom - PET_HITBOX.height;
  const hitboxRight = hitboxLeft + PET_HITBOX.width;
  const hitboxBottom = hitboxTop + PET_HITBOX.height;
  const minX = work.x - hitboxLeft;
  const maxX = work.x + work.width - hitboxRight;
  const minY = work.y - hitboxTop;
  const maxY = work.y + work.height - hitboxBottom;
  return {
    x: Math.round(Math.min(maxX, Math.max(minX, x))),
    y: Math.round(Math.min(maxY, Math.max(minY, y))),
  };
}

function keepPetOnPrimaryDisplay(): void {
  if (!petWindow || petWindow.isDestroyed()) return;
  const bounds = petWindow.getContentBounds();
  movePetWindow(bounds.x, bounds.y);
}

function hardenWindow(window: BrowserWindow): void {
  window.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  window.webContents.on("will-navigate", (event) => event.preventDefault());
}

function assertTrustedSender(event: Electron.IpcMainInvokeEvent | IpcMainEvent): void {
  const trusted = [petWindow, panelWindow].some((window) => window && !window.isDestroyed() && event.sender === window.webContents);
  if (!trusted) throw new Error("Untrusted Xiaolu renderer.");
}

function isPoint(value: unknown): value is { screenX: number; screenY: number } {
  if (!value || typeof value !== "object") return false;
  const point = value as Record<string, unknown>;
  return typeof point.screenX === "number" && Number.isFinite(point.screenX)
    && typeof point.screenY === "number" && Number.isFinite(point.screenY);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function normalizeWindowBounds(value: unknown): { left: number; top: number; width: number; height: number } | null {
  if (!isRecord(value)) return null;
  const numbers = [value.left, value.top, value.width, value.height];
  if (!numbers.every((item) => typeof item === "number" && Number.isFinite(item))) return null;
  const left = Math.max(0, Math.min(PET_WINDOW.width, Math.floor(value.left as number)));
  const top = Math.max(0, Math.min(PET_WINDOW.height, Math.floor(value.top as number)));
  const width = Math.max(0, Math.min(PET_WINDOW.width - left, Math.ceil(value.width as number)));
  const height = Math.max(0, Math.min(PET_WINDOW.height - top, Math.ceil(value.height as number)));
  return width > 0 && height > 0 ? { left, top, width, height } : null;
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error;
}

function randomBetween(min: number, max: number): number {
  return Math.round(min + Math.random() * (max - min));
}
