export const STUDY_FOREGROUND_GRACE_MS = 15 * 60_000;

export interface StudyForegroundDecisionInput {
  readonly now: number;
  readonly strictKey: string;
  readonly strictStartedAt: number;
  readonly effectiveStudy: boolean;
  readonly hasStudiedThisPeriod: boolean;
  readonly inactiveSince: number;
  readonly suppressed: boolean;
}

export interface StudyForegroundDecision {
  readonly kind: "start" | "return";
  readonly dueAt: number;
  readonly key: string;
}

export interface YuReaderPatrolSnapshot {
  readonly pageOpen?: boolean;
  readonly studyState?: string;
  readonly currentView?: string;
}

export function classifyYuReaderPatrol(snapshot?: YuReaderPatrolSnapshot): {
  readonly active: boolean;
  readonly enteredContent: boolean;
  readonly waitingAtHome: boolean;
} {
  const state = snapshot?.studyState ?? "closed";
  const pageOpen = snapshot?.pageOpen === true;
  const active = state === "learning" || state === "consulting";
  const enteredContent = pageOpen && (active || state === "paused" || (snapshot?.currentView ?? "home") !== "home");
  const waitingAtHome = pageOpen && state === "ready" && (snapshot?.currentView ?? "home") === "home";
  return { active, enteredContent, waitingAtHome };
}

export function canCheckInWhileStudying(input: {
  readonly manualSessionActive: boolean;
  readonly yuReaderState?: string | undefined;
}): boolean {
  return input.manualSessionActive || input.yuReaderState === "learning" || input.yuReaderState === "consulting";
}

export function shouldAutoOpenYuReaderForCheckIn(input: {
  readonly enabled: boolean;
  readonly slot: string;
  readonly now: number;
  readonly scheduledAt: number;
  readonly windowEnd: number;
  readonly pageOpen: boolean;
  readonly alreadyHandled: boolean;
}): boolean {
  return input.enabled
    && (input.slot === "09:00" || input.slot === "18:00" || input.slot === "21:00")
    && !input.pageOpen
    && !input.alreadyHandled
    && input.now >= input.scheduledAt
    && input.now <= input.windowEnd;
}

export function strongSupervisionBlocksPanel(mode: string | null | undefined): boolean {
  return mode === "strong-start" || mode === "strong-return";
}

export function shouldRepeatStudyForeground(input: {
  readonly key: string;
  readonly lastKey: string;
  readonly now: number;
  readonly lastAt: number;
  readonly pageOpen: boolean;
  readonly pageVisible: boolean;
  readonly repeatMs: number;
}): boolean {
  if (input.key !== input.lastKey) return true;
  return input.pageOpen
    && !input.pageVisible
    && input.now - input.lastAt >= input.repeatMs;
}

export function studyForegroundDecision(input: StudyForegroundDecisionInput): StudyForegroundDecision | undefined {
  if (input.effectiveStudy || input.suppressed) return undefined;
  const kind = input.hasStudiedThisPeriod ? "return" : "start";
  const basis = kind === "return"
    ? Math.max(input.strictStartedAt, input.inactiveSince)
    : input.strictStartedAt;
  const dueAt = basis + STUDY_FOREGROUND_GRACE_MS;
  if (!Number.isFinite(input.now) || input.now < dueAt) return undefined;
  return { kind, dueAt, key: `${input.strictKey}:${kind}:${dueAt}` };
}
