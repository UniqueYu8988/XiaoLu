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
