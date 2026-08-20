import { state } from "../_data";
export async function GET() { return Response.json(await state()); }

