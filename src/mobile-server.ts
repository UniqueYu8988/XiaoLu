import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { readFile, writeFile } from "node:fs/promises";
import type { MobileSnapshotV2 } from "./mobile-snapshot.js";

export const MOBILE_PORT = 8787;
const MAX_BODY = 4096;
const PAIR_LIFETIME_MS = 5 * 60_000;

export interface MobileTaskChange {
  id: string;
  title?: string;
  completed?: boolean;
  daily?: boolean;
}

export interface MobileServerOptions {
  tokenFile: string;
  snapshot: () => MobileSnapshotV2;
  add: (title: string) => Promise<void>;
  change: (change: MobileTaskChange) => Promise<void>;
  remove: (id: string) => Promise<void>;
  vocabulary?: (count: number, studyDay: string, expectedCount: number) => Promise<void>;
  port?: number;
}

function respond(response: ServerResponse, status: number, payload: unknown): void {
  response.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
    "Access-Control-Allow-Origin": "null",
  });
  response.end(JSON.stringify(payload));
}

async function body(request: IncomingMessage): Promise<Record<string, unknown>> {
  let value = "";
  for await (const chunk of request) {
    value += chunk.toString();
    if (value.length > MAX_BODY) throw new Error("请求过大");
  }
  const parsed: unknown = JSON.parse(value);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("请求格式不正确");
  return parsed as Record<string, unknown>;
}

function revision(snapshot: MobileSnapshotV2): string {
  return createHash("sha256").update(JSON.stringify(snapshot.todos)).digest("hex").slice(0, 24);
}

function vocabularyRevision(snapshot: MobileSnapshotV2): string {
  return createHash("sha256").update(JSON.stringify([snapshot.studyDay, snapshot.today.vocabularyCount])).digest("hex").slice(0, 24);
}

function envelope(snapshot: MobileSnapshotV2) {
  return { snapshot, revision: revision(snapshot), vocabularyRevision: vocabularyRevision(snapshot) };
}

function secureEqual(a: string, b: string): boolean {
  const aa = Buffer.from(a);
  const bb = Buffer.from(b);
  return aa.length === bb.length && timingSafeEqual(aa, bb);
}

export async function createMobileServer(options: MobileServerOptions): Promise<{
  server: Server;
  newPairingCode: () => string;
  revoke: () => Promise<void>;
}> {
  let token = "";
  try {
    token = (await readFile(options.tokenFile, "utf8")).trim();
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
  let code = "";
  let expiresAt = 0;
  let attempts = 0;
  let mutation = Promise.resolve();

  const server = createServer((request, response) => {
    void (async () => {
      if (request.headers.origin || request.headers["sec-fetch-site"] === "cross-site") {
        respond(response, 403, { error: "浏览器跨站请求不可用" });
        return;
      }
      const path = new URL(request.url ?? "/", "http://localhost").pathname;
      if (path === "/v1/pair" && request.method === "POST") {
        if (!code || Date.now() > expiresAt || attempts >= 5) {
          respond(response, 403, { error: "配对码已失效，请在电脑重新生成" });
          return;
        }
        attempts++;
        const input = await body(request);
        if (typeof input.code !== "string" || !secureEqual(input.code, code)) {
          respond(response, 403, { error: "配对码不正确" });
          return;
        }
        const next = randomBytes(32).toString("base64url");
        await writeFile(options.tokenFile, `${next}\n`, { encoding: "utf8", mode: 0o600 });
        token = next;
        code = "";
        respond(response, 200, { token: next });
        return;
      }
      const authorization = request.headers.authorization;
      if (!token || typeof authorization !== "string" || !secureEqual(authorization, `Bearer ${token}`)) {
        respond(response, 401, { error: "请先在电脑上配对" });
        return;
      }
      if (path === "/v1/snapshot" && request.method === "GET") {
        const snapshot = options.snapshot();
        respond(response, 200, envelope(snapshot));
        return;
      }
      if (path === "/v1/vocabulary" && request.method === "PUT" && options.vocabulary) {
        const task = mutation.then(async () => {
          const snapshot = options.snapshot();
          const input = await body(request);
          if (input.studyDay !== snapshot.studyDay || request.headers["if-match"] !== vocabularyRevision(snapshot)) {
            respond(response, 409, { error: "学习日或背词数量已变化，请刷新后确认" });
            return;
          }
          if (typeof input.count !== "number" || !Number.isInteger(input.count) || input.count < 0 || input.count > 5000) {
            throw new Error("背词数量需为 0～5000 的整数");
          }
          await options.vocabulary!(input.count, snapshot.studyDay, snapshot.today.vocabularyCount);
          respond(response, 200, envelope(options.snapshot()));
        });
        mutation = task.catch(() => undefined);
        await task;
        return;
      }
      if (path === "/v1/todos" && ["POST", "PUT", "DELETE"].includes(request.method ?? "")) {
        const task = mutation.then(async () => {
          const snapshot = options.snapshot();
          if (request.headers["if-match"] !== revision(snapshot)) {
            respond(response, 409, { error: "待办已在电脑上变化，请刷新后重试" });
            return;
          }
          const input = await body(request);
          const id = input.id;
          if (request.method === "POST") {
            if (typeof input.title !== "string" || !input.title.trim() || input.title.length > 60) throw new Error("待办内容需在 1～60 字以内");
            await options.add(input.title);
          } else {
            if (typeof id !== "string" || !snapshot.todos.some((todo) => todo.id === id)) throw new Error("待办已不存在，请刷新");
            if (request.method === "DELETE") await options.remove(id);
            else {
              const change: MobileTaskChange = { id };
              if (input.title !== undefined) {
                if (typeof input.title !== "string" || !input.title.trim() || input.title.length > 60) throw new Error("待办内容需在 1～60 字以内");
                change.title = input.title;
              }
              if (input.completed !== undefined) {
                if (typeof input.completed !== "boolean") throw new Error("完成状态不正确");
                change.completed = input.completed;
              }
              if (input.daily !== undefined) {
                if (typeof input.daily !== "boolean") throw new Error("每日状态不正确");
                change.daily = input.daily;
              }
              await options.change(change);
            }
          }
          const updated = options.snapshot();
          respond(response, 200, envelope(updated));
        });
        mutation = task.catch(() => undefined);
        await task;
        return;
      }
      respond(response, 404, { error: "未找到接口" });
    })().catch((error: unknown) => {
      if (!response.headersSent) respond(response, 400, { error: error instanceof Error ? error.message : "操作失败" });
    });
  });
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(options.port ?? MOBILE_PORT, "127.0.0.1", () => {
      server.off("error", reject);
      resolve();
    });
  });
  return {
    server,
    newPairingCode: () => {
      code = String(randomBytes(4).readUInt32BE() % 1_000_000).padStart(6, "0");
      expiresAt = Date.now() + PAIR_LIFETIME_MS;
      attempts = 0;
      return code;
    },
    revoke: async () => {
      token = "";
      await writeFile(options.tokenFile, "", { encoding: "utf8", mode: 0o600 });
    },
  };
}
