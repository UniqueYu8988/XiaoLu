export const CHECK_IN_SLOTS = ["09:00", "12:00", "15:00", "18:00", "21:00"] as const;

export type CheckInSlot = typeof CHECK_IN_SLOTS[number];
export type CheckInStatus = "checked" | "missed";
export type BookmarkType = "together";
export type BountySlot = "self" | "gift";
export type TaskReminderSlot = "21:00" | "22:00";

export interface StudySession {
  readonly startedAt: string;
  readonly endedAt: string;
}

export interface CheckInRecord {
  readonly status: CheckInStatus;
  readonly checkedAt?: string;
}

export interface DailyReport {
  readonly submittedAt: string;
  readonly problemCount: number;
  readonly note: string;
  readonly selfCompleted: boolean;
  readonly friendCompleted: boolean;
  readonly bookmark?: BookmarkType;
}

export interface DailyTask {
  readonly id: string;
  readonly title: string;
  readonly createdAt: string;
  readonly completedAt?: string;
  readonly recurringTaskId?: string;
  readonly bountySlot?: BountySlot;
}

export interface RecurringTask {
  readonly id: string;
  readonly title: string;
  readonly createdAt: string;
}

export interface BountyDefinition {
  readonly slot: BountySlot;
  readonly title: string;
  readonly updatedAt: string;
}

export interface DayRecord {
  readonly date: string;
  readonly sessions: readonly StudySession[];
  readonly checkIns: Readonly<Partial<Record<CheckInSlot, CheckInRecord>>>;
  readonly tasks: readonly DailyTask[];
  readonly taskReminders: readonly TaskReminderSlot[];
  readonly report?: DailyReport;
}

export interface StudySettings {
  readonly launchAtLogin: boolean;
}

export interface StudyState {
  readonly version: 2;
  readonly activeSessionStartedAt?: string;
  readonly days: Readonly<Record<string, DayRecord>>;
  readonly recurringTasks: readonly RecurringTask[];
  readonly bounties: Readonly<Partial<Record<BountySlot, BountyDefinition>>>;
  readonly settings: StudySettings;
  readonly lastEvaluatedAt: string;
}

export interface PendingCheckIn {
  readonly slot: CheckInSlot;
  readonly windowStart: string;
  readonly windowEnd: string;
}

export interface ReconcileResult {
  readonly state: StudyState;
  readonly newlyMissed: readonly CheckInSlot[];
  readonly pendingCheckIn?: PendingCheckIn;
}

export interface ToggleResult {
  readonly state: StudyState;
  readonly changed: boolean;
  readonly isStudying: boolean;
  readonly messageKey: "started" | "stopped" | "day-closed";
}

export interface CheckInResult {
  readonly state: StudyState;
  readonly accepted: boolean;
  readonly slot?: CheckInSlot;
  readonly shouldOpenReport: boolean;
  readonly reason?: "outside-window" | "already-recorded";
}

export interface ReportInput {
  readonly problemCount: number;
  readonly note: string;
  readonly selfCompleted: boolean;
  readonly friendCompleted: boolean;
}

export interface PublicDaySummary {
  readonly date: string;
  readonly studyMs: number;
  readonly checkedCount: number;
  readonly missedCount: number;
  readonly taskCount: number;
  readonly completedTaskCount: number;
  readonly bountyCount: number;
  readonly completedBountyCount: number;
  readonly report?: DailyReport;
}

export interface StudyStats {
  readonly totalStudyMs: number;
  readonly totalProblems: number;
  readonly completedTasks: number;
  readonly completedBounties: number;
  readonly checkedCount: number;
  readonly missedCount: number;
  readonly togetherBookmarks: number;
  readonly selfBountyBookmarks: number;
  readonly giftBountyBookmarks: number;
}

const SLOT_MINUTES: Record<CheckInSlot, number> = {
  "09:00": 9 * 60,
  "12:00": 12 * 60,
  "15:00": 15 * 60,
  "18:00": 18 * 60,
  "21:00": 21 * 60,
};

