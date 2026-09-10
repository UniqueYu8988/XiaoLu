import assert from "node:assert/strict";

import { yuQuizTabTitleMatches } from "../dist/windows-browser.js";

assert.equal(yuQuizTabTitleMatches("YuReader · 本地阅读空间"), true);
assert.equal(yuQuizTabTitleMatches("本地阅读空间 - Google Chrome"), true);
assert.equal(yuQuizTabTitleMatches("YuQuiz - Google Chrome"), false);
assert.equal(yuQuizTabTitleMatches("普通的新建标签页"), false);

console.log("Xiaolu browser activation tests passed.");
