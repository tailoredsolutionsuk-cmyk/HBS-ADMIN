import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { encryptGoogleToken, exchangeGoogleToken, googleSheetsConfig, googleSheetsOwner, outreachSheetName, outreachSpreadsheetId } from "../../../../../lib/google-sheets/outreach";
import { portalService } from "../../../../../lib/portal/server";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const config = googleSheetsConfig();
  if (!config || new URL(request.url).origin !== new URL(config.redirectUri).origin) {
    return NextResponse.redirect(new URL("/admin?view=integrations&google_sheets=not_configured", request.url));
  }
  const params = new URL(request.url).searchParams;
  const cookieStore = await cookies();
  const raw = cookieStore.get("google_sheets_oauth")?.value;
  const redirect = (status: string) => {
    const result = NextResponse.redirect(new URL(`/admin?view=integrations&google_sheets=${status}`, request.url));
    result.cookies.set("google_sheets_oauth", "", { path: "/api/admin/google-sheets/callback", maxAge: 0, httpOnly: true, secure: new URL(request.url).protocol === "https:", sameSite: "lax" });
    return result;
  };
  if (!raw || params.has("error")) return redirect("denied");
  let pending: { state: string; verifier: string; ownerId: string };
  try { pending = JSON.parse(raw); } catch { return redirect("invalid"); }
  const owner = await googleSheetsOwner();
  if (!owner || owner.userId !== pending.ownerId || !pending.state || pending.state !== params.get("state") || !params.get("code")) return redirect("invalid");
  try {
    const tokens = await exchangeGoogleToken(config, { grant_type: "authorization_code", code: params.get("code")!, redirect_uri: config.redirectUri, code_verifier: pending.verifier });
    if (!tokens.refresh_token) return redirect("no_refresh");
    const profileResponse = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", { headers: { Authorization: `Bearer ${tokens.access_token}` }, cache: "no-store" });
    if (!profileResponse.ok) return redirect("profile_failed");
    const profile = await profileResponse.json() as { email?: string };
    if (!profile.email) return redirect("profile_failed");
    const { error } = await portalService().from("google_sheets_connections").upsert({
      user_id: owner.userId, email: profile.email,
      access_token: encryptGoogleToken(tokens.access_token, config.key), refresh_token: encryptGoogleToken(tokens.refresh_token, config.key),
      expires_at: new Date(Date.now() + tokens.expires_in * 1000).toISOString(), spreadsheet_id: outreachSpreadsheetId,
      sheet_name: outreachSheetName, updated_at: new Date().toISOString(),
    }, { onConflict: "user_id" });
    if (error) return redirect("storage_failed");
    return redirect("connected");
  } catch {
    return redirect("failed");
  }
}
