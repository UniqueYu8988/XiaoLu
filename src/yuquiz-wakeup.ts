import { createServer, type Server } from "node:http";

export const YUQUIZ_WAKE_HOST = "127.0.0.1";
export const YUQUIZ_WAKE_PORT = 8766;
export const YUQUIZ_WAKE_PATH = "/yuquiz-wake";

export function createYuQuizWakeServer(
  onWake: () => void,
  port = YUQUIZ_WAKE_PORT,
): Server {
  return createServer((request, response) => {
    if (request.method !== "POST" || request.url !== YUQUIZ_WAKE_PATH) {
      request.resume();
      response.writeHead(404, { "Cache-Control": "no-store" });
      response.end();
      return;
    }
    request.resume();
    response.writeHead(204, { "Cache-Control": "no-store" });
    response.end();
    onWake();
  }).listen(port, YUQUIZ_WAKE_HOST);
}
