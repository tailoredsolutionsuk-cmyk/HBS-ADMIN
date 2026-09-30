import { NextResponse } from "next/server";
import { parseActivityInput } from "../../../../lib/activity/model";
import { saveActivity, validActivitySecret } from "../../../../lib/activity/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: Request) {
  if (!validActivitySecret(request.headers.get("authorization"))) return NextResponse.json({ error: "UNAUTHORISED" }, { status: 401 });
  const length = Number(request.headers.get("content-length") || 0);
  if (length > 20_000) return NextResponse.json({ error: "PAYLOAD_TOO_LARGE" }, { status: 413 });
  if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/json")) return NextResponse.json({ error: "JSON_REQUIRED" }, { status: 415 });
  try {
    const input = parseActivityInput(await request.json());
    const event = await saveActivity(input);
    return NextResponse.json({ ok: true, id: event.id }, { status: 202, headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "ACTIVITY_FAILED";
    const status = message === "ACTIVITY_CLIENT_NOT_FOUND" ? 404 : message.startsWith("INVALID_") ? 400 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
