import { getDocument, saveDocument, state } from "../../_data";
export async function DELETE(request: Request, context: { params: Promise<{ index: string }> }) {
  try {
    const { index: raw } = await context.params;
    const body = await request.json() as { version: string };
    const doc = await getDocument("inbox.yaml");
    if (!doc || String(doc.version) !== body.version) throw new Error("Inbox 已被其他操作修改，请刷新后重试");
    const items = JSON.parse(doc.content);
    const index = Number(raw);
    if (!Number.isInteger(index) || index < 0 || index >= items.length) throw new Error("Inbox 条目不存在");
    items.splice(index, 1);
    await saveDocument("inbox.yaml", "inbox", items, body.version);
    return Response.json(await state());
  } catch (error) { return Response.json({ error: error instanceof Error ? error.message : String(error) }, { status: 409 }); }
}

