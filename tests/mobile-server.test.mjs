import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createMobileServer } from "../dist/mobile-server.js";

const directory = await mkdtemp(join(tmpdir(), "xiaolu-mobile-test-"));
let todos = [{ id: "one", title: "整理资料", completed: false, daily: false }];
let vocabularyCount = 30;
const snapshot = () => ({ schemaVersion: 2, generatedAt: new Date().toISOString(), studyDay: "2026-09-26", today: { vocabularyCount }, todos });
const mobile = await createMobileServer({
  tokenFile: join(directory, "token"), port: 0, snapshot,
  add: async (title) => { todos = [...todos, { id: "two", title, completed: false, daily: false }]; },
  change: async ({ id, ...change }) => { todos = todos.map((todo) => todo.id === id ? { ...todo, ...change } : todo); },
  remove: async (id) => { todos = todos.filter((todo) => todo.id !== id); },
  vocabulary: async (count) => { vocabularyCount = count; },
});
const port = mobile.server.address().port;
const url = `http://127.0.0.1:${port}`;
try {
  const unauthorized = await fetch(`${url}/v1/snapshot`);
  assert.equal(unauthorized.status, 401);
  const code = mobile.newPairingCode();
  assert.match(code, /^\d{6}$/);
  const wrong = await fetch(`${url}/v1/pair`, { method: "POST", body: JSON.stringify({ code: "000000" }) });
  if (code !== "000000") assert.equal(wrong.status, 403);
  const paired = await fetch(`${url}/v1/pair`, { method: "POST", body: JSON.stringify({ code }) }).then((response) => response.json());
  assert.ok(paired.token);
  const headers = { Authorization: `Bearer ${paired.token}` };
  const initial = await fetch(`${url}/v1/snapshot`, { headers }).then((response) => response.json());
  assert.equal(initial.snapshot.todos.length, 1);
  const changed = await fetch(`${url}/v1/todos`, {
    method: "PUT", headers: { ...headers, "If-Match": initial.revision },
    body: JSON.stringify({ id: "one", completed: true }),
  }).then((response) => response.json());
  assert.equal(changed.snapshot.todos[0].completed, true);
  const stale = await fetch(`${url}/v1/todos`, {
    method: "POST", headers: { ...headers, "If-Match": initial.revision }, body: JSON.stringify({ title: "不该加入" }),
  });
  assert.equal(stale.status, 409);
  assert.equal(todos.length, 1);
  const created = await fetch(`${url}/v1/todos`, {
    method: "POST", headers: { ...headers, "If-Match": changed.revision }, body: JSON.stringify({ title: "明天阅读" }),
  }).then((response) => response.json());
  assert.equal(created.snapshot.todos.length, 2);
  const words = await fetch(`${url}/v1/vocabulary`, {
    method: "PUT", headers: { ...headers, "If-Match": initial.vocabularyRevision },
    body: JSON.stringify({ studyDay: "2026-09-26", count: 150 }),
  }).then(response => response.json());
  assert.equal(words.snapshot.today.vocabularyCount, 150);
  const staleWords = await fetch(`${url}/v1/vocabulary`, {
    method: "PUT", headers: { ...headers, "If-Match": initial.vocabularyRevision },
    body: JSON.stringify({ studyDay: "2026-09-26", count: 200 }),
  });
  assert.equal(staleWords.status, 409);
  const wrongDay = await fetch(`${url}/v1/vocabulary`, {
    method: "PUT", headers: { ...headers, "If-Match": words.vocabularyRevision },
    body: JSON.stringify({ studyDay: "2026-09-25", count: 200 }),
  });
  assert.equal(wrongDay.status, 409);
  const invalid = await fetch(`${url}/v1/vocabulary`, {
    method: "PUT", headers: { ...headers, "If-Match": words.vocabularyRevision },
    body: JSON.stringify({ studyDay: "2026-09-26", count: -1 }),
  });
  assert.equal(invalid.status, 400);
  assert.equal(vocabularyCount, 150);
  await mobile.revoke();
  assert.equal((await fetch(`${url}/v1/snapshot`, { headers })).status, 401);
  console.log("Xiaolu mobile pairing and task API tests passed.");
} finally {
  await new Promise((resolve) => mobile.server.close(resolve));
  await rm(directory, { recursive: true, force: true });
}
