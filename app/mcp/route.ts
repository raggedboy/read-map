import * as data from "../api/_data";
import { handleMcp } from "../../map/mcp";
export const dynamic = "force-dynamic";
export async function POST(request: Request) { return handleMcp(request, data); }
export async function GET() { return new Response("Method not allowed", { status: 405, headers: { allow: "POST", "cache-control": "no-store" } }); }
