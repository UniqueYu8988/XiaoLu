import {
  CHECK_IN_SLOTS,
  calculateStats,
  daySummaries,
  getDay,
  localDateKey,
  studyMsForDay,
  type StudyState,
} from "./game.js";

/** Authorized phone view of the desktop's current day and compact history. */
export interface MobileSnapshotV2 {
  readonly schemaVersion: 2;
  readonly generatedAt: string;
  readonly studyDay: string;
  readonly companion: {
    readonly isStudying: boolean;
    readonly studyState: string;
  };
  readonly today: {
    readonly studySeconds: number;
    readonly readingPercent: number;
    readonly questionsPercent: number;
    readonly overallPercent: number;
    readonly vocabularyCount: number;
    readonly vocabularyTarget: number;
    readonly mistakeReviewCompleted: boolean;
    readonly oralReviewCompleted: boolean;
    readonly settled: boolean;
    readonly subjects: {
      readonly medicine: number;
      readonly english: number;
      readonly politics: number;
    };
    readonly checkIns: readonly {
      readonly slot: (typeof CHECK_IN_SLOTS)[number];
      readonly status: "checked" | "missed" | "upcoming";
    }[];
  };
  readonly todos: readonly {
    readonly id: string;
    readonly title: string;
    readonly completed: boolean;
    readonly daily: boolean;
  }[];
  readonly stats: {
    readonly totalStudySeconds: number;
    readonly checkedCount: number;
    readonly togetherBookmarks: number;
    readonly selfBookmarks: number;
    readonly friendBookmarks: number;
    readonly totalVocabulary: number;
  };
  readonly history: readonly {
    readonly date: string;
    readonly studySeconds: number;
    readonly studyTimeUnknown: boolean;
    readonly checkedCount: number;
    readonly completedTaskCount: number;
    readonly taskCount: number;
    readonly readingPercent: number;
    readonly questionsPercent: number;
    readonly vocabularyCount: number;
    readonly note: string;
  }[];
  readonly settings: {
    readonly launchAtLogin: boolean;
    readonly yuReaderEnabled: boolean;
    readonly patrolEnabled: boolean;
    readonly voiceEnabled: boolean;
  };
}

export function createMobileSnapshot(
  state: StudyState,
  studyDay: string,
  now = new Date(),
): MobileSnapshotV2 {
  const day = getDay(state, studyDay);
  const reader = day.yuReader;
  const goals = day.goals;
  const stats = calculateStats(state, now, day.yuQuiz);
  const todos = [...getDay(state, localDateKey(now)).tasks, ...state.backlogTasks]
    .filter((task) => !task.bountySlot)
    .sort((a, b) => Number(Boolean(a.completedAt)) - Number(Boolean(b.completedAt)) || a.createdAt.localeCompare(b.createdAt))
    .map((task) => ({
      id: task.id,
      title: task.title,
      completed: Boolean(task.completedAt),
      daily: Boolean(task.recurringTaskId),
    }));

  return {
    schemaVersion: 2,
    generatedAt: now.toISOString(),
    studyDay,
    companion: {
      isStudying: Boolean(state.activeSessionStartedAt),
      studyState: reader?.studyState ?? "closed",
    },
    today: {
      studySeconds: Math.floor(studyMsForDay(state, studyDay, now) / 1_000),
      readingPercent: goals?.readingPercent ?? 0,
      questionsPercent: goals?.questionsPercent ?? 0,
      overallPercent: goals?.overallPercent ?? 0,
      vocabularyCount: reader?.vocabularyCount ?? day.report?.vocabularyCount ?? 0,
      vocabularyTarget: reader?.vocabularyTarget ?? 100,
      mistakeReviewCompleted: reader?.mistakeReviewCompleted ?? day.report?.mistakeReviewCompleted ?? false,
      oralReviewCompleted: reader?.oralReviewCompleted ?? day.report?.oralReviewCompleted ?? false,
      settled: Boolean(day.report),
      subjects: {
        medicine: reader?.subjects.medicine.percent ?? 0,
        english: reader?.subjects.english.percent ?? 0,
        politics: reader?.subjects.politics.percent ?? 0,
      },
      checkIns: CHECK_IN_SLOTS.map((slot) => ({
        slot,
        status: day.checkIns[slot]?.status ?? "upcoming",
      })),
    },
    todos,
    stats: {
      totalStudySeconds: Math.floor(stats.totalStudyMs / 1_000),
      checkedCount: stats.checkedCount,
      togetherBookmarks: stats.togetherBookmarks,
      selfBookmarks: stats.selfBountyBookmarks,
      friendBookmarks: stats.giftBountyBookmarks,
      totalVocabulary: stats.totalVocabulary,
    },
    history: daySummaries(state, now).map((item) => ({
      date: item.date,
      studySeconds: Math.floor(item.studyMs / 1_000),
      studyTimeUnknown: Boolean(item.studyTimeUnknown),
      checkedCount: item.checkedCount,
      completedTaskCount: item.completedTaskCount,
      taskCount: item.taskCount,
      readingPercent: item.report?.readingPercent ?? item.goals?.readingPercent ?? 0,
      questionsPercent: item.report?.questionsPercent ?? item.goals?.questionsPercent ?? 0,
      vocabularyCount: item.report?.vocabularyCount ?? item.yuReader?.vocabularyCount ?? 0,
      note: item.externalDiary?.title || item.report?.note || "",
    })),
    settings: {
      launchAtLogin: state.settings.launchAtLogin,
      yuReaderEnabled: state.settings.yuReaderIntegration,
      patrolEnabled: state.settings.patrolEnabled,
      voiceEnabled: state.settings.voiceEnabled,
    },
  };
}