export function initialStudyState(now = new Date()): StudyState {
  return {
    version: 2,
    days: {},
    recurringTasks: [],
    bounties: {},
    settings: { launchAtLogin: true },
    lastEvaluatedAt: now.toISOString(),
  };
}

export function normalizeStudyState(value: unknown, now = new Date()): StudyState {
  if (!isRecord(value) || value.version !== 2) return initialStudyState(now);
  const days: Record<string, DayRecord> = {};
  if (isRecord(value.days)) {
    for (const [date, rawDay] of Object.entries(value.days)) {
      if (!isDateKey(date) || !isRecord(rawDay)) continue;
      days[date] = normalizeDay(rawDay, date);
    }
  }
  const activeSessionStartedAt = isDateString(value.activeSessionStartedAt) ? value.activeSessionStartedAt : undefined;
  const recurringTasks: RecurringTask[] = [];
  if (Array.isArray(value.recurringTasks)) {
    for (const raw of value.recurringTasks) {
      if (!isRecord(raw)) continue;
      const id = normalizeTaskId(raw.id);
      const title = normalizeTaskTitle(raw.title);
      const createdAt = isDateString(raw.createdAt) ? raw.createdAt : undefined;
      if (!id || !title || !createdAt || recurringTasks.some((task) => task.id === id)) continue;
      recurringTasks.push({ id, title, createdAt });
    }
  }
  const bounties: Partial<Record<BountySlot, BountyDefinition>> = {};
  if (isRecord(value.bounties)) {
    for (const slot of ["self", "gift"] as const) {
      const raw = value.bounties[slot];
      if (!isRecord(raw)) continue;
      const title = normalizeTaskTitle(raw.title);
      const updatedAt = isDateString(raw.updatedAt) ? raw.updatedAt : undefined;
      if (title && updatedAt) bounties[slot] = { slot, title, updatedAt };
    }
  }
  const settingsValue = isRecord(value.settings) ? value.settings : {};
  return {
    version: 2,
    ...(activeSessionStartedAt ? { activeSessionStartedAt } : {}),
    days,
    recurringTasks,
    bounties,
    settings: { launchAtLogin: settingsValue.launchAtLogin !== false },
    lastEvaluatedAt: isDateString(value.lastEvaluatedAt) ? value.lastEvaluatedAt : now.toISOString(),
  };
}

export function reconcileStudyState(current: StudyState, now = new Date()): ReconcileResult {
  let state = normalizeStudyState(current, now);
  state = splitActiveSessionAtMidnights(state, now);
  const days = cloneDays(state.days);
  const today = localDateKey(now);
  const todayRecord = days[today] ?? emptyDay(today);
  const todayTasks = [...todayRecord.tasks];
  for (const slot of ["self", "gift"] as const) {
    const bounty = state.bounties[slot];
    if (!bounty || todayTasks.some((task) => task.bountySlot === slot)) continue;
    todayTasks.push({
      id: `bounty:${slot}:${today}`,
      title: bounty.title,
      createdAt: now.toISOString(),
      bountySlot: slot,
    });
  }
  for (const recurring of state.recurringTasks) {
    if (todayTasks.some((task) => task.recurringTaskId === recurring.id)) continue;
    todayTasks.push({
      id: `repeat:${recurring.id}:${today}`,
      title: recurring.title,
      createdAt: now.toISOString(),
      recurringTaskId: recurring.id,
    });
  }
  if (todayTasks.length !== todayRecord.tasks.length || !days[today]) days[today] = { ...todayRecord, tasks: todayTasks };
  const existingKeys = new Set(Object.keys(days));
  existingKeys.add(today);
  const lastDate = localDateKey(new Date(state.lastEvaluatedAt));
  if (days[lastDate]) existingKeys.add(lastDate);
  const newlyMissed: CheckInSlot[] = [];

  for (const date of existingKeys) {
    const shouldCreate = date === today || Boolean(days[date]);
    if (!shouldCreate) continue;
    const day = days[date] ?? emptyDay(date);
    const checkIns = { ...day.checkIns };
    let changed = !days[date];
    for (const slot of CHECK_IN_SLOTS) {
      if (checkIns[slot]) continue;
      const { end } = checkInWindow(date, slot);
      if (now.getTime() > end.getTime()) {
        checkIns[slot] = { status: "missed" };
        changed = true;
        if (date === today) newlyMissed.push(slot);
      }
    }
    if (changed) days[date] = { ...day, checkIns };
  }

  const next: StudyState = {
    ...state,
    days,
    lastEvaluatedAt: now.toISOString(),
  };
  const pendingCheckIn = findPendingCheckIn(next, now);
  return {
    state: next,
    newlyMissed,
    ...(pendingCheckIn ? { pendingCheckIn } : {}),
  };
}

