import { NextResponse } from "next/server";
import { calendarAccessToken, googleCalendarConfig, googleCalendarConnection, googleCalendarOwner } from "../../../../../lib/calendar/google";
import { calendarEvent, calendarRange, type CalendarEvent, type GoogleEvent } from "../../../../../lib/calendar/google-core";
import { portalService } from "../../../../../lib/portal/server";

export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "private, no-store" };

export async function GET(request: Request) {
  const ownerId = await googleCalendarOwner();
  if (!ownerId) return NextResponse.json({ error: "OWNER_ACCESS_REQUIRED" }, { status: 403, headers });
  const config = googleCalendarConfig();
  if (!config) return NextResponse.json({ configured: false, connected: false, events: [] }, { headers });
  const params = new URL(request.url).searchParams;
  const range = calendarRange(params.get("start"), params.get("end"));
  if (!range) return NextResponse.json({ error: "INVALID_DATE_RANGE" }, { status: 400, headers });
  let connection;
  try { connection = await googleCalendarConnection(ownerId); }
  catch { return NextResponse.json({ error: "GOOGLE_CALENDAR_STORAGE_UNAVAILABLE" }, { status: 503, headers }); }
  if (!connection) return NextResponse.json({ configured: true, connected: false, accountEmail: config.accountEmail, events: [] }, { headers });
  if (connection.email !== config.accountEmail) return NextResponse.json({ configured: true, connected: false, accountEmail: config.accountEmail, reconnectRequired: true, error: "Connect the selected Google account.", events: [] }, { headers });
  try {
    const accessToken = await calendarAccessToken(connection, config);
    const events: CalendarEvent[] = [];
    let pageToken: string | undefined;
    for (let page = 0; page < 10; page++) {
      const url = new URL("https://www.googleapis.com/calendar/v3/calendars/primary/events");
      url.search = new URLSearchParams({ timeMin: range.timeMin, timeMax: range.timeMax, timeZone: "Europe/London", singleEvents: "true", orderBy: "startTime", maxResults: "250", fields: "items(id,status,summary,start,end,htmlLink),nextPageToken", ...(pageToken ? { pageToken } : {}) }).toString();
      const response = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` }, cache: "no-store", signal: AbortSignal.timeout(15000) });
      if (!response.ok) {
        if (response.status === 403) {
          const body = await response.json().catch(() => null) as { error?: { errors?: { reason?: string }[] } } | null;
          const reasons = body?.error?.errors?.map((error) => error.reason) || [];
          if (reasons.includes("accessNotConfigured")) throw new Error("GOOGLE_CALENDAR_API_DISABLED");
          if (reasons.includes("insufficientPermissions")) throw new Error("GOOGLE_CALENDAR_PERMISSION_REQUIRED");
        }
        throw new Error(`GOOGLE_CALENDAR_API_${response.status}`);
      }
      const data = await response.json() as { items?: GoogleEvent[]; nextPageToken?: string };
      for (const item of data.items || []) { const event = calendarEvent(item); if (event) events.push(event); }
      pageToken = data.nextPageToken;
      if (!pageToken) break;
    }
    return NextResponse.json({ configured: true, connected: true, email: connection.email, accountEmail: config.accountEmail, events, truncated: Boolean(pageToken), syncedAt: new Date().toISOString() }, { headers });
  } catch (error) {
    const code = error instanceof Error ? error.message : "";
    const reconnectRequired = /^GOOGLE_CALENDAR_TOKEN_|^GOOGLE_CALENDAR_API_401$|^GOOGLE_CALENDAR_PERMISSION_REQUIRED$/.test(code) || code === "GOOGLE_CALENDAR_CONNECTION_CHANGED" || code.includes("authenticate data");
    const message = code === "GOOGLE_CALENDAR_API_DISABLED" ? "Enable Google Calendar API in the connected Google Cloud project, then refresh." : code === "GOOGLE_CALENDAR_STORAGE_UNAVAILABLE" ? "Calendar storage is unavailable. Try again shortly." : reconnectRequired ? "Google access needs renewing. Reconnect and approve read-only calendar access." : "Google appointments could not be loaded. Please refresh and try again.";
    return NextResponse.json({ configured: true, connected: true, email: connection.email, accountEmail: config.accountEmail, events: [], reconnectRequired, error: message }, { headers });
  }
}

export async function DELETE(request: Request) {
  if (request.headers.get("origin") !== new URL(request.url).origin) return NextResponse.json({ error: "INVALID_ORIGIN" }, { status: 403, headers });
  const ownerId = await googleCalendarOwner();
  if (!ownerId) return NextResponse.json({ error: "OWNER_ACCESS_REQUIRED" }, { status: 403, headers });
  const { error } = await portalService().from("google_calendar_connections").delete().eq("user_id", ownerId);
  return NextResponse.json(error ? { error: "GOOGLE_CALENDAR_DISCONNECT_FAILED" } : { connected: false }, { status: error ? 503 : 200, headers });
}
