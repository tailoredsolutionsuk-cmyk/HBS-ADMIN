import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { calendarOwner, encryptToken, exchangeOutlookToken, outlookConfig, outlookScopes } from "../../../../../lib/calendar/outlook";
import { portalService } from "../../../../../lib/portal/server";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const config = outlookConfig();
  if (!config || new URL(request.url).origin !== new URL(config.redirectUri).origin) {
    return NextResponse.json({ error: "OUTLOOK_NOT_CONFIGURED" }, { status: 503 });
  }
  const params = new URL(request.url).searchParams;
  const cookieStore = await cookies();
  const raw = cookieStore.get("outlook_oauth")?.value;
  const redirect = (status: string) => {
    const result = NextResponse.redirect(new URL(`/admin?view=calendar&outlook=${status}`, request.url));
    result.cookies.set("outlook_oauth", "", {
      path: "/api/admin/calendar/callback", maxAge: 0, httpOnly: true,
      secure: new URL(request.url).protocol === "https:", sameSite: "lax",
    });
    return result;
  };
  if (!raw || params.has("error")) return redirect("denied");
  let pending: { state: string; verifier: string; ownerId: string };
  try { pending = JSON.parse(raw); } catch { return redirect("invalid"); }
  const ownerId = await calendarOwner();
  if (!ownerId || ownerId !== pending.ownerId || !pending.state || pending.state !== params.get("state") || !params.get("code")) return redirect("invalid");
  try {
    const tokens = await exchangeOutlookToken(config, {
      grant_type: "authorization_code",
      code: params.get("code")!,
      redirect_uri: config.redirectUri,
      code_verifier: pending.verifier,
      scope: outlookScopes,
    });
    if (!tokens.refresh_token) return redirect("no_refresh");
    const profileResponse = await fetch("https://graph.microsoft.com/v1.0/me?$select=mail,userPrincipalName", {
      headers: { Authorization: `Bearer ${tokens.access_token}` }, cache: "no-store",
    });
    if (!profileResponse.ok) return redirect("profile_failed");
    const profile = await profileResponse.json() as { mail?: string; userPrincipalName?: string };
    const email = profile.mail || profile.userPrincipalName;
    if (!email) return redirect("profile_failed");
    const { error } = await portalService().from("outlook_calendar_connections").upsert({
      user_id: ownerId,
      email,
      access_token: encryptToken(tokens.access_token, config.key),
      refresh_token: encryptToken(tokens.refresh_token, config.key),
      expires_at: new Date(Date.now() + tokens.expires_in * 1000).toISOString(),
      updated_at: new Date().toISOString(),
    }, { onConflict: "user_id" });
    if (error) return redirect("storage_failed");
    return redirect("connected");
  } catch {
    return redirect("failed");
  }
}
