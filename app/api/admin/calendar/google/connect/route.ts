import { createHash, randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { googleCalendarConfig, googleCalendarOwner } from "../../../../../../lib/calendar/google";
import { googleCalendarScopes, sealCalendarValue } from "../../../../../../lib/calendar/google-core";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const ownerId = await googleCalendarOwner();
  if (!ownerId) return NextResponse.json({ error: "OWNER_ACCESS_REQUIRED" }, { status: 403 });
  const config = googleCalendarConfig();
  if (!config || new URL(request.url).origin !== new URL(config.redirectUri).origin) return NextResponse.json({ error: "GOOGLE_CALENDAR_NOT_CONFIGURED" }, { status: 503 });
  const state = randomBytes(32).toString("base64url");
  const verifier = randomBytes(32).toString("base64url");
  const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  url.search = new URLSearchParams({
    client_id: config.clientId, redirect_uri: config.redirectUri, response_type: "code", scope: googleCalendarScopes,
    state, code_challenge: createHash("sha256").update(verifier).digest("base64url"), code_challenge_method: "S256",
    access_type: "offline", prompt: "select_account consent", login_hint: config.accountEmail,
  }).toString();
  const response = NextResponse.redirect(url);
  response.headers.set("Cache-Control", "private, no-store");
  response.cookies.set("google_calendar_oauth", sealCalendarValue(JSON.stringify({ state, verifier, ownerId, expiresAt: Date.now() + 600000 }), config.key), {
    httpOnly: true, secure: new URL(request.url).protocol === "https:", sameSite: "lax", maxAge: 600, path: "/api/admin/calendar/google/callback",
  });
  return response;
}
