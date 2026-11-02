import { env } from "cloudflare:workers";
export async function GET(request: Request, context: { params: Promise<{ path: string[] }> }) {
  const { path } = await context.params;
  const key = path.join("/");
  if (!key || key.includes("..")) return new Response("Not found", { status: 404 });
  const rangeRequested = request.headers.has("range");
  const object = await env.BUCKET.get(key, rangeRequested ? { range: request.headers } : undefined);
  if (!object) return new Response("Not found", { status: 404 });
  const headers = new Headers();
  object.writeHttpMetadata(headers);
  const filename = path.at(-1) || "resource";
  if (/\.pdf$/i.test(filename)) headers.set("content-type", "application/pdf");
  else if (/\.md$/i.test(filename)) headers.set("content-type", "text/markdown; charset=utf-8");
  headers.set("etag", object.httpEtag);
  headers.set("content-disposition", `inline; filename*=UTF-8''${encodeURIComponent(filename)}`);
  headers.set("accept-ranges", "bytes");
  if (object.range && "offset" in object.range && "length" in object.range) {
    const end = object.range.offset + object.range.length - 1;
    headers.set("content-range", `bytes ${object.range.offset}-${end}/${object.size}`);
    headers.set("content-length", String(object.range.length));
  } else {
    headers.set("content-length", String(object.size));
  }
  return new Response(object.body, { status: object.range ? 206 : 200, headers });
}
