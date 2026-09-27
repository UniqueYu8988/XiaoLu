import assert from 'node:assert/strict';
import { advanceStudyArt, progressStage, timeStage } from '../src/renderer/study-art.mjs';
assert.equal(progressStage(20), 0);
assert.equal(progressStage(20.1), 1);
assert.equal(timeStage(10 * 3_600_000), 4);
let s = advanceStudyArt(null, '2026-09-27', 0, 0);
s = advanceStudyArt(s, s.date, 100, 3_600_000);
assert.equal(s.kind, 'progress'); assert.equal(s.index, 4);
s = advanceStudyArt(s, s.date, 100, 7_200_000);
assert.equal(s.kind, 'time'); assert.equal(s.index, 1);
s = advanceStudyArt(s, s.date, 110, 8_000_000);
assert.equal(s.kind, 'time');
s = advanceStudyArt(s, s.date, 0, 0);
assert.equal(s.index, 1); // target edits do not bounce between illustrations
s = advanceStudyArt(s, '2026-09-28', 0, 0);
assert.equal(s.index, 0);
console.log('Study illustration milestones passed.');