export function toggleStudy(current: StudyState, now = new Date()): ToggleResult {
  const reconciled = reconcileStudyState(current, now).state;
  const today = getDay(reconciled, localDateKey(now));
  if (!reconciled.activeSessionStartedAt && today.report) {
    return { state: reconciled, changed: false, isStudying: false, messageKey: "day-closed" };
  }
  if (reconciled.activeSessionStartedAt) {
    const state = closeActiveSession(reconciled, now);
    return { state, changed: true, isStudying: false, messageKey: "stopped" };
  }
  return {
    state: { ...reconciled, activeSessionStartedAt: now.toISOString(), lastEvaluatedAt: now.toISOString() },
    changed: true,
    isStudying: true,
    messageKey: "started",
  };
}

export function checkIn(current: StudyState, now = new Date(), requestedSlot?: CheckInSlot): CheckInResult {
  const reconciled = reconcileStudyState(current, now);
  const pending = reconciled.pendingCheckIn;
  if (!pending || (requestedSlot && requestedSlot !== pending.slot)) {
    return { state: reconciled.state, accepted: false, shouldOpenReport: false, reason: "outside-window" };
  }
  const date = localDateKey(now);
  const day = getDay(reconciled.state, date);
  if (day.checkIns[pending.slot]) {
    return { state: reconciled.state, accepted: false, shouldOpenReport: false, reason: "already-recorded" };
  }
  const days = cloneDays(reconciled.state.days);
  days[date] = {
    ...day,
    checkIns: { ...day.checkIns, [pending.slot]: { status: "checked", checkedAt: now.toISOString() } },
  };
  return {
    state: { ...reconciled.state, days, lastEvaluatedAt: now.toISOString() },
    accepted: true,
    slot: pending.slot,
    shouldOpenReport: pending.slot === "21:00",
  };
}

export function submitDailyReport(current: StudyState, input: ReportInput, now = new Date()): StudyState {
  let state = reconcileStudyState(current, now).state;
  if (state.activeSessionStartedAt) state = closeActiveSession(state, now);
  const date = localDateKey(now);
  const day = getDay(state, date);
  const problemCount = clampInteger(input.problemCount, 0, 1_000_000);
  const note = typeof input.note === "string" ? input.note.trim().slice(0, 120) : "";
  const bookmark = bookmarkFor(input.selfCompleted, input.friendCompleted);
  const report: DailyReport = {
    submittedAt: now.toISOString(),
    problemCount,
    note,
    selfCompleted: input.selfCompleted,
    friendCompleted: input.friendCompleted,
    ...(bookmark ? { bookmark } : {}),
  };
  const days = cloneDays(state.days);
  days[date] = { ...day, report };
  return { ...state, days, lastEvaluatedAt: now.toISOString() };
}

export function addDailyTask(current: StudyState, id: string, title: string, now = new Date()): StudyState {
  const state = reconcileStudyState(current, now).state;
  const normalizedId = normalizeTaskId(id);
  const normalizedTitle = normalizeTaskTitle(title);
  if (!normalizedId || !normalizedTitle) throw new Error("任务内容不能为空。");
  const date = localDateKey(now);
  const day = getDay(state, date);
  if (day.tasks.some((task) => task.id === normalizedId)) throw new Error("任务编号重复。");
  const days = cloneDays(state.days);
  days[date] = {
    ...day,
    tasks: [...day.tasks, { id: normalizedId, title: normalizedTitle, createdAt: now.toISOString() }],
  };
  return { ...state, days, lastEvaluatedAt: now.toISOString() };
}

