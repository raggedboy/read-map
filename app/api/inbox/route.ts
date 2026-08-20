import { addInboxItem, state, type InboxItem } from "../_data";

export async function POST(request: Request) {
  try {
    const body = await request.json() as { item?: InboxItem; inboxVersion?: string | null };
    if (!body.item) return Response.json({ error: "缺少 Inbox 条目" }, { status: 400 });
    await addInboxItem(body.item, body.inboxVersion);
    return Response.json(await state(), { status: 201 });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : String(error) }, { status: 409 });
  }
}
