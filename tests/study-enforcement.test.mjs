import assert from "node:assert/strict";

import { STUDY_FOREGROUND_GRACE_MS, canCheckInWhileStudying, classifyYuReaderPatrol, shouldAutoOpenYuReaderForCheckIn, shouldRepeatStudyForeground, strongSupervisionBlocksPanel, studyForegroundDecision } from "../dist/study-enforcement.js";

const strictStartedAt = new Date(2026, 7, 11, 9, 0, 0).getTime();
const base = {
  strictKey: "2026-08-11:morning",
  strictStartedAt,
  effectiveStudy: false,
  suppressed: false,
};

assert.equal(studyForegroundDecision({
  ...base,
  now: strictStartedAt + STUDY_FOREGROUND_GRACE_MS - 1,
  hasStudiedThisPeriod: false,
  inactiveSince: strictStartedAt,
}), undefined);

const startDecision = studyForegroundDecision({
  ...base,
  now: strictStartedAt + STUDY_FOREGROUND_GRACE_MS,
  hasStudiedThisPeriod: false,
  inactiveSince: strictStartedAt,
});
assert.equal(startDecision?.kind, "start");
assert.equal(startDecision?.dueAt, strictStartedAt + STUDY_FOREGROUND_GRACE_MS);

const inactiveSince = new Date(2026, 7, 11, 10, 5, 0).getTime();
assert.equal(studyForegroundDecision({
  ...base,
  now: inactiveSince + STUDY_FOREGROUND_GRACE_MS - 1,
  hasStudiedThisPeriod: true,
  inactiveSince,
}), undefined);

const returnDecision = studyForegroundDecision({
  ...base,
  now: inactiveSince + STUDY_FOREGROUND_GRACE_MS,
  hasStudiedThisPeriod: true,
  inactiveSince,
});
assert.equal(returnDecision?.kind, "return");
assert.equal(returnDecision?.key, `${base.strictKey}:return:${inactiveSince + STUDY_FOREGROUND_GRACE_MS}`);
assert.equal(studyForegroundDecision({ ...base, now: inactiveSince + STUDY_FOREGROUND_GRACE_MS, effectiveStudy: true, hasStudiedThisPeriod: true, inactiveSince }), undefined);
assert.equal(studyForegroundDecision({ ...base, now: inactiveSince + STUDY_FOREGROUND_GRACE_MS, suppressed: true, hasStudiedThisPeriod: true, inactiveSince }), undefined);
assert.equal(strongSupervisionBlocksPanel("strong-start"), true);
assert.equal(strongSupervisionBlocksPanel("strong-return"), true);
assert.equal(strongSupervisionBlocksPanel("night"), false);
assert.equal(strongSupervisionBlocksPanel(null), false);

assert.equal(shouldRepeatStudyForeground({ key: "morning:start:1", lastKey: "", now: 1_000, lastAt: 0, pageOpen: true, pageVisible: true, repeatMs: 4_000 }), true);
assert.equal(shouldRepeatStudyForeground({ key: "morning:start:1", lastKey: "morning:start:1", now: 5_000, lastAt: 0, pageOpen: true, pageVisible: false, repeatMs: 4_000 }), true);
assert.equal(shouldRepeatStudyForeground({ key: "morning:start:1", lastKey: "morning:start:1", now: 3_999, lastAt: 0, pageOpen: true, pageVisible: false, repeatMs: 4_000 }), false);
assert.equal(shouldRepeatStudyForeground({ key: "morning:start:1", lastKey: "morning:start:1", now: 8_000, lastAt: 0, pageOpen: true, pageVisible: true, repeatMs: 4_000 }), false);

assert.deepEqual(classifyYuReaderPatrol({ pageOpen: true, studyState: "ready", currentView: "home" }), { active: false, enteredContent: false, waitingAtHome: true });
assert.deepEqual(classifyYuReaderPatrol({ pageOpen: true, studyState: "learning", currentView: "reader" }), { active: true, enteredContent: true, waitingAtHome: false });
assert.deepEqual(classifyYuReaderPatrol({ pageOpen: true, studyState: "consulting", currentView: "practice" }), { active: true, enteredContent: true, waitingAtHome: false });
assert.deepEqual(classifyYuReaderPatrol({ pageOpen: true, studyState: "paused", currentView: "reader" }), { active: false, enteredContent: true, waitingAtHome: false });
assert.deepEqual(classifyYuReaderPatrol({ pageOpen: false, studyState: "closed", currentView: "home" }), { active: false, enteredContent: false, waitingAtHome: false });
assert.equal(canCheckInWhileStudying({ manualSessionActive: true, yuReaderState: "ready" }), true);
assert.equal(canCheckInWhileStudying({ manualSessionActive: false, yuReaderState: "learning" }), true);
assert.equal(canCheckInWhileStudying({ manualSessionActive: false, yuReaderState: "consulting" }), true);
assert.equal(canCheckInWhileStudying({ manualSessionActive: false, yuReaderState: "paused" }), false);
assert.equal(shouldAutoOpenYuReaderForCheckIn({ enabled: true, slot: "09:00", now: 100, scheduledAt: 100, windowEnd: 200, pageOpen: false, alreadyHandled: false }), true);
assert.equal(shouldAutoOpenYuReaderForCheckIn({ enabled: true, slot: "12:00", now: 100, scheduledAt: 100, windowEnd: 200, pageOpen: false, alreadyHandled: false }), false);
assert.equal(shouldAutoOpenYuReaderForCheckIn({ enabled: true, slot: "18:00", now: 99, scheduledAt: 100, windowEnd: 200, pageOpen: false, alreadyHandled: false }), false);
assert.equal(shouldAutoOpenYuReaderForCheckIn({ enabled: true, slot: "21:00", now: 100, scheduledAt: 100, windowEnd: 200, pageOpen: true, alreadyHandled: false }), false);

console.log("Xiaolu study-enforcement tests passed.");