export function editDailyTask(current: StudyState, id: string, title: string, now = new Date()): StudyState {
  const state = reconcileStudyState(current, now).state;
  const normalizedTitle = normalizeTaskTitle(title);
  if (!normalizedTitle) throw new Error("任务内容不能为空。");
  const task = getDay(state, localDateKey(now)).tasks.find((item) => item.id === id);
  const updated = updateTodayTasks(state, id, now, (item) => ({ ...item, title: normalizedTitle }));
  if (task?.bountySlot) {
    return {
      ...updated,
      bounties: {
        ...updated.bounties,
        [task.bountySlot]: { slot: task.bountySlot, title: normalizedTitle, updatedAt: now.toISOString() },
      },
    };
  }
  if (!task?.recurringTaskId) return updated;
  return {
    ...updated,
    recurringTasks: updated.recurringTasks.map((item) => item.id === task.recurringTaskId ? { ...item, title: normalizedTitle } : item),
  };
}

export function setDailyTaskCompleted(current: StudyState, id: string, completed: boolean, now = new Date()): StudyState {
  const state = reconcileStudyState(current, now).state;
  return updateTodayTasks(state, id, now, (task) => {
    if (completed) return task.completedAt ? task : { ...task, completedAt: now.toISOString() };
    const { completedAt: _completedAt, ...rest } = task;
    return rest;
  });
}

export function deleteDailyTask(current: StudyState, id: string, now = new Date()): StudyState {
  const state = reconcileStudyState(current, now).state;
  const date = localDateKey(now);
  const day = getDay(state, date);
  const removed = day.tasks.find((task) => task.id === id);
  if (removed?.bountySlot) throw new Error("悬赏会每天守在这里，可以直接修改内容。");
  const tasks = day.tasks.filter((task) => task.id !== id);
  if (tasks.length === day.tasks.length) return state;
  const days = cloneDays(state.days);
  days[date] = { ...day, tasks };
  return {
    ...state,
    days,
    recurringTasks: removed?.recurringTaskId
      ? state.recurringTasks.filter((task) => task.id !== removed.recurringTaskId)
      : state.recurringTasks,
    lastEvaluatedAt: now.toISOString(),
  };
}

export function setDailyTaskRecurring(
  current: StudyState,
  id: string,
  recurring: boolean,
  newRecurringTaskId: string,
  now = new Date(),
): StudyState {
  const state = reconcileStudyState(current, now).state;
  const date = localDateKey(now);
  const day = getDay(state, date);
  const task = day.tasks.find((item) => item.id === id);
  if (!task) return state;
  if (task.bountySlot) throw new Error("悬赏本身就是每日任务，不需要再次固定。");
  const recurringTaskId = task.recurringTaskId ?? normalizeTaskId(newRecurringTaskId);
  if (recurring && !recurringTaskId) throw new Error("固定任务编号不正确。");
  const tasks = day.tasks.map((item) => {
    if (item.id !== id) return item;
    if (recurring) return { ...item, recurringTaskId: recurringTaskId as string };
    const { recurringTaskId: _recurringTaskId, ...rest } = item;
    return rest;
  });
  let recurringTasks = state.recurringTasks;
  if (recurring && recurringTaskId) {
    recurringTasks = state.recurringTasks.some((item) => item.id === recurringTaskId)
      ? state.recurringTasks.map((item) => item.id === recurringTaskId ? { ...item, title: task.title } : item)
      : [...state.recurringTasks, { id: recurringTaskId, title: task.title, createdAt: now.toISOString() }];
  } else if (task.recurringTaskId) {
    recurringTasks = state.recurringTasks.filter((item) => item.id !== task.recurringTaskId);
  }
  const days = cloneDays(state.days);
  days[date] = { ...day, tasks };
  return { ...state, days, recurringTasks, lastEvaluatedAt: now.toISOString() };
}

