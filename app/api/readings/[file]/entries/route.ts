import { recordEntries, state, type EntryChange } from "../../../_data";
export async function PATCH(request: Request, context: { params: Promise<{ file: string }> }) {
  try {
    const { file } = await context.params;
    if (!file.endsWith(".yaml") || file.includes("/")) throw new Error("reading 文件名无效");
    const body = await request.json() as { path?: number[]; dataVersion: string; progress?: number; notes?: string; changes?: EntryChange[] };
    const changes = body.changes ?? [{ path: body.path || [], progress: body.progress, notes: body.notes }];
    await recordEntries(file, body.dataVersion, changes);
    return Response.json(await state());
  } catch (error) { return Response.json({ error: error instanceof Error ? error.message : String(error) }, { status: 409 }); }
}

