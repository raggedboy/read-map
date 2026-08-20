import { promoteInbox, state, type ReadingNode } from "../_data";

export async function POST(request: Request) {
  try {
    const body = await request.json() as { file?: string; reading?: ReadingNode; inboxIndexes?: number[]; inboxVersion?: string };
    if (!body.file || !body.reading || !body.inboxVersion) return Response.json({ error: "缺少 promotion 数据" }, { status: 400 });
    await promoteInbox(body.file, body.reading, body.inboxIndexes || [], body.inboxVersion);
    return Response.json(await state(), { status: 201 });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : String(error) }, { status: 409 });
  }
}
