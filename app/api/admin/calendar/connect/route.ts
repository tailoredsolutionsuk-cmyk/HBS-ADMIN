import { createHash, randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { calendarOwner, outlookConfig, outlookScopes } from "../../../../../lib/calendar/outlook";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const ownerId = await calendarOwner();
  if (!ownerId) return NextResponse.json({ error: "OWNER_ACCESS_REQUIRED" }, { status: 403 });
  const config = outlookConfig();
  if (!config || new URL(request.url).origin !== new URL(config.redirectUri).origin) {
    return NextResponse.json({ error: "OUTLOOK_NOT_CONFIGURED" }, { status: 503 });
  }
  const state = randomBytes(32).toString("base64url");
  const verifier = randomBytes(32).toString("base64url");
  const challenge = createHash("sha256").update(verifier).digest("base64url");
  const url = new URL("https://login.microsoftonline.com/common/oauth2/v2.0/authorize");
  url.search = new URLSearchParams({
    client_id: config.clientId,
    response_type: "code",
    redirect_uri: config.redirectUri,
    response_mode: "query",
    scope: outlookScopes,
    state,
    code_challenge: challenge,
    code_challenge_method: "S256",
    prompt: "select_account",
  }).toString();
  const response = NextResponse.redirect(url);
  response.cookies.set("outlook_oauth", JSON.stringify({ state, verifier, ownerId }), {
    httpOnly: true, secure: new URL(request.url).protocol === "https:", sameSite: "lax", maxAge: 600,
    path: "/api/admin/calendar/callback",
  });
  return response;
}
