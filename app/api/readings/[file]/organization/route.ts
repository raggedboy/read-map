import { organizeReading, state } from "../../../_data";
export async function PATCH(request: Request, context: { params: Promise<{ file: string }> }) {
  try {
    const { file } = await context.params;
    const { dataVersion, tags, related } = await request.json();
    await organizeReading(file, dataVersion, tags, related);
    return Response.json(await state());
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "保存失败" }, { status: 409 });
  }
}
