import {
  app,
  BrowserWindow,
  ipcMain,
  Menu,
  nativeImage,
  powerMonitor,
  screen,
  Tray,
  type IpcMainEvent,
} from "electron";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { join } from "node:path";

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
  normalizeStudyState,
  reconcileStudyState,
  setDailyTaskCompleted,
  setDailyTaskRecurring,
  setLaunchAtLogin,
  studyMsForDay,
  submitDailyReport,
  toggleStudy,
  type CheckInSlot,
  type DailyReport,
  type ReportInput,
  type StudyState,
} from "./game.js";

const PET_WINDOW = { width: 128, height: 208 } as const;
const PET_HITBOX = { width: 68, height: 102, bottom: 9 } as const;
const PANEL_WINDOW = { width: 420, height: 680 } as const;
const checkInSlots = new Set<string>(CHECK_IN_SLOTS);
const panelViews = new Set(["today", "tasks", "history", "stats", "bookmarks", "report"]);

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
} as const;

let petWindow: BrowserWindow | null = null;
let panelWindow: BrowserWindow | null = null;
let tray: Tray | null = null;
let studyState: StudyState = initialStudyState();
let stateFile = "";
let cursorTimer: NodeJS.Timeout | null = null;
let scheduleTimer: NodeJS.Timeout | null = null;
let stateTimer: NodeJS.Timeout | null = null;
let dragTimer: NodeJS.Timeout | null = null;
let dragging: { startX: number; startY: number; windowX: number; windowY: number; lastCursorX: number } | null = null;
let isPetIgnoringMouse = false;
let bubblePromptActive = false;
let bubbleHitbox: { left: number; top: number; width: number; height: number } | null = null;
let activePromptKey: string | null = null;
let activePromptType: "check-in" | "task-reminder" | null = null;
let activePromptExpiresAt = 0;
let lastDragDirection: "left" | "right" = "right";
let isQuitting = false;
let persistQueue = Promise.resolve();
let nextSettlementActionAt = 0;
let settlementDate = "";
const lastLineByPool = new Map<string, string>();

if (process.platform === "win32") app.commandLine.appendSwitch("disable-features", "CalculateNativeWinOcclusion");
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
  stopDragging();
});

function createPetWindow(): void {
  const display = screen.getPrimaryDisplay();
  const x = display.workArea.x + display.workArea.width - PET_WINDOW.width - 36;
  const y = display.workArea.y + display.workArea.height - PET_WINDOW.height - 20;
  petWindow = new BrowserWindow({
    title: "小鹿共学搭子",
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
    petWindow = null;
    isPetIgnoringMouse = false;
  });
  petWindow.webContents.on("did-finish-load", () => {
    if (!petWindow || petWindow.isDestroyed()) return;
    petWindow.setContentBounds({ x, y, width: PET_WINDOW.width, height: PET_WINDOW.height }, false);
    petWindow.showInactive();
    syncPetMousePassthrough();
    sendState();
    void evaluateSchedule(false);
  });
  void petWindow.loadFile(join(app.getAppPath(), "dist", "renderer", "pet.html"));
}

function createPanelWindow(): BrowserWindow {
  if (panelWindow && !panelWindow.isDestroyed()) return panelWindow;
  panelWindow = new BrowserWindow({
    title: "小鹿共学日记",
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
}

function createTray(): void {
  const icon = nativeImage.createFromPath(join(app.getAppPath(), "dist", "assets", "icons", "tray-icon-32.png"));
  tray = new Tray(icon);
  tray.setToolTip("小鹿共学搭子");
  refreshTrayMenu();
  tray.on("double-click", () => showPanel());
}

function refreshTrayMenu(): void {
  if (!tray) return;
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
  });
}

async function performToggleStudy(): Promise<Record<string, unknown>> {
  const result = toggleStudy(studyState, new Date());
  studyState = result.state;
  await persistState();
  sendState();
  refreshTrayMenu();
  if (result.messageKey === "started") {
    emitAction("waving", chooseLine("studyStarted", lines.studyStarted), "✦", 1_500);
  } else if (result.messageKey === "stopped") {
    emitAction("review", chooseLine("studyStopped", lines.studyStopped), "✓", 1_650);
  } else {
    emitAction("idle", chooseLine("dayClosed", lines.dayClosed), undefined, 1_200);
  }
  return publicState();
}

async function performCheckIn(requested?: CheckInSlot): Promise<Record<string, unknown>> {
  const result = checkIn(studyState, new Date(), requested);
  studyState = result.state;
  if (!result.accepted) return publicState(result.reason === "already-recorded" ? "这一格已经打过卡啦。" : "现在不在打卡时间内。");
  clearActivePrompt();
  await persistState();
  sendState();
  emitAction("waving", chooseLine("checkInSuccess", lines.checkInSuccess), "✓", 1_500);
  if (result.shouldOpenReport) setTimeout(() => showPanel("report"), 650);
  return publicState();
}

