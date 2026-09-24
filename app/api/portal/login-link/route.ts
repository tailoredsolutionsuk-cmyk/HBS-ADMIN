import { createHash } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";
import { portalService } from "../../../../lib/portal/server";
import { normalisePortalEmail } from "../../../../lib/portal/validation";

export const dynamic = "force-dynamic";
const neutral = { message: "If portal access is enabled for that email, a secure sign-in link is on its way." };

export async function POST(request: NextRequest) {
  if (request.headers.get("origin") !== request.nextUrl.origin) return NextResponse.json({ error: "Open the client portal to sign in." }, { status: 403 });
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return NextResponse.json({ error: "Client sign-in is temporarily unavailable. Please contact HBS." }, { status: 503 });
  }
  const body = await request.json().catch(() => ({}));
  const email = normalisePortalEmail(body.email);
  if (!email) return NextResponse.json(neutral, { status: 202, headers: { "Cache-Control": "no-store" } });

  try {
    const db = portalService();
    const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
    const key = createHash("sha256").update(`${forwarded}:${email}`).digest("hex");
    const limited = await db.rpc("client_portal_rate_limit", { p_key: key, p_limit: 4, p_seconds: 900 });
    if (limited.error || !limited.data) return NextResponse.json(neutral, { status: 202, headers: { "Cache-Control": "no-store" } });

    const allowed = await db.from("clients").select("id").eq("portal_enabled", true).eq("portal_email", email).eq("archived", false).maybeSingle();
    if (!allowed.data || allowed.error) return NextResponse.json(neutral, { status: 202, headers: { "Cache-Control": "no-store" } });

    const auth = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const configuredOrigin = process.env.PORTAL_PUBLIC_ORIGIN;
    const redirectOrigin = configuredOrigin && process.env.NODE_ENV === "production" ? new URL(configuredOrigin).origin : request.nextUrl.origin;
    await auth.auth.signInWithOtp({ email, options: { shouldCreateUser: true, emailRedirectTo: `${redirectOrigin}/auth/complete` } });
    return NextResponse.json(neutral, { status: 202, headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json(neutral, { status: 202, headers: { "Cache-Control": "no-store" } });
  }
}
