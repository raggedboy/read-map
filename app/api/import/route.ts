import { saveDocument, state } from "../_data";
export async function POST(request: Request) {
  const body = await request.json() as { documents?: Array<{ path: string; data: unknown }> };
  if (!Array.isArray(body.documents)) return Response.json({ error: "缺少 documents" }, { status: 400 });
  for (const doc of body.documents) {
    const path = doc.path === "inbox.yaml" ? doc.path : doc.path.startsWith("readings/") ? doc.path : "";
    if (!path || path.includes("..")) return Response.json({ error: "数据路径无效" }, { status: 400 });
    await saveDocument(path, path === "inbox.yaml" ? "inbox" : "reading", doc.data);
  }
  return Response.json(await state());
}

