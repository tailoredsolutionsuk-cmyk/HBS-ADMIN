import { createHash, randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { googleSheetsConfig, googleSheetsOwner, outreachScopes } from "../../../../../lib/google-sheets/outreach";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const owner = await googleSheetsOwner();
  if (!owner) return NextResponse.json({ error: "ADMIN_ACCESS_REQUIRED" }, { status: 403 });
  const config = googleSheetsConfig();
  if (!config || new URL(request.url).origin !== new URL(config.redirectUri).origin) {
    return NextResponse.redirect(new URL("/admin?view=integrations&google_sheets=not_configured", request.url));
  }
  const state = randomBytes(32).toString("base64url");
  const verifier = randomBytes(32).toString("base64url");
  const challenge = createHash("sha256").update(verifier).digest("base64url");
  const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  url.search = new URLSearchParams({
    client_id: config.clientId, response_type: "code", redirect_uri: config.redirectUri,
    scope: outreachScopes, state, code_challenge: challenge, code_challenge_method: "S256",
    access_type: "offline", prompt: "consent", include_granted_scopes: "true",
  }).toString();
  const response = NextResponse.redirect(url);
  response.cookies.set("google_sheets_oauth", JSON.stringify({ state, verifier, ownerId: owner.userId }), {
    httpOnly: true, secure: new URL(request.url).protocol === "https:", sameSite: "lax", maxAge: 600,
    path: "/api/admin/google-sheets/callback",
  });
  return response;
}