export function setBountyDefinition(
  current: StudyState,
  slot: BountySlot,
  title: string,
  now = new Date(),
): StudyState {
  const state = reconcileStudyState(current, now).state;
  const normalizedTitle = normalizeTaskTitle(title);
  const date = localDateKey(now);
  const day = getDay(state, date);
  if (!normalizedTitle) {
    const days = cloneDays(state.days);
    days[date] = { ...day, tasks: day.tasks.filter((task) => task.bountySlot !== slot) };
    const bounties: Partial<Record<BountySlot, BountyDefinition>> = { ...state.bounties };
    delete bounties[slot];
    return { ...state, days, bounties, lastEvaluatedAt: now.toISOString() };
  }
  const existing = day.tasks.find((task) => task.bountySlot === slot);
  const task: DailyTask = existing
    ? { ...existing, title: normalizedTitle }
    : { id: `bounty:${slot}:${date}`, title: normalizedTitle, createdAt: now.toISOString(), bountySlot: slot };
  const tasks = existing ? day.tasks.map((item) => item.id === existing.id ? task : item) : [...day.tasks, task];
  const days = cloneDays(state.days);
  days[date] = { ...day, tasks };
  return {
    ...state,
    days,
    bounties: { ...state.bounties, [slot]: { slot, title: normalizedTitle, updatedAt: now.toISOString() } },
    lastEvaluatedAt: now.toISOString(),
  };
}

export function markTaskReminderShown(current: StudyState, slot: TaskReminderSlot, now = new Date()): StudyState {
  const state = reconcileStudyState(current, now).state;
  const date = localDateKey(now);
  const day = getDay(state, date);
  if (day.taskReminders.includes(slot)) return state;
  const days = cloneDays(state.days);
  days[date] = { ...day, taskReminders: [...day.taskReminders, slot] };
  return { ...state, days, lastEvaluatedAt: now.toISOString() };
}

export function setLaunchAtLogin(current: StudyState, enabled: boolean, now = new Date()): StudyState {
  return {
    ...normalizeStudyState(current, now),
    settings: { launchAtLogin: enabled },
    lastEvaluatedAt: now.toISOString(),
  };
}

export function findPendingCheckIn(state: StudyState, now = new Date()): PendingCheckIn | undefined {
  const date = localDateKey(now);
  const day = getDay(state, date);
  for (const slot of CHECK_IN_SLOTS) {
    if (day.checkIns[slot]) continue;
    const { start, end } = checkInWindow(date, slot);
    if (now.getTime() >= start.getTime() && now.getTime() <= end.getTime()) {
      return { slot, windowStart: start.toISOString(), windowEnd: end.toISOString() };
    }
  }
  return undefined;
}

export function studyMsForDay(state: StudyState, date: string, now = new Date()): number {
  const day = getDay(state, date);
  let total = day.sessions.reduce((sum, session) => sum + durationMs(session.startedAt, session.endedAt), 0);
  if (state.activeSessionStartedAt && localDateKey(new Date(state.activeSessionStartedAt)) === date) {
    total += Math.max(0, now.getTime() - new Date(state.activeSessionStartedAt).getTime());
  }
  return total;
}

export function daySummaries(state: StudyState, now = new Date(), limit = 120): readonly PublicDaySummary[] {
  return Object.keys(state.days)
    .sort((a, b) => b.localeCompare(a))
    .slice(0, limit)
    .map((date) => {
      const day = getDay(state, date);
      const records = Object.values(day.checkIns);
      return {
        date,
        studyMs: studyMsForDay(state, date, now),
        checkedCount: records.filter((item) => item?.status === "checked").length,
        missedCount: records.filter((item) => item?.status === "missed").length,
        taskCount: day.tasks.filter((task) => !task.bountySlot).length,
        completedTaskCount: day.tasks.filter((task) => !task.bountySlot && task.completedAt).length,
        bountyCount: day.tasks.filter((task) => task.bountySlot).length,
        completedBountyCount: day.tasks.filter((task) => task.bountySlot && task.completedAt).length,
        ...(day.report ? { report: day.report } : {}),
      };
    });
}

