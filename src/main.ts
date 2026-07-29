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
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { join } from "node:path";
import type { Server } from "node:http";

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
  setBountyDefinition,
  setDailyTaskCompleted,
  setDailyTaskRecurring,
  setLaunchAtLogin,
  setPatrolEnabled,
  setPetPosition,
  setStudyAnchor,
  setVoiceEnabled,
  setVoiceVolume,
  setYuQuizIntegration,
  setYuQuizEventCursor,
  saveYuQuizSnapshot,
  skipStudyLaunch,
  snoozeStudyLaunch,
  beginStudyLaunchRitual,
  completeStudyLaunch,
  studyLaunchPeriodAt,
  strictStudyPeriodAt,
  studyMsForDay,
  submitDailyReport,
  toggleStudy,
  type CheckInSlot,
  type BountySlot,
  type DailyReport,
  type ReportInput,
  type StudyState,
  type StudyLaunchPeriod,
  type YuQuizSnapshot,
} from "./game.js";
import { createYuQuizWakeServer } from "./yuquiz-wakeup.js";

const PET_WINDOW = { width: 128, height: 208 } as const;
const PET_HITBOX = { width: 68, height: 102, bottom: 9 } as const;
const PANEL_WINDOW = { width: 420, height: 680 } as const;
const checkInSlots = new Set<string>(CHECK_IN_SLOTS);
const panelViews = new Set(["today", "tasks", "history", "stats", "bookmarks", "report"]);
const YUQUIZ_BASE_URL = "http://127.0.0.1:8765";
const YUQUIZ_OFFLINE_POLL_MS = 60_000;
const YUQUIZ_IDLE_POLL_MS = 15_000;
const YUQUIZ_LEARNING_POLL_MS = 2_000;
const STUDY_LAUNCH_GRACE_MS = 5 * 60_000;
const STUDY_LAUNCH_SNOOZE_MS = 10 * 60_000;
const STUDY_LAUNCH_RITUAL_MS = 5 * 60_000;
const STUDY_LAUNCH_REPEAT_MS = 10 * 60_000;
const YUQUIZ_STALL_REMINDER_MS = 30 * 60_000;
const SUPERVISION_RESTART_MS = 15 * 60_000;
const YUQUIZ_STABLE_START_MS = 3 * 60_000;
const NIGHT_STROLL_RESUME_MS = 2 * 60_000;
const STUDY_ANCHOR = { x: 0.03125, y: 0.2875 } as const;
const PET_TRAVEL_SPEED = 230;
const PATROL_TRAVEL_SPEED = 115;
const NIGHT_STROLL_SPEED = 72;
const CENTER_ATTENTION_MS = 15_000;

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
  yuQuizPaused: ["yuquiz-paused-1", "yuquiz-paused-2", "yuquiz-paused-3"],
  yuQuizReady: ["yuquiz-ready-1", "yuquiz-ready-2", "yuquiz-ready-3"],
  yuQuizSetCompleted: ["yuquiz-set-complete-1", "yuquiz-set-complete-2", "yuquiz-set-complete-3"],
  taskReminder: ["task-reminder-1", "task-reminder-2", "task-reminder-3"],
  taskCompleted: ["task-completed-1", "task-completed-2"],
  allTasksCompleted: ["all-tasks-completed-1"],
  bountySelf: ["bounty-self-1", "bounty-self-2"],
  bountyGift: ["bounty-gift-1", "bounty-gift-2"],
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
  bountySelf: ["这枚是你替自己赢下的，收好啦。", "今天守住了这份坚持，书签归你。", "第一份悬赏完成，认真有了新的证明。"],
  bountyGift: ["这枚书签替她收好啦。", "你愿意多走的这一步，我替她记住了。", "第二份悬赏完成，这是今天送给她的努力。"],
  yuQuizSetCompleted: ["这一组收好啦，今天又向前走了一小步。", "这组题完成啦，认真留下了新的痕迹。", "题目一组组做完，今天的努力也亮起来啦。"],
  studyLaunchPrompt: ["先不想学多久。打开第一题，我陪你把开头走过去。", "不用先决定学多久，我们只把第一题打开。", "先迈最小的一步吧，我陪你从第一题开始。"],
  studyLaunchSuccess: ["好啦，已经开始了。最难的那一步过去了。", "第一题完成啦，接下来交给状态。", "你已经走进学习里了，我就不再催你啦。"],
  studyLaunchReturn: ["学习台还在等你。先点进第一题，我就不再催啦。", "别在门口停太久，我们进去做第一题吧。", "再拉你一下：只做第一题，开始以后我就安静。"],
  yuQuizStalled: ["这一题陪你想了很久。要是资料查完了，就回来继续吧。", "我先轻轻叫你一下。还在查资料的话慢慢来，准备好了就回来。", "题目还替你留着呢。忙完手边这一步，我们再接着做。"],
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
let cursorTimer: NodeJS.Timeout | null = null;
let scheduleTimer: NodeJS.Timeout | null = null;
let stateTimer: NodeJS.Timeout | null = null;
let yuQuizTimer: NodeJS.Timeout | null = null;
let yuQuizWakeServer: Server | null = null;
let yuQuizSyncInFlight = false;
let yuQuizSyncQueued = false;
let dragTimer: NodeJS.Timeout | null = null;
let petTravelTimer: NodeJS.Timeout | null = null;
let dragging: { startX: number; startY: number; windowX: number; windowY: number; lastCursorX: number } | null = null;
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
let yuQuizRuntime: { connected: boolean; statusAvailable: boolean; error?: string; snapshot?: YuQuizSnapshot } = { connected: false, statusAvailable: false };
let yuQuizEventsInitialized = false;
let yuQuizAutoSuppressed = false;
let yuQuizStatusBubble = "";
let studyLaunchStatusBubble = "";
let lastYuQuizStallReminderAt = 0;
let yuQuizLearningSince = 0;
let lastYuQuizAnswerAt = 0;
let lastEffectiveStudyAt = 0;
let wasEffectivelyStudying = false;
let roamingMode: RoamingMode | null = null;
let roamingTimer: NodeJS.Timeout | null = null;
let roamingRounds = 0;
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
  studyState = reconcileStudyState(studyState).state;
  applyLoginSetting();
  installIpc();
  createPetWindow();
  createTray();
  startYuQuizWakeListener();
  startBackgroundLoops();
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
    if (typeof enabled !== "boolean") throw new Error("YuQuiz 联动设置格式不正确。");
    await updateYuQuizIntegration(enabled);
    return publicState();
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
      { voice: "yuquiz-set-complete-3", animation: "jumping", message: "一组题做完啦。快看一眼自己的成果吧。" },
      { voice: "all-tasks-completed-1", animation: "jumping", message: "今天列下的事情都完成啦。真的一件也没有落下！" },
      { voice: "bounty-gift-2", animation: "review", message: "又替她赢下一枚。今天的努力，也有了可以留下的样子。" },
      { voice: "study-stopped-2", animation: "review", message: "我记下来啦。休息一下，也没有关系。" },
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
    dragging = { startX: cursor.x, startY: cursor.y, windowX: bounds.x, windowY: bounds.y, lastCursorX: cursor.x };
    setPetMousePassthrough(false);
    petWindow.webContents.send("xiaolu:drag-direction", lastDragDirection);
    dragTimer = setInterval(() => {
      if (!petWindow || petWindow.isDestroyed() || !dragging) {
        stopDragging();
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
  if (studyState.settings.yuQuizIntegration) return publicState("已开启 YuQuiz 联动，学习时间会由网页自动记录。");
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
  const now = new Date();
  const period = studyLaunchPeriodAt(now);
  if (!studyState.activeSessionStartedAt && !studyState.settings.yuQuizIntegration && period) {
    return startStudyLaunchRitual(period, "double-click", now);
  }
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
  setStudyLaunchStatusBubble("先不用管学多久，我们只把第一题打开。");
  await persistState();
  sendState();
  const pageOpen = yuQuizRuntime.snapshot?.pageOpen === true;
  const health = pageOpen ? true : Boolean(await fetchYuQuizJson("/api/health", false));
  if (health) {
    if (!pageOpen) await shell.openExternal(YUQUIZ_BASE_URL);
    emitPairedAction("studyStarted", "waving", lines.studyStarted, voicePools.studyStarted, "✦", 1_650);
    scheduleYuQuizSync(100);
    return publicState();
  }
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
  const result = checkIn(studyState, new Date(), requested);
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
  const date = localDateKey();
  const runtimeQuestions = yuQuizRuntime.snapshot?.date === date ? yuQuizRuntime.snapshot.todayQuestions : undefined;
  const syncedQuestions = runtimeQuestions ?? getDay(studyState, date).yuQuiz?.todayQuestions;
  const input: ReportInput = {
    problemCount: syncedQuestions ?? (typeof value.problemCount === "number" ? value.problemCount : Number(value.problemCount)),
    note: typeof value.note === "string" ? value.note : "",
    selfCompleted: value.selfCompleted === true,
    friendCompleted: value.friendCompleted === true,
  };
  studyState = submitDailyReport(studyState, input, new Date());
  await persistState();
  sendState();
  refreshTrayMenu();
  const report = getDay(studyState, localDateKey()).report;
  if (report) playSettlementAction(report, true);
  scheduleNextSettlementAction();
  return publicState("今天已经好好收进日记啦。");
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
  } else if (completed && tasks.length > 0 && tasks.every((task) => task.completedAt)) {
    if (activePromptType === "task-reminder") clearActivePrompt();
    emitPairedAction("allTasksCompleted", "jumping", lines.allTasksCompleted, voicePools.allTasksCompleted, "✦", 1_800);
  } else if (completed) {
    emitPairedAction("taskCompleted", "waving", lines.taskCompleted, voicePools.taskCompleted, "✓", 1_350);
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
  return publicState("记住啦，以后打开学习台，我会来这里陪你。");
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
  scheduleYuQuizSync(0);
}

async function updateYuQuizIntegration(enabled: boolean): Promise<void> {
  if (enabled && studyState.activeSessionStartedAt) {
    studyState = toggleStudy(studyState, new Date()).state;
  }
  yuQuizAutoSuppressed = !enabled;
  studyState = setYuQuizIntegration(studyState, enabled, new Date());
  await persistState();
  await syncYuQuiz(false);
}

async function syncYuQuiz(announce: boolean): Promise<void> {
  if (yuQuizSyncInFlight) {
    yuQuizSyncQueued = true;
    return;
  }
  yuQuizSyncInFlight = true;
  const previous = yuQuizRuntime.snapshot;
  const wasEnabled = studyState.settings.yuQuizIntegration;
  let nextDelay = YUQUIZ_OFFLINE_POLL_MS;
  try {
    const status = await fetchYuQuizJson("/api/companion/status");
    if (!status) throw new Error("YuQuiz 返回内容为空");
    const statusRecord = isRecord(status) ? status : {};
    const now = new Date();
    const date = localDateKey(now);
    const snapshot: YuQuizSnapshot = {
      date,
      todayQuestions: clampExternalInteger(statusRecord.today_questions),
      todayCorrect: clampExternalInteger(statusRecord.today_correct),
      todayAccuracy: externalAccuracy(statusRecord.today_accuracy),
      todayLearningSeconds: clampExternalInteger(statusRecord.today_learning_seconds, 86_400 * 366),
      currentView: typeof statusRecord.current_view === "string" ? statusRecord.current_view : "home",
      isLearning: statusRecord.is_learning === true,
      activeSession: statusRecord.active_session === true,
      ...(typeof statusRecord.page_open === "boolean" ? { pageOpen: statusRecord.page_open } : {}),
      ...(typeof statusRecord.page_suspected_open === "boolean" ? { pageSuspectedOpen: statusRecord.page_suspected_open } : {}),
      ...(typeof statusRecord.page_visible === "boolean" ? { pageVisible: statusRecord.page_visible } : {}),
      ...(statusRecord.study_state === "closed" || statusRecord.study_state === "ready" || statusRecord.study_state === "learning" || statusRecord.study_state === "paused" || statusRecord.study_state === "consulting"
        ? { studyState: statusRecord.study_state } : {}),
      ...(statusRecord.pause_reason === "idle" || statusRecord.pause_reason === "hidden" || statusRecord.pause_reason === "manual" || statusRecord.pause_reason === "none"
        ? { pauseReason: statusRecord.pause_reason } : {}),
      ...(typeof statusRecord.ai_consulting === "boolean" ? { aiConsulting: statusRecord.ai_consulting } : {}),
      ...(isValidDateString(statusRecord.last_activity_at) ? { lastActivityAt: statusRecord.last_activity_at } : {}),
      ...(isValidDateString(statusRecord.last_meaningful_activity_at)
        ? { lastMeaningfulActivityAt: statusRecord.last_meaningful_activity_at }
        : {}),
      syncedAt: now.toISOString(),
    };
    if (!snapshot.isLearning) yuQuizAutoSuppressed = false;
    const studyMode = snapshot.studyState ?? (snapshot.isLearning ? "learning" : "ready");
    if (studyMode === "learning" || studyMode === "consulting") {
      if (!yuQuizLearningSince) yuQuizLearningSince = now.getTime();
    } else {
      yuQuizLearningSince = 0;
    }
    const shouldEnable = (studyMode === "learning" || studyMode === "consulting") && !yuQuizAutoSuppressed;
    if (shouldEnable && !studyState.settings.yuQuizIntegration) {
      if (studyState.activeSessionStartedAt) studyState = toggleStudy(studyState, now).state;
      studyState = setYuQuizIntegration(studyState, true, now);
    }
    if (studyState.settings.yuQuizIntegration) studyState = saveYuQuizSnapshot(studyState, snapshot, now);
    await syncYuQuizEvents(wasEnabled || shouldEnable);
    if (!shouldEnable && studyState.settings.yuQuizIntegration) {
      studyState = setYuQuizIntegration(studyState, false, now);
    }
    yuQuizRuntime = { connected: true, statusAvailable: Boolean(status), snapshot };
    handleYuQuizDocking(snapshot);
    if (shouldEnable) await completeOrganicStudyLaunch(now);
    updateYuQuizStatusBubble(snapshot, now);
    maybeRemindYuQuizStall(snapshot, now);
    if (activePromptType !== "check-in") manageRoaming(now);
    await persistState();
    if (announce && previous?.isLearning && !snapshot.isLearning && activityTimedOut(snapshot, now)) {
      emitAction("review", "稍微走神也没关系，这段计时先替你停好啦。", undefined, 1_650);
    }
    nextDelay = shouldEnable ? YUQUIZ_LEARNING_POLL_MS : YUQUIZ_IDLE_POLL_MS;
  } catch (error) {
    yuQuizAutoSuppressed = false;
    if (studyState.settings.yuQuizIntegration) {
      studyState = setYuQuizIntegration(studyState, false, new Date());
      await persistState();
    }
    yuQuizRuntime = { ...yuQuizRuntime, connected: false, error: error instanceof Error ? error.message : "学习网站暂时无法读取" };
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

type YuQuizEvent = {
  readonly id: number;
  readonly type: string;
  readonly result?: string;
  readonly session_type?: string;
  readonly total?: number;
  readonly answered?: number;
  readonly correct?: number;
  readonly wrong?: number;
  readonly accuracy?: number;
};

async function syncYuQuizEvents(playEvents: boolean): Promise<Record<string, unknown> | undefined> {
  const cursor = studyState.settings.yuQuizEventCursor;
  const shouldStartAtHead = !yuQuizEventsInitialized || !playEvents;
  const payload = await fetchYuQuizJson(shouldStartAtHead || cursor === undefined
    ? "/api/companion/events?after=2147483647"
    : `/api/companion/events?after=${cursor}`, false);
  if (!payload) return undefined;
  yuQuizEventsInitialized = true;
  const lastEventId = clampExternalInteger(payload.last_event_id);
  if (shouldStartAtHead || cursor === undefined || lastEventId < cursor) {
    studyState = setYuQuizEventCursor(studyState, lastEventId, new Date());
    await persistState();
    return payload;
  }
  const rawEvents = Array.isArray(payload.events) ? payload.events : [];
  const events = rawEvents
    .filter((event): event is Record<string, unknown> => isRecord(event))
    .map((event): YuQuizEvent | undefined => {
      const id = clampExternalInteger(event.id);
      if (!id) return undefined;
      return {
        id,
        type: typeof event.type === "string" ? event.type : "",
        total: clampExternalInteger(event.total),
        answered: clampExternalInteger(event.answered),
        correct: clampExternalInteger(event.correct),
        wrong: clampExternalInteger(event.wrong),
        ...(typeof event.result === "string" ? { result: event.result } : {}),
        ...(typeof event.session_type === "string" ? { session_type: event.session_type } : {}),
        ...(externalAccuracy(event.accuracy) !== null ? { accuracy: externalAccuracy(event.accuracy) as number } : {}),
      };
    })
    .filter((event): event is YuQuizEvent => Boolean(event))
    .sort((a, b) => a.id - b.id);
  if (events.length) {
    const completion = events.find((event) => event.type === "set_completed");
    const latestAnswer = [...events].reverse().find((event) => event.type === "answer");
    if (latestAnswer) lastYuQuizAnswerAt = Date.now();
    const launchCompleted = latestAnswer ? await completeActiveStudyLaunch(new Date()) : false;
    if (launchCompleted) {
      emitPairedAction("studyLaunchSuccess", "jumping", lines.studyLaunchSuccess, voicePools.launchSuccess, "✦", 1_900);
    } else if (completion) {
      const accuracy = completion.accuracy ?? 0;
      emitPairedAction(
        "yuQuizSetCompleted",
        accuracy >= 80 ? "jumping" : "waving",
        lines.yuQuizSetCompleted,
        voicePools.yuQuizSetCompleted,
        accuracy >= 80 ? "✦" : "✓",
        accuracy >= 80 ? 1_900 : 1_600,
      );
    } else {
      if (latestAnswer?.result === "correct") emitAction("waving", undefined, undefined, 750);
      if (latestAnswer?.result === "wrong") emitAction("failed", undefined, undefined, 1_250);
    }
  }
  studyState = setYuQuizEventCursor(studyState, Math.max(cursor, lastEventId), new Date());
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

function activityTimedOut(snapshot: YuQuizSnapshot, now: Date): boolean {
  if (!snapshot.lastActivityAt) return false;
  const lastActivityAt = new Date(snapshot.lastActivityAt).getTime();
  return Number.isFinite(lastActivityAt) && now.getTime() - lastActivityAt >= 5 * 60_000;
}

function updateYuQuizStatusBubble(snapshot: YuQuizSnapshot, now = new Date()): void {
  if (snapshot.pageOpen !== true) {
    setYuQuizStatusBubble(snapshot.pageSuspectedOpen
      ? "YuQuiz 好像还开着，但联动信号断开啦。刷新一下页面，我就能继续陪你计时。"
      : "");
    return;
  }
  if (!studyLaunchPeriodAt(now)) {
    setYuQuizStatusBubble("");
    return;
  }
  const studyMode = snapshot.studyState ?? (snapshot.isLearning ? "learning" : "ready");
  if (studyMode === "learning" || studyMode === "consulting") {
    setYuQuizStatusBubble("");
  } else if (studyMode === "paused") {
    setYuQuizStatusBubble(snapshot.pauseReason === "hidden"
      ? "页面还开着呢，回来继续时我再接上计时。"
      : "这段计时先停着，继续做题时我再陪你。");
  } else {
    setYuQuizStatusBubble("题库已经打开啦，选一组开始吧。");
  }
}

async function fetchYuQuizJson(path: string, required = true): Promise<Record<string, unknown> | undefined> {
  try {
    const response = await net.fetch(`${YUQUIZ_BASE_URL}${path}`, { signal: AbortSignal.timeout(4_000) });
    if (!response.ok) throw new Error(`YuQuiz HTTP ${response.status}`);
    const value: unknown = await response.json();
    return isRecord(value) ? value : undefined;
  } catch (error) {
    if (required) throw error;
    return undefined;
  }
}

function clampExternalInteger(value: unknown, max = 1_000_000): number {
  const number = typeof value === "number" ? value : Number(value);
  return Number.isFinite(number) ? Math.max(0, Math.min(max, Math.trunc(number))) : 0;
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
  const result = reconcileStudyState(studyState, now);
  const changed = JSON.stringify(result.state) !== JSON.stringify(studyState);
  studyState = result.state;
  if (changed) void persistState();

  if (result.pendingCheckIn) {
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
    manageRoaming(now);
    if (!roamingMode?.startsWith("strong")) await maybeManageStudyLaunch(now);
    if (activePromptType !== "study-launch" && !roamingMode?.startsWith("strong")) maybePromptIncompleteTasks(now);
  }
  maybePlaySettlementAction(now);
  sendState();
}

function effectiveStudyIsActive(now: Date): boolean {
  if (studyState.activeSessionStartedAt) return true;
  const snapshot = yuQuizRuntime.snapshot;
  const mode = snapshot?.studyState ?? (snapshot?.isLearning ? "learning" : "ready");
  if (mode !== "learning" && mode !== "consulting") return false;
  return Boolean(
    (yuQuizLearningSince && now.getTime() - yuQuizLearningSince >= YUQUIZ_STABLE_START_MS)
    || (lastYuQuizAnswerAt && now.getTime() - lastYuQuizAnswerAt <= SUPERVISION_RESTART_MS),
  );
}

function meaningfulActivityTime(): number {
  const value = yuQuizRuntime.snapshot?.lastMeaningfulActivityAt ?? yuQuizRuntime.snapshot?.lastActivityAt;
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
    const launchCompleted = Boolean(completedAt && completedAt <= now.getTime() - YUQUIZ_STABLE_START_MS);
    const snapshotMode = yuQuizRuntime.snapshot?.studyState;
    const recoveredPausedStudy = snapshotMode === "paused" && activityAt >= strict.startedAt && activityAt <= now.getTime();
    const studied = studiedStrictPeriods.has(strict.key)
      || launchCompleted
      || recoveredPausedStudy;
    if (studied) {
      studiedStrictPeriods.add(strict.key);
      const inactiveSince = Math.max(lastEffectiveStudyAt, activityAt, strict.startedAt);
      if (now.getTime() - inactiveSince < SUPERVISION_RESTART_MS) {
        if (roamingMode?.startsWith("strong")) stopRoaming(false);
        return;
      }
      startRoaming("strong-return");
      return;
    }
    startRoaming("strong-start");
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

function startRoaming(mode: RoamingMode): void {
  if (!petReady || !petWindow || petWindow.isDestroyed() || panelWindow?.isVisible()) return;
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
  roamingRounds = 0;
  if (mode === "night") {
    const pool = nightStrollHasStarted ? supervisionVoices.nightResume : supervisionVoices.night;
    emitVoiceVariant("night-stroll-entry", pool);
    nightStrollHasStarted = true;
  } else {
    emitVoiceVariant(mode, mode === "strong-return" ? supervisionVoices.returning : supervisionVoices.startPlayful);
  }
  scheduleRoamingStep(mode === "night" ? randomBetween(4_000, 10_000) : randomBetween(3_200, 5_000));
  refreshTrayMenu();
}

function stopRoaming(success: boolean, returnHome = true): void {
  const stoppedMode = roamingMode;
  roamingMode = null;
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
    if (!roamingMode || !petWindow || petWindow.isDestroyed() || dragging || panelWindow?.isVisible()) return;
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
  roamingRounds += 1;
  if (kind === "patrol") {
    const pool = roamingMode === "strong-return"
      ? supervisionVoices.returning
      : roamingRounds >= 4 ? supervisionVoices.startFirm : supervisionVoices.startPlayful;
    emitVoiceVariant(roamingMode === "strong-return" ? "patrol-return" : roamingRounds >= 4 ? "patrol-firm" : "patrol-playful", pool);
    scheduleRoamingStep(randomBetween(8_000, 18_000));
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
      setStudyLaunchStatusBubble("我还在这儿。先完成第一题，后面就交给你的状态。");
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
  const paired = !final && !repeated
    ? choosePaired(`studyLaunch-${period}`, lines.studyLaunchPrompt, voicePools.launchPrompt)
    : undefined;
  petWindow?.webContents.send("xiaolu:prompt", {
    id: key,
    type: "study-launch",
    message: paired?.message ?? (repeated
      ? chooseLine(`studyLaunchReturn-${period}`, lines.studyLaunchReturn)
      : final
        ? "我还在等你。现在做第一题，今天就不算被拖延带走。"
        : lines.studyLaunchPrompt[0]),
    ...(paired ? { voice: paired.voice } : {}),
    actions,
  });
  syncPetMousePassthrough();
}

function isUserAvailableForLaunch(): boolean {
  const snapshot = yuQuizRuntime.snapshot;
  return powerMonitor.getSystemIdleTime() <= 60 || Boolean(snapshot?.pageOpen && snapshot.pageVisible);
}

function isYuQuizActivelyStudying(): boolean {
  const mode = yuQuizRuntime.snapshot?.studyState;
  return mode === "learning" || mode === "consulting";
}

function hasYuQuizEnteredStudyContent(): boolean {
  const snapshot = yuQuizRuntime.snapshot;
  if (!snapshot?.pageOpen) return false;
  const mode = snapshot.studyState ?? (snapshot.isLearning ? "learning" : "ready");
  return mode === "learning" || mode === "consulting" || mode === "paused" || snapshot.currentView !== "home";
}

function isYuQuizWaitingAtHome(): boolean {
  const snapshot = yuQuizRuntime.snapshot;
  if (!snapshot?.pageOpen) return false;
  const mode = snapshot.studyState ?? (snapshot.isLearning ? "learning" : "ready");
  return mode === "ready" && snapshot.currentView === "home";
}

function reminderIsDue(record: { readonly lastReminderAt?: string }, now: Date): boolean {
  if (!record.lastReminderAt) return true;
  const lastReminderAt = new Date(record.lastReminderAt).getTime();
  return Number.isFinite(lastReminderAt) && now.getTime() - lastReminderAt >= STUDY_LAUNCH_REPEAT_MS;
}

function canSpeakStudyReminder(): boolean {
  return powerMonitor.getSystemIdleTime() <= 120 && activePromptType !== "check-in";
}

function maybeRemindYuQuizStall(snapshot: YuQuizSnapshot, now: Date): void {
  if (!strictStudyPeriodAt(now)) {
    lastYuQuizStallReminderAt = 0;
    return;
  }
  const mode = snapshot.studyState ?? (snapshot.isLearning ? "learning" : "ready");
  if (!snapshot.pageOpen || mode !== "paused" || snapshot.currentView === "home") {
    lastYuQuizStallReminderAt = 0;
    return;
  }
  const activityAt = snapshot.lastMeaningfulActivityAt ?? snapshot.lastActivityAt;
  const activityTime = activityAt ? new Date(activityAt).getTime() : Number.NaN;
  if (!Number.isFinite(activityTime) || now.getTime() - activityTime < YUQUIZ_STALL_REMINDER_MS) return;
  if (!canSpeakStudyReminder() || activePromptType === "study-launch") return;
  if (lastYuQuizStallReminderAt && now.getTime() - lastYuQuizStallReminderAt < YUQUIZ_STALL_REMINDER_MS) return;
  lastYuQuizStallReminderAt = now.getTime();
  const present = () => emitAction(
      "review",
      chooseLine("yuQuizStalled", lines.yuQuizStalled),
      undefined,
      2_800,
    );
  if (!requestCenterAttention(present)) present();
}

async function completeOrganicStudyLaunch(now: Date): Promise<void> {
  const period = studyLaunchPeriodAt(now);
  if (!period) return;
  const record = getDay(studyState, localDateKey(now)).studyLaunches[period];
  if (record?.completedAt || record?.skippedAt || record?.ritualStartedAt) return;
  studyState = completeStudyLaunch(studyState, period, "organic", now);
  await persistState();
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
  const tasks = getDay(studyState, localDateKey(now)).tasks;
  const incompleteCount = tasks.filter((task) => !task.completedAt).length;
  if (incompleteCount === 0) {
    if (activePromptType === "task-reminder") clearActivePrompt();
    return;
  }
  if (activePromptType === "task-reminder") {
    if (now.getTime() < activePromptExpiresAt) return;
    clearActivePrompt();
  }
  const minutes = now.getHours() * 60 + now.getMinutes();
  const reminderSlot = minutes >= 22 * 60 ? "22:00" : minutes >= 21 * 60 + 6 ? "21:00" : undefined;
  if (!reminderSlot) return;
  const day = getDay(studyState, localDateKey(now));
  if (day.taskReminders.includes(reminderSlot)) return;
  const key = `${localDateKey(now)}:tasks:${reminderSlot}`;
  studyState = markTaskReminderShown(studyState, reminderSlot, now);
  void persistState();
  const pool = reminderSlot === "21:00"
    ? [`今天还有 ${incompleteCount} 件事没划掉，要一起看一眼吗？`, `还有 ${incompleteCount} 件小事留在今天，我们去看看吧。`, `收尾前，还有 ${incompleteCount} 项任务在等你。`]
    : [`还有 ${incompleteCount} 件事没有完成，需要再确认一下吗？`, `睡前再看一眼吧，今天还留着 ${incompleteCount} 项任务。`, `我再轻轻提醒一次，还有 ${incompleteCount} 件事没划掉。`];
  activePromptKey = key;
  activePromptType = "task-reminder";
  activePromptExpiresAt = now.getTime() + 25 * 60_000;
  bubblePromptActive = true;
  petWindow?.webContents.send("xiaolu:prompt", {
    id: key,
    type: "task-reminder",
    label: "看任务",
    message: chooseLine(`taskReminder-${reminderSlot}`, pool),
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
  const date = localDateKey(now);
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
  settlementDate = localDateKey(now);
  nextSettlementActionAt = now.getTime() + randomBetween(4 * 60_000, 7 * 60_000);
}

function playSettlementAction(report: DailyReport, announce: boolean): void {
  if (report.selfCompleted && report.friendCompleted) {
    emitAction("jumping", announce ? "我们都完成啦，这枚双人书签要好好收着。" : undefined, announce ? "✦" : undefined, 1_900, announce ? "settlement-together-1" : undefined);
  } else if (report.selfCompleted && !report.friendCompleted) {
    emitAction("review", announce ? "你的这份完成了，双人书签留给下一次一起赢。" : undefined, undefined, 1_750, announce ? "settlement-self-1" : undefined);
  } else if (!report.selfCompleted && report.friendCompleted) {
    emitAction("waiting", announce ? "她完成了今天的约定，明天继续一起走吧。" : undefined, undefined, 1_750, announce ? "settlement-friend-1" : undefined);
  } else {
    emitAction("idle", announce ? "今天先好好留档，双人书签明天再一起争取。" : undefined, undefined, 1_750, announce ? "settlement-none-1" : undefined);
  }
}

function publicState(message?: string): Record<string, unknown> {
  const now = new Date();
  const reconciled = reconcileStudyState(studyState, now);
  studyState = reconciled.state;
  const date = localDateKey(now);
  const today = getDay(studyState, date);
  const pending = reconciled.pendingCheckIn;
  const checkIns = CHECK_IN_SLOTS.map((slot) => {
    const record = today.checkIns[slot];
    return {
      slot,
      status: record?.status ?? (pending?.slot === slot ? "pending" : "upcoming"),
      ...(record?.checkedAt ? { checkedAt: record.checkedAt } : {}),
    };
  });
  const yuQuizEnabled = studyState.settings.yuQuizIntegration;
  const yuQuizSnapshot = yuQuizRuntime.snapshot ?? today.yuQuiz;
  const yuQuizMode = yuQuizSnapshot?.studyState;
  const yuQuizIsStudying = yuQuizMode === "learning" || yuQuizMode === "consulting" || (!yuQuizMode && yuQuizSnapshot?.isLearning === true);
  const isStudying = yuQuizEnabled ? yuQuizIsStudying : Boolean(studyState.activeSessionStartedAt);
  return {
    version: studyState.version,
    now: now.toISOString(),
    date,
    isStudying,
    activeSessionStartedAt: yuQuizEnabled ? null : studyState.activeSessionStartedAt ?? null,
    persistentAnimation: pending ? "waiting" : !yuQuizEnabled && isStudying ? "running" : "idle",
    pendingCheckIn: pending ?? null,
    today: {
      date,
      studyMs: studyMsForDay(studyState, date, now),
      checkIns,
      tasks: today.tasks,
      report: today.report ?? null,
      yuQuiz: yuQuizSnapshot ?? null,
    },
    bounties: studyState.bounties,
    history: daySummaries(studyState, now),
    stats: calculateStats(studyState, now),
    settings: studyState.settings,
    yuQuiz: {
      enabled: yuQuizEnabled,
      connected: yuQuizRuntime.connected,
      statusAvailable: yuQuizRuntime.statusAvailable,
      snapshot: yuQuizSnapshot ?? null,
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

function persistState(): Promise<void> {
  persistQueue = persistQueue.then(async () => {
    await mkdir(app.getPath("userData"), { recursive: true });
    const temp = `${stateFile}.tmp`;
    await writeFile(temp, `${JSON.stringify(studyState, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
    await rename(temp, stateFile);
  }).catch((error) => console.error("Failed to persist Xiaolu study state", error));
  return persistQueue;
}

function stopDragging(): void {
  dragging = null;
  if (dragTimer) clearInterval(dragTimer);
  dragTimer = null;
}

function handleYuQuizDocking(snapshot?: YuQuizSnapshot): void {
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
