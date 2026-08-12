import { spawn } from "node:child_process";
import { createReadStream } from "node:fs";
import { readFile, stat } from "node:fs/promises";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { build, createServer as createViteServer, type ViteDevServer } from "vite";
import { DataError, deleteInboxItem, initializeMap, loadMapState, updateEntry } from "./data.ts";

const serverDir = path.dirname(fileURLToPath(import.meta.url));
const appDir = path.resolve(serverDir, "..");
const mapDir = path.resolve(process.env.READ_MAP_DATA_DIR || path.join(appDir, "..", "map"));
const host = "127.0.0.1";
const port = Number(process.env.PORT || 4173);
const development = process.argv.includes("--dev");

function json(response: ServerResponse, status: number, value: unknown): void {
  response.writeHead(status, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" });
  response.end(JSON.stringify(value));
}

async function body(request: IncomingMessage): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = [];
  for await (const chunk of request) chunks.push(Buffer.from(chunk));
  if (!chunks.length) return {};
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8")) as Record<string, unknown>;
  } catch {
    throw new DataError("请求 JSON 无效");
  }
}

async function handleApi(request: IncomingMessage, response: ServerResponse): Promise<boolean> {
  if (!request.url?.startsWith("/api/")) return false;
  try {
    const url = new URL(request.url, `http://${host}:${port}`);
    if (request.method === "GET" && url.pathname === "/api/state") {
      json(response, 200, await loadMapState(mapDir));
      return true;
    }
    if (request.method === "POST" && url.pathname === "/api/initialize") {
      json(response, 201, await initializeMap(mapDir));
      return true;
    }
    const readingMatch = url.pathname.match(/^\/api\/readings\/([^/]+)\/entries$/);
    if (request.method === "PATCH" && readingMatch) {
      const payload = await body(request);
      if (!Array.isArray(payload.path) || typeof payload.dataVersion !== "string") throw new DataError("path 和 dataVersion 必填");
      const change: { progress?: number; notes?: string } = {};
      if (payload.progress !== undefined) change.progress = Number(payload.progress);
      if (payload.notes !== undefined) change.notes = String(payload.notes);
      if (change.progress === undefined && change.notes === undefined) throw new DataError("没有可保存的修改");
      const state = await updateEntry(mapDir, decodeURIComponent(readingMatch[1]), payload.path.map(Number), change, payload.dataVersion);
      json(response, 200, state);
      return true;
    }
    const inboxMatch = url.pathname.match(/^\/api\/inbox\/(\d+)$/);
    if (request.method === "DELETE" && inboxMatch) {
      const payload = await body(request);
      if (typeof payload.version !== "string") throw new DataError("version 必填");
      json(response, 200, await deleteInboxItem(mapDir, Number(inboxMatch[1]), payload.version));
      return true;
    }
    json(response, 404, { error: "API 不存在" });
  } catch (error) {
    const status = error instanceof DataError ? error.status : 500;
    json(response, status, { error: error instanceof Error ? error.message : String(error) });
  }
  return true;
}

const mime = new Map([
  [".html", "text/html; charset=utf-8"],
  [".js", "text/javascript; charset=utf-8"],
  [".css", "text/css; charset=utf-8"],
  [".svg", "image/svg+xml"],
  [".json", "application/json; charset=utf-8"],
]);

async function newestSourceTime(): Promise<number> {
  const targets = ["src", "index.html", "vite.config.ts", "package.json"];
  let newest = 0;
  async function scan(target: string): Promise<void> {
    const info = await stat(target);
    newest = Math.max(newest, info.mtimeMs);
    if (info.isDirectory()) {
      const { readdir } = await import("node:fs/promises");
      for (const name of await readdir(target)) await scan(path.join(target, name));
    }
  }
  for (const target of targets) await scan(path.join(appDir, target));
  return newest;
}

async function ensureBuild(): Promise<void> {
  const output = path.join(appDir, "dist", "index.html");
  let stale = false;
  try {
    stale = (await stat(output)).mtimeMs < await newestSourceTime();
  } catch {
    stale = true;
  }
  if (stale) await build({ root: appDir });
}

async function serveStatic(request: IncomingMessage, response: ServerResponse): Promise<void> {
  const dist = path.join(appDir, "dist");
  const pathname = decodeURIComponent(new URL(request.url || "/", `http://${host}:${port}`).pathname);
  const requested = pathname === "/" ? "index.html" : pathname.slice(1);
  let target = path.resolve(dist, requested);
  if (!target.startsWith(`${dist}${path.sep}`) && target !== path.join(dist, "index.html")) {
    response.writeHead(403).end();
    return;
  }
  try {
    if (!(await stat(target)).isFile()) throw new Error("not file");
  } catch {
    target = path.join(dist, "index.html");
  }
  response.writeHead(200, { "content-type": mime.get(path.extname(target)) || "application/octet-stream" });
  createReadStream(target).pipe(response);
}

function openBrowser(url: string): void {
  if (process.env.READ_MAP_NO_OPEN === "1" || process.argv.includes("--no-open")) return;
  const command = process.platform === "darwin" ? "open" : process.platform === "win32" ? "cmd" : "xdg-open";
  const args = process.platform === "win32" ? ["/c", "start", "", url] : [url];
  spawn(command, args, { detached: true, stdio: "ignore" }).unref();
}

async function main(): Promise<void> {
  let vite: ViteDevServer | undefined;
  if (development) {
    vite = await createViteServer({ root: appDir, server: { middlewareMode: true }, appType: "spa" });
  } else {
    await ensureBuild();
  }

  const server = createServer(async (request, response) => {
    if (await handleApi(request, response)) return;
    if (vite) {
      vite.middlewares(request, response, () => json(response, 404, { error: "页面不存在" }));
      return;
    }
    await serveStatic(request, response);
  });
  server.listen(port, host, () => {
    const url = `http://${host}:${port}`;
    console.log(`Read Map: ${url}`);
    console.log(`Data: ${mapDir}`);
    openBrowser(url);
  });
}

await main();
