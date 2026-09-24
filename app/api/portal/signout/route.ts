import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "../../../../lib/supabase/server";

export async function POST(request: NextRequest) {
  if (request.headers.get("origin") !== request.nextUrl.origin) return NextResponse.json({ error: "INVALID_ORIGIN" }, { status: 403 });
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  if (data.user) await supabase.auth.signOut();
  return NextResponse.redirect(new URL("/portal/login", request.url), { status: 303 });
}