export function calculateStats(state: StudyState, now = new Date()): StudyStats {
  const summaries = daySummaries(state, now, Number.MAX_SAFE_INTEGER);
  let totalProblems = 0;
  let completedTasks = 0;
  let checkedCount = 0;
  let missedCount = 0;
  let togetherBookmarks = 0;
  let selfBountyBookmarks = 0;
  let giftBountyBookmarks = 0;
  for (const summary of summaries) {
    totalProblems += summary.report?.problemCount ?? 0;
    completedTasks += summary.completedTaskCount;
    checkedCount += summary.checkedCount;
    missedCount += summary.missedCount;
    if (summary.report?.bookmark === "together") togetherBookmarks += 1;
    const tasks = getDay(state, summary.date).tasks;
    selfBountyBookmarks += tasks.filter((task) => task.bountySlot === "self" && task.completedAt).length;
    giftBountyBookmarks += tasks.filter((task) => task.bountySlot === "gift" && task.completedAt).length;
  }
  return {
    totalStudyMs: summaries.reduce((sum, item) => sum + item.studyMs, 0),
    totalProblems,
    completedTasks,
    completedBounties: selfBountyBookmarks + giftBountyBookmarks,
    checkedCount,
    missedCount,
    togetherBookmarks,
    selfBountyBookmarks,
    giftBountyBookmarks,
  };
}

