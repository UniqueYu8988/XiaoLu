import assert from "node:assert/strict";
import { once } from "node:events";

import {
  YUQUIZ_WAKE_HOST,
  YUQUIZ_WAKE_PATH,
  createYuQuizWakeServer,
} from "../dist/yuquiz-wakeup.js";

let wakeCount = 0;
const server = createYuQuizWakeServer(() => {
  wakeCount += 1;
}, 0);

await once(server, "listening");
const address = server.address();
assert(address && typeof address === "object");
const base = `http://${YUQUIZ_WAKE_HOST}:${address.port}`;

const ignored = await fetch(`${base}/not-the-wake-endpoint`);
assert.equal(ignored.status, 404);
assert.equal(wakeCount, 0);

const accepted = await fetch(`${base}${YUQUIZ_WAKE_PATH}`, { method: "POST" });
assert.equal(accepted.status, 204);
assert.equal(wakeCount, 1);

server.close();
await once(server, "close");
console.log("Xiaolu YuQuiz wake listener tests passed.");
