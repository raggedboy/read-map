import { env } from "cloudflare:workers";
export async function GET() {
  await env.DB.prepare("CREATE TABLE IF NOT EXISTS resources (path TEXT PRIMARY KEY, content_type TEXT NOT NULL, size INTEGER NOT NULL, updated_at TEXT NOT NULL)").run();
  const result = await env.DB.prepare("SELECT path FROM resources ORDER BY path").all<{ path: string }>();
  return Response.json({ resources: result.results.map(item => item.path) });
}