async function performReport(value: unknown): Promise<Record<string, unknown>> {
  if (!isRecord(value)) throw new Error("今日结算内容格式不正确。");
  const input: ReportInput = {
    problemCount: typeof value.problemCount === "number" ? value.problemCount : Number(value.problemCount),
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

async function performEditTask(id: string, title: string): Promise<Record<string, unknown>> {
  studyState = editDailyTask(studyState, id, title, new Date());
  await persistState();
  sendState();
  return publicState("改好啦，今天就按这个来。");
}

async function performSetTaskCompleted(id: string, completed: boolean): Promise<Record<string, unknown>> {
  studyState = setDailyTaskCompleted(studyState, id, completed, new Date());
  await persistState();
  sendState();
  const tasks = getDay(studyState, localDateKey()).tasks;
  if (completed && tasks.length > 0 && tasks.every((task) => task.completedAt)) {
    if (activePromptType === "task-reminder") clearActivePrompt();
    emitAction("jumping", chooseLine("allTasksCompleted", lines.allTasksCompleted), "✦", 1_800);
  } else if (completed) {
    emitAction("waving", chooseLine("taskCompleted", lines.taskCompleted), "✓", 1_350);
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

async function evaluateSchedule(announceMissed: boolean): Promise<void> {
  const now = new Date();
  const result = reconcileStudyState(studyState, now);
  const changed = JSON.stringify(result.state) !== JSON.stringify(studyState);
  studyState = result.state;
  if (changed) void persistState();

  if (result.pendingCheckIn) {
    const key = `${localDateKey(now)}:${result.pendingCheckIn.slot}`;
    if (activePromptKey !== key || activePromptType !== "check-in") {
      activePromptKey = key;
      activePromptType = "check-in";
      activePromptExpiresAt = new Date(result.pendingCheckIn.windowEnd).getTime();
      bubblePromptActive = true;
      const slot = result.pendingCheckIn.slot;
      const pool = lines.checkIn[slot];
      petWindow?.webContents.send("xiaolu:prompt", {
        id: key,
        type: "check-in",
        slot,
        label: "我在",
        message: chooseLine(`checkIn-${slot}`, pool),
        expiresAt: result.pendingCheckIn.windowEnd,
      });
    }
  } else if (activePromptType === "check-in") {
    clearActivePrompt();
  }

  if (announceMissed && result.newlyMissed.length > 0) {
    emitAction("failed", chooseLine("missed", lines.missed), undefined, 1_850);
  }
  if (!result.pendingCheckIn) maybePromptIncompleteTasks(now);
  maybePlaySettlementAction(now);
  sendState();
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
  activePromptKey = null;
  activePromptType = null;
  activePromptExpiresAt = 0;
  bubblePromptActive = false;
  petWindow?.webContents.send("xiaolu:clear-prompt");
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
    emitAction("jumping", announce ? "我们都完成啦，这枚双人书签要好好收着。" : undefined, announce ? "✦" : undefined, 1_900);
  } else if (report.selfCompleted && !report.friendCompleted) {
    emitAction("failed", announce ? "你的这份完成了，我会把今天如实记下来。" : undefined, undefined, 1_850);
  } else if (!report.selfCompleted && report.friendCompleted) {
    emitAction("waiting", announce ? "她完成了今天的约定，明天继续一起走吧。" : undefined, undefined, 1_750);
  } else {
    emitAction("failed", announce ? "今天先留档，明天我们重新开始。" : undefined, undefined, 1_850);
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
      tasks: today.tasks,
      report: today.report ?? null,
    },
    history: daySummaries(studyState, now),
    stats: calculateStats(studyState, now),
    settings: studyState.settings,
    ...(message ? { message } : {}),
  };
}

function sendState(): void {
  const snapshot = publicState();
  if (petWindow && !petWindow.isDestroyed()) petWindow.webContents.send("xiaolu:state", snapshot);
  if (panelWindow && !panelWindow.isDestroyed()) panelWindow.webContents.send("xiaolu:state", snapshot);
}

function emitAction(animation: string, message?: string, effect?: string, lockMs = 1_700): void {
  const payload = {
    animation,
    lockMs,
    ...(message ? { message } : {}),
    ...(effect ? { effect } : {}),
  };
  petWindow?.webContents.send("xiaolu:play-action", payload);
  panelWindow?.webContents.send("xiaolu:play-action", payload);
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

function setPetMousePassthrough(ignoreMouse: boolean): void {
  if (!petWindow || petWindow.isDestroyed() || isPetIgnoringMouse === ignoreMouse) return;
  petWindow.setIgnoreMouseEvents(ignoreMouse, { forward: true });
  isPetIgnoringMouse = ignoreMouse;
}

function syncPetMousePassthrough(cursor = screen.getCursorScreenPoint()): void {
  if (!petWindow || petWindow.isDestroyed()) return;
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
  const work = screen.getPrimaryDisplay().workArea;
  const hitboxLeft = (PET_WINDOW.width - PET_HITBOX.width) / 2;
  const hitboxTop = PET_WINDOW.height - PET_HITBOX.bottom - PET_HITBOX.height;
  const hitboxRight = hitboxLeft + PET_HITBOX.width;
  const hitboxBottom = hitboxTop + PET_HITBOX.height;
  const minX = work.x - hitboxLeft;
  const maxX = work.x + work.width - hitboxRight;
  const minY = work.y - hitboxTop;
  const maxY = work.y + work.height - hitboxBottom;
  petWindow.setContentBounds({
    x: Math.round(Math.min(maxX, Math.max(minX, x))),
    y: Math.round(Math.min(maxY, Math.max(minY, y))),
    width: PET_WINDOW.width,
    height: PET_WINDOW.height,
  }, false);
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
