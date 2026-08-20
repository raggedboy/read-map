import { env } from "cloudflare:workers";
export async function GET() {
  const documents = await env.DB.prepare("SELECT path, kind, content, version, updated_at FROM map_documents ORDER BY path").all();
  const resources = await env.DB.prepare("SELECT path, content_type, size, updated_at FROM resources ORDER BY path").all();
  return Response.json({ documents: documents.results, resources: resources.results });
}
