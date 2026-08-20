import { getDocument, nodeAt, saveDocument, state } from "../../../_data";
export async function PATCH(request: Request, context: { params: Promise<{ file: string }> }) {
  try {
    const { file } = await context.params;
    if (!file.endsWith(".yaml") || file.includes("/")) throw new Error("reading 文件名无效");
    const body = await request.json() as { path: number[]; dataVersion: string; progress?: number; notes?: string };
    const key = "readings/" + file;
    const doc = await getDocument(key);
    if (!doc) return Response.json({ error: "Reading 不存在" }, { status: 404 });
    if (String(doc.version) !== body.dataVersion) throw new Error("文件已被其他操作修改，请刷新后重试");
    const root = JSON.parse(doc.content);
    const node = nodeAt(root, body.path || []);
    if (body.progress !== undefined) {
      if (node.children?.length) throw new Error("父节点进度由子节点计算");
      node.progress = Math.max(0, Math.min(100, Math.round(body.progress)));
    }
    if (body.notes !== undefined) node.notes = body.notes.trim() || null;
    await saveDocument(key, "reading", root, body.dataVersion);
    return Response.json(await state());
  } catch (error) { return Response.json({ error: error instanceof Error ? error.message : String(error) }, { status: 409 }); }
}

