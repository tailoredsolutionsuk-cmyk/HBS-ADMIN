import { NextResponse } from "next/server";
import { calendarOwner, outlookAccessToken, outlookConfig, outlookConnection } from "../../../../lib/calendar/outlook";
import { portalService } from "../../../../lib/portal/server";

export const dynamic = "force-dynamic";

type GraphEvent = { id: string; subject?: string; isAllDay?: boolean; start?: { dateTime?: string }; end?: { dateTime?: string } };

export async function GET(request: Request) {
  const ownerId = await calendarOwner();
  if (!ownerId) return NextResponse.json({ error: "OWNER_ACCESS_REQUIRED" }, { status: 403 });
  const config = outlookConfig();
  if (!config) return NextResponse.json({ configured: false, connected: false, events: [] });
  let connection;
  try { connection = await outlookConnection(ownerId); }
  catch { return NextResponse.json({ error: "OUTLOOK_STORAGE_UNAVAILABLE" }, { status: 503 }); }
  if (!connection) return NextResponse.json({ configured: true, connected: false, events: [] });
  const params = new URL(request.url).searchParams;
  const start = params.get("start");
  const end = params.get("end");
  if (!start || !end || !/^\d{4}-\d{2}-\d{2}$/.test(start) || !/^\d{4}-\d{2}-\d{2}$/.test(end) ||
      Number.isNaN(Date.parse(start)) || Number.isNaN(Date.parse(end)) ||
      Date.parse(end) <= Date.parse(start) || Date.parse(end) - Date.parse(start) > 45 * 86400000) {
    return NextResponse.json({ error: "INVALID_DATE_RANGE" }, { status: 400 });
  }
  try {
    const accessToken = await outlookAccessToken(ownerId, connection, config);
    const url = new URL("https://graph.microsoft.com/v1.0/me/calendarView");
    url.search = new URLSearchParams({ startDateTime: `${start}T00:00:00Z`, endDateTime: `${end}T00:00:00Z`, "$select": "id,subject,isAllDay,start,end", "$top": "200" }).toString();
    const events: GraphEvent[] = [];
    let next: string | null = url.toString();
    for (let page = 0; next && page < 5; page++) {
      if (new URL(next).origin !== "https://graph.microsoft.com") throw new Error("OUTLOOK_PAGE_INVALID");
      const response: Response = await fetch(next, { headers: { Authorization: `Bearer ${accessToken}`, Prefer: 'outlook.timezone="GMT Standard Time"' }, cache: "no-store" });
      if (!response.ok) throw new Error(`OUTLOOK_GRAPH_${response.status}`);
      const data = await response.json() as { value?: GraphEvent[]; "@odata.nextLink"?: string };
      events.push(...(data.value || []));
      next = data["@odata.nextLink"] || null;
    }
    return NextResponse.json({ configured: true, connected: true, email: connection.email, events: events.map((event) => ({
      id: event.id, title: event.subject || "Busy", allDay: Boolean(event.isAllDay), start: event.start?.dateTime || "", end: event.end?.dateTime || "",
    })) });
  } catch (error) {
    const code = error instanceof Error ? error.message : "OUTLOOK_UNAVAILABLE";
    const reconnectRequired = code.startsWith("OUTLOOK_TOKEN_") || code === "OUTLOOK_GRAPH_401";
    return NextResponse.json({ configured: true, connected: true, email: connection.email, events: [], reconnectRequired,
      error: reconnectRequired ? "Outlook access expired. Reconnect your Microsoft account." : "Outlook appointments could not be loaded. Please try again later." });
  }
}

export async function DELETE(request: Request) {
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin) return NextResponse.json({ error: "INVALID_ORIGIN" }, { status: 403 });
  const ownerId = await calendarOwner();
  if (!ownerId) return NextResponse.json({ error: "OWNER_ACCESS_REQUIRED" }, { status: 403 });
  try {
    const { error } = await portalService().from("outlook_calendar_connections").delete().eq("user_id", ownerId);
    if (error) throw error;
    return NextResponse.json({ connected: false });
  } catch {
    return NextResponse.json({ error: "OUTLOOK_STORAGE_UNAVAILABLE" }, { status: 503 });
  }
}
