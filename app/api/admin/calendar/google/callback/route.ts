import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { exchangeCalendarToken, googleCalendarConfig, googleCalendarOwner } from "../../../../../../lib/calendar/google";
import { calendarAccountMatches, googleCalendarScope, openCalendarValue, sameState, sealCalendarValue } from "../../../../../../lib/calendar/google-core";
import { portalService } from "../../../../../../lib/portal/server";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const config = googleCalendarConfig();
  if (!config || new URL(request.url).origin !== new URL(config.redirectUri).origin) return NextResponse.json({ error: "GOOGLE_CALENDAR_NOT_CONFIGURED" }, { status: 503 });
  const redirect = (status: string) => {
    const response = NextResponse.redirect(new URL(`/?view=calendar&google_calendar=${status}`, config.redirectUri));
    response.headers.set("Cache-Control", "private, no-store");
    response.headers.set("Referrer-Policy", "no-referrer");
    response.cookies.set("google_calendar_oauth", "", { path: "/api/admin/calendar/google/callback", maxAge: 0, httpOnly: true, secure: new URL(request.url).protocol === "https:", sameSite: "lax" });
    return response;
  };
  const params = new URL(request.url).searchParams;
  const raw = (await cookies()).get("google_calendar_oauth")?.value;
  if (!raw) return redirect("invalid");
  let pending: { state: string; verifier: string; ownerId: string; expiresAt: number };
  try { pending = JSON.parse(openCalendarValue(raw, config.key)); } catch { return redirect("invalid"); }
  const ownerId = await googleCalendarOwner();
  if (!ownerId || ownerId !== pending.ownerId || !sameState(params.get("state"), pending.state) || !Number.isFinite(pending.expiresAt) || pending.expiresAt < Date.now() || typeof pending.verifier !== "string") return redirect("invalid");
  if (params.has("error")) return redirect("denied");
  if (!params.get("code")) return redirect("invalid");
  try {
    const tokens = await exchangeCalendarToken(config, { grant_type: "authorization_code", code: params.get("code")!, redirect_uri: config.redirectUri, code_verifier: pending.verifier });
    if (!tokens.scope?.split(" ").includes(googleCalendarScope)) return redirect("permission_required");
    if (!tokens.refresh_token) return redirect("no_refresh");
    const profileResponse = await fetch("https://openidconnect.googleapis.com/v1/userinfo", { headers: { Authorization: `Bearer ${tokens.access_token}` }, cache: "no-store", signal: AbortSignal.timeout(15000) });
    if (!profileResponse.ok) return redirect("profile_failed");
    const profile = await profileResponse.json() as { email?: string; email_verified?: boolean };
    if (!calendarAccountMatches(profile, config.accountEmail)) return redirect("wrong_account");
    const { error } = await portalService().from("google_calendar_connections").upsert({
      user_id: ownerId, email: config.accountEmail, access_token: sealCalendarValue(tokens.access_token, config.key),
      refresh_token: sealCalendarValue(tokens.refresh_token, config.key), expires_at: new Date(Date.now() + tokens.expires_in * 1000).toISOString(), updated_at: new Date().toISOString(),
    }, { onConflict: "user_id" });
    return redirect(error ? "storage_failed" : "connected");
  } catch { return redirect("failed"); }
}
