import { env } from "cloudflare:workers";
import { recordResource } from "../../_data";
export async function PUT(request: Request) {
  const path = new URL(request.url).searchParams.get("path")?.replace(/^resources\//, "");
  if (!path || path.includes("..") || path.startsWith("/")) return Response.json({ error: "资源路径无效" }, { status: 400 });
  const contentType = request.headers.get("content-type") || "application/octet-stream";
  const body = await request.arrayBuffer();
  await env.BUCKET.put(path, body, { httpMetadata: { contentType } });
  await recordResource(path, contentType, body.byteLength);
  return Response.json({ ok: true, path });
}

