import { env } from "cloudflare:workers";
export async function GET(_request: Request, context: { params: Promise<{ path: string[] }> }) {
  const { path } = await context.params;
  const key = path.join("/");
  if (!key || key.includes("..")) return new Response("Not found", { status: 404 });
  const object = await env.BUCKET.get(key);
  if (!object) return new Response("Not found", { status: 404 });
  const headers = new Headers();
  object.writeHttpMetadata(headers);
  const filename = path.at(-1) || "resource";
  if (/\.pdf$/i.test(filename)) headers.set("content-type", "application/pdf");
  else if (/\.md$/i.test(filename)) headers.set("content-type", "text/markdown; charset=utf-8");
  headers.set("etag", object.httpEtag);
  headers.set("content-disposition", `inline; filename*=UTF-8''${encodeURIComponent(filename)}`);
  return new Response(object.body, { headers });
}