export function localDateKey(date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function checkInWindow(date: string, slot: CheckInSlot): { readonly start: Date; readonly end: Date } {
  const base = dateAtLocalMidnight(date);
  const center = new Date(base.getTime() + SLOT_MINUTES[slot] * 60_000);
  return {
    start: new Date(center.getTime() - 5 * 60_000),
    end: new Date(center.getTime() + 5 * 60_000),
  };
}

export function getDay(state: StudyState, date: string): DayRecord {
  return state.days[date] ?? emptyDay(date);
}

function closeActiveSession(state: StudyState, now: Date): StudyState {
  const startedAt = state.activeSessionStartedAt;
  if (!startedAt) return state;
  const start = new Date(startedAt);
  if (now.getTime() <= start.getTime()) {
    const { activeSessionStartedAt: _active, ...rest } = state;
    return { ...rest, lastEvaluatedAt: now.toISOString() };
  }
  const date = localDateKey(start);
  const day = getDay(state, date);
  const days = cloneDays(state.days);
  days[date] = { ...day, sessions: [...day.sessions, { startedAt, endedAt: now.toISOString() }] };
  const { activeSessionStartedAt: _active, ...rest } = state;
  return { ...rest, days, lastEvaluatedAt: now.toISOString() };
}

function splitActiveSessionAtMidnights(state: StudyState, now: Date): StudyState {
  if (!state.activeSessionStartedAt) return state;
  let cursor = new Date(state.activeSessionStartedAt);
  if (cursor.getTime() >= now.getTime()) return state;
  const days = cloneDays(state.days);
  let changed = false;
  while (localDateKey(cursor) !== localDateKey(now)) {
    const nextMidnight = new Date(cursor.getFullYear(), cursor.getMonth(), cursor.getDate() + 1);
    const date = localDateKey(cursor);
    const day = days[date] ?? emptyDay(date);
    days[date] = { ...day, sessions: [...day.sessions, { startedAt: cursor.toISOString(), endedAt: nextMidnight.toISOString() }] };
    cursor = nextMidnight;
    changed = true;
  }
  return changed ? { ...state, days, activeSessionStartedAt: cursor.toISOString() } : state;
}

function normalizeDay(value: Record<string, unknown>, date: string): DayRecord {
  const sessions: StudySession[] = [];
  if (Array.isArray(value.sessions)) {
    for (const raw of value.sessions) {
      if (!isRecord(raw) || !isDateString(raw.startedAt) || !isDateString(raw.endedAt)) continue;
      if (new Date(raw.endedAt).getTime() <= new Date(raw.startedAt).getTime()) continue;
      sessions.push({ startedAt: raw.startedAt, endedAt: raw.endedAt });
    }
  }
  const checkIns: Partial<Record<CheckInSlot, CheckInRecord>> = {};
  if (isRecord(value.checkIns)) {
    for (const slot of CHECK_IN_SLOTS) {
      const raw = value.checkIns[slot];
      if (!isRecord(raw) || (raw.status !== "checked" && raw.status !== "missed")) continue;
      const checkedAt = isDateString(raw.checkedAt) ? raw.checkedAt : undefined;
      checkIns[slot] = { status: raw.status, ...(checkedAt ? { checkedAt } : {}) };
    }
  }
  const report = normalizeReport(value.report);
  const tasks: DailyTask[] = [];
  if (Array.isArray(value.tasks)) {
    for (const raw of value.tasks) {
      if (!isRecord(raw)) continue;
      const id = normalizeTaskId(raw.id);
      const title = normalizeTaskTitle(raw.title);
      const createdAt = isDateString(raw.createdAt) ? raw.createdAt : undefined;
      const completedAt = isDateString(raw.completedAt) ? raw.completedAt : undefined;
      const recurringTaskId = normalizeTaskId(raw.recurringTaskId);
      const bountySlot = raw.bountySlot === "self" || raw.bountySlot === "gift" ? raw.bountySlot : undefined;
      if (!id || !title || !createdAt || tasks.some((task) => task.id === id)) continue;
      tasks.push({ id, title, createdAt, ...(completedAt ? { completedAt } : {}), ...(recurringTaskId ? { recurringTaskId } : {}), ...(bountySlot ? { bountySlot } : {}) });
    }
  }
  const taskReminders = Array.isArray(value.taskReminders)
    ? value.taskReminders.filter((slot): slot is TaskReminderSlot => slot === "21:00" || slot === "22:00")
    : [];
  return { date, sessions, checkIns, tasks, taskReminders: [...new Set(taskReminders)], ...(report ? { report } : {}) };
}

function normalizeReport(value: unknown): DailyReport | undefined {
  if (!isRecord(value) || !isDateString(value.submittedAt)) return undefined;
  const selfCompleted = value.selfCompleted === true;
  const friendCompleted = value.friendCompleted === true;
  const bookmark = bookmarkFor(selfCompleted, friendCompleted);
  return {
    submittedAt: value.submittedAt,
    problemCount: clampInteger(value.problemCount, 0, 1_000_000),
    note: typeof value.note === "string" ? value.note.slice(0, 120) : "",
    selfCompleted,
    friendCompleted,
    ...(bookmark ? { bookmark } : {}),
  };
}

function emptyDay(date: string): DayRecord {
  return { date, sessions: [], checkIns: {}, tasks: [], taskReminders: [] };
}

function cloneDays(days: Readonly<Record<string, DayRecord>>): Record<string, DayRecord> {
  return { ...days };
}

function bookmarkFor(selfCompleted: boolean, friendCompleted: boolean): BookmarkType | undefined {
  if (selfCompleted && friendCompleted) return "together";
  return undefined;
}

function updateTodayTasks(
  state: StudyState,
  id: string,
  now: Date,
  update: (task: DailyTask) => DailyTask,
): StudyState {
  const date = localDateKey(now);
  const day = getDay(state, date);
  let changed = false;
  const tasks = day.tasks.map((task) => {
    if (task.id !== id) return task;
    changed = true;
    return update(task);
  });
  if (!changed) return state;
  const days = cloneDays(state.days);
  days[date] = { ...day, tasks };
  return { ...state, days, lastEvaluatedAt: now.toISOString() };
}

function normalizeTaskId(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const id = value.trim();
  return id.length > 0 && id.length <= 120 ? id : undefined;
}

function normalizeTaskTitle(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const title = value.trim().replace(/\s+/g, " ").slice(0, 60);
  return title || undefined;
}

function dateAtLocalMidnight(date: string): Date {
  const [year = 1970, month = 1, day = 1] = date.split("-").map(Number);
  return new Date(year, month - 1, day);
}

function durationMs(start: string, end: string): number {
  return Math.max(0, new Date(end).getTime() - new Date(start).getTime());
}

function clampInteger(value: unknown, min: number, max: number): number {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.min(max, Math.max(min, Math.round(value)))
    : min;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isDateString(value: unknown): value is string {
  return typeof value === "string" && Number.isFinite(new Date(value).getTime());
}

function isDateKey(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}
