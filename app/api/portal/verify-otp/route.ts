import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "../../../../lib/supabase/server";
import { portalService } from "../../../../lib/portal/server";
import { isValidPortalOtp, normalisePortalEmail } from "../../../../lib/portal/validation";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  if (request.headers.get("origin") !== request.nextUrl.origin) return NextResponse.json({ error: "Open the client portal to verify your code." }, { status: 403 });
  const body = await request.json().catch(() => ({}));
  const email = normalisePortalEmail(body.email);
  if (!email || !isValidPortalOtp(body.code)) return NextResponse.json({ error: "Enter the six-digit code from your email." }, { status: 400 });

  const auth = await createClient();
  const { data, error } = await auth.auth.verifyOtp({ email, token: String(body.code).trim(), type: "email" });
  if (error || !data.user) return NextResponse.json({ error: "That code is invalid or has expired." }, { status: 401 });

  const db = portalService();
  const allowed = await db.from("clients").select("id").eq("portal_enabled", true).eq("portal_email", email).eq("archived", false).maybeSingle();
  if (allowed.error || !allowed.data) {
    await auth.auth.signOut();
    return NextResponse.json({ error: "Portal access has not been enabled for this account." }, { status: 403 });
  }
  return NextResponse.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
}
