import { NextResponse } from "next/server";
import { googleSheetsConfig, googleSheetsConnection, googleSheetsOwner, outreachSheetName, outreachSpreadsheetId } from "../../../../lib/google-sheets/outreach";
import { portalService } from "../../../../lib/portal/server";

export const dynamic = "force-dynamic";

export async function GET() {
  const owner = await googleSheetsOwner();
  if (!owner) return NextResponse.json({ error: "ADMIN_ACCESS_REQUIRED" }, { status: 403 });
  const config = googleSheetsConfig();
  try {
    const connection = await googleSheetsConnection(owner.userId);
    return NextResponse.json({
      configured: Boolean(config), connected: Boolean(connection), email: connection?.email || null,
      sheetTitle: "Leads For Outreach", sheetName: outreachSheetName, lastSyncedAt: connection?.last_synced_at || null,
    }, { headers: { "Cache-Control": "private, no-store" } });
  } catch {
    return NextResponse.json({ error: "GOOGLE_SHEETS_STORAGE_UNAVAILABLE" }, { status: 503 });
  }
}

export async function DELETE(request: Request) {
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin) return NextResponse.json({ error: "INVALID_ORIGIN" }, { status: 403 });
  const owner = await googleSheetsOwner();
  if (!owner) return NextResponse.json({ error: "ADMIN_ACCESS_REQUIRED" }, { status: 403 });
  const { error } = await portalService().from("google_sheets_connections").delete().eq("user_id", owner.userId);
  if (error) return NextResponse.json({ error: "GOOGLE_SHEETS_DISCONNECT_FAILED" }, { status: 503 });
  return NextResponse.json({ disconnected: true });
}
