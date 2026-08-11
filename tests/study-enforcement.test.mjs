import assert from "node:assert/strict";

import { STUDY_FOREGROUND_GRACE_MS, strongSupervisionBlocksPanel, studyForegroundDecision } from "../dist/study-enforcement.js";

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

console.log("Xiaolu study-enforcement tests passed.");
