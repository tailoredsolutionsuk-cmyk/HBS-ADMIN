import "server-only";
import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "../supabase/server";
import { portalService } from "../portal/server";
import { OnboardingError, record } from "./model";
export const PROJECT_COLUMNS = "id,client_id,name,service,target_date,status,brief,revision,review_note,created_at,updated_at";
export async function mutationLimit(db: SupabaseClient, user: string) {
  const { data, error } = await db.rpc("builder_rate_limit", { p_key: `onboarding:${user}`, p_limit: 30, p_seconds: 60 });
  databaseError(error);
  if (!data) throw new OnboardingError("Too many updates. Please wait a minute before retrying.", 429);
}
export async function onboardingAdmin() {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || !process.env.SUPABASE_SERVICE_ROLE_KEY) throw new OnboardingError("Onboarding database connection is not configured.", 503);
  const auth = await createClient();
  const { data, error } = await auth.auth.getUser();
  if (error || !data.user) throw new OnboardingError("Please sign in to HBS Admin.", 401);
  const { data: admin, error: roleError } = await auth.from("admin_users").select("role").eq("user_id", data.user.id).maybeSingle();
  if (roleError || !admin || !["owner", "admin", "editor", "viewer"].includes(admin.role)) throw new OnboardingError("Admin access required.", 403);
  return { id: data.user.id, role: admin.role as string, db: portalService() };
}
export async function readMutation(request: Request) {
  if (request.headers.get("origin") !== new URL(request.url).origin) throw new OnboardingError("Invalid request origin.", 403);
  if (!request.headers.get("content-type")?.startsWith("application/json")) throw new OnboardingError("JSON required.", 415);
  const reader = request.body?.getReader();
  if (!reader) throw new OnboardingError("Missing request.");
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      size += chunk.value.byteLength;
      if (size > 128_000) { await reader.cancel(); throw new OnboardingError("Request is too large.", 413); }
      chunks.push(chunk.value);
    }
  } finally { reader.releaseLock(); }
  const buffer = new Uint8Array(size); let offset = 0;
  for (const chunk of chunks) { buffer.set(chunk, offset); offset += chunk.length; }
  try { return record(JSON.parse(new TextDecoder().decode(buffer))); }
  catch (error) { if (error instanceof OnboardingError) throw error; throw new OnboardingError("Invalid JSON."); }
}
export function databaseError(error: { code?: string } | null) {
  if (!error) return;
  if (error.code === "42501") throw new OnboardingError("You do not have permission for this project.", 403);
  if (error.code === "40001") throw new OnboardingError("This project changed or is no longer editable. Reload it before trying again.", 409);
  if (error.code === "P0002") throw new OnboardingError("Project or client is unavailable.", 404);
  if (error.code === "22023") throw new OnboardingError("The brief or action is incomplete.", 400);
  throw new OnboardingError("Onboarding could not be saved or loaded. Check the database migration and try again.", 503);
}
export function failure(error: unknown) {
  return NextResponse.json({ error: error instanceof OnboardingError ? error.message : "Onboarding is temporarily unavailable. Please try again." }, { status: error instanceof OnboardingError ? error.status : 503, headers: { "Cache-Control": "no-store" } });
}
export function response(data: unknown) { return NextResponse.json(data, { headers: { "Cache-Control": "no-store" } }); }

