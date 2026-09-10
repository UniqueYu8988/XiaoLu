import type { YuReaderMetric, YuReaderSnapshot, YuReaderSubjectSnapshot } from "./game.js";

type JsonRecord = Record<string, unknown>;

export const YUREADER_BASE_URL = "http://127.0.0.1:8775";

export function parseYuReaderStatus(value: unknown, now = new Date()): YuReaderSnapshot {
  if (!isRecord(value)) throw new Error("YuReader 返回内容格式不正确");
  const today = record(value.today);
  const page = record(value.page);
  const currentActivity = record(value.current_activity);
  const vocabulary = record(today.vocabulary);
  const clearances = record(today.clearances);
  const subjects = record(today.subjects);
  const date = typeof value.study_day === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value.study_day)
    ? value.study_day : localDate(now);
  const rawState = page.study_state;
  const studyState = rawState === "ready" || rawState === "learning" || rawState === "paused" || rawState === "consulting"
    ? rawState : "closed";
  return {
    date,
    learningSeconds: integer(today.learning_seconds, 86_400 * 366),
    reading: metric(today.reading, "actual_seconds", "target_seconds"),
    questions: metric(today.questions, "actual_count", "target_count"),
    vocabularyCount: integer(vocabulary.count, 5000),
    vocabularyTarget: Math.max(1, integer(vocabulary.target_count, 5000)),
    subjects: {
      medicine: subject(subjects.medicine),
      politics: subject(subjects.politics),
      english: subject(subjects.english),
    },
    oralReviewCompleted: record(clearances.oral_review).completed === true,
    mistakeReviewCompleted: record(clearances.mistake_review).completed === true,
    pageOpen: page.open === true,
    pageVisible: page.visible === true,
    studyState,
    pauseReason: typeof page.pause_reason === "string" ? page.pause_reason : "none",
    currentView: typeof currentActivity.view === "string" ? currentActivity.view : "home",
    ...(validDate(page.last_meaningful_activity_at) ? { lastMeaningfulActivityAt: page.last_meaningful_activity_at as string } : {}),
    ...(validDate(value.goals_updated_at) ? { goalsUpdatedAt: value.goals_updated_at as string } : {}),
    lastEventId: integer(value.last_event_id, Number.MAX_SAFE_INTEGER),
    syncedAt: now.toISOString(),
  };
}

function metric(value: unknown, actualKey: string, targetKey: string): YuReaderMetric {
  const item = record(value);
  const actual = number(item[actualKey]);
  const target = number(item[targetKey]);
  const suppliedPercent = number(item.percent);
  return {
    actual,
    target,
    percent: suppliedPercent || (target > 0 ? Math.round(actual / target * 1000) / 10 : 0),
  };
}

function subject(value: unknown): YuReaderSubjectSnapshot {
  const item = record(value);
  const reading = record(item.reading);
  const questions = record(item.questions);
  return {
    percent: number(item.percent),
    readingPercent: number(reading.percent),
    questionsPercent: number(questions.percent),
  };
}

function record(value: unknown): JsonRecord {
  return isRecord(value) ? value : {};
}

function number(value: unknown): number {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? Math.max(0, parsed) : 0;
}

function integer(value: unknown, max: number): number {
  return Math.min(max, Math.trunc(number(value)));
}

function validDate(value: unknown): boolean {
  return typeof value === "string" && Number.isFinite(Date.parse(value));
}

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function localDate(now: Date): string {
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}
