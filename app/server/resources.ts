import { createReadStream } from "node:fs";
import { readdir, realpath, stat } from "node:fs/promises";
import type { IncomingMessage, ServerResponse } from "node:http";
import path from "node:path";

const resourceMime = new Map([
  [".pdf", "application/pdf"],
  [".txt", "text/plain; charset=utf-8"],
  [".md", "text/plain; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
  [".yaml", "text/plain; charset=utf-8"],
  [".yml", "text/plain; charset=utf-8"],
  [".png", "image/png"],
  [".jpg", "image/jpeg"],
  [".jpeg", "image/jpeg"],
  [".gif", "image/gif"],
  [".webp", "image/webp"],
  [".svg", "image/svg+xml"],
]);

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, character => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]!);
}

function encodeResourcePath(segments: string[]): string {
  return `/resources/${segments.map(encodeURIComponent).join("/")}`;
}

export function parseByteRange(header: string | undefined, size: number): { start: number; end: number } | null {
  if (!header) return null;
  const match = header.match(/^bytes=(\d*)-(\d*)$/);
  if (!match || (!match[1] && !match[2]) || size <= 0) return null;
  let start = match[1] ? Number(match[1]) : Math.max(0, size - Number(match[2]));
  let end = match[2] && match[1] ? Number(match[2]) : size - 1;
  if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start < 0 || start >= size || end < start) return null;
  end = Math.min(end, size - 1);
  return { start, end };
}

function directoryPage(relativeSegments: string[], items: Array<{ name: string; directory: boolean }>): string {
  const title = relativeSegments.length ? relativeSegments.at(-1)! : "resources";
  const parent = relativeSegments.length ? `<li><a href="${encodeResourcePath(relativeSegments.slice(0, -1))}">../</a></li>` : "";
  const rows = items.map(item => {
    const suffix = item.directory ? "/" : "";
    return `<li><a href="${encodeResourcePath([...relativeSegments, item.name])}${suffix}">${escapeHtml(item.name)}${suffix}</a></li>`;
  }).join("");
  return `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>${escapeHtml(title)}</title><style>body{max-width:920px;margin:40px auto;padding:0 20px;color:#17211b;background:#f7f5ef;font:15px/1.6 system-ui,sans-serif}a{color:#315e49;text-decoration:none}a:hover{text-decoration:underline}h1{font:700 32px Georgia,serif}ul{padding:0;border:1px solid #dcd8ce;border-radius:12px;background:#fff}li{list-style:none;padding:10px 14px;border-bottom:1px solid #ece9e1}li:last-child{border:0}</style></head><body><p><a href="/">← Read Map</a></p><h1>${escapeHtml(title)}</h1><ul>${parent}${rows || "<li>目录为空</li>"}</ul></body></html>`;
}

export async function serveResource(request: IncomingMessage, response: ServerResponse, mapDir: string): Promise<boolean> {
  const url = new URL(request.url || "/", "http://127.0.0.1");
  if (url.pathname.startsWith("/map/resources/")) {
    response.writeHead(308, { location: url.pathname.slice(4) + url.search }).end();
    return true;
  }
  if (url.pathname !== "/resources" && !url.pathname.startsWith("/resources/")) return false;
  if (request.method !== "GET" && request.method !== "HEAD") {
    response.writeHead(405, { allow: "GET, HEAD" }).end();
    return true;
  }

  try {
    const rawSegments = url.pathname.slice("/resources".length).split("/").filter(Boolean).map(decodeURIComponent);
    if (rawSegments.some(segment => segment === "." || segment === ".." || segment.startsWith("."))) throw new Error("invalid path");
    const root = await realpath(path.join(mapDir, "resources"));
    const target = await realpath(path.join(root, ...rawSegments));
    if (target !== root && !target.startsWith(`${root}${path.sep}`)) throw new Error("outside resources");
    const info = await stat(target);

    if (info.isDirectory()) {
      const entries = await readdir(target, { withFileTypes: true });
      const items = entries
        .filter(item => !item.name.startsWith(".") && (item.isDirectory() || item.isFile()))
        .map(item => ({ name: item.name, directory: item.isDirectory() }))
        .sort((left, right) => Number(right.directory) - Number(left.directory) || left.name.localeCompare(right.name, "zh-CN"));
      const html = directoryPage(rawSegments, items);
      response.writeHead(200, {
        "content-type": "text/html; charset=utf-8",
        "content-length": Buffer.byteLength(html),
        "content-security-policy": "default-src 'none'; style-src 'unsafe-inline'",
        "x-content-type-options": "nosniff",
      });
      if (request.method === "HEAD") response.end(); else response.end(html);
      return true;
    }

    if (!info.isFile()) throw new Error("not a file");
    const range = parseByteRange(request.headers.range, info.size);
    const headers: Record<string, string | number> = {
      "content-type": resourceMime.get(path.extname(target).toLowerCase()) || "application/octet-stream",
      "accept-ranges": "bytes",
      "cache-control": "private, no-cache",
      "x-content-type-options": "nosniff",
    };
    if (range) {
      headers["content-range"] = `bytes ${range.start}-${range.end}/${info.size}`;
      headers["content-length"] = range.end - range.start + 1;
      response.writeHead(206, headers);
      if (request.method === "HEAD") response.end(); else createReadStream(target, range).pipe(response);
    } else {
      headers["content-length"] = info.size;
      response.writeHead(200, headers);
      if (request.method === "HEAD") response.end(); else createReadStream(target).pipe(response);
    }
  } catch {
    response.writeHead(404, { "content-type": "text/plain; charset=utf-8" }).end("资源不存在");
  }
  return true;
}
