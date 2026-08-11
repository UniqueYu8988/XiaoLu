import assert from "node:assert/strict";

import { yuQuizTabTitleMatches } from "../dist/windows-browser.js";

assert.equal(yuQuizTabTitleMatches("口腔执业 · 学习台"), true);
assert.equal(yuQuizTabTitleMatches("YuQuiz - Google Chrome"), true);
assert.equal(yuQuizTabTitleMatches("普通的新建标签页"), false);

console.log("Xiaolu browser activation tests passed.");
