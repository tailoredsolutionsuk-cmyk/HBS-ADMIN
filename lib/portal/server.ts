import "server-only";
import { createClient as createServiceClient } from "@supabase/supabase-js";
import { createClient } from "../supabase/server";
import { normalisePortalEmail } from "./validation";

export function portalService() {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) throw new Error("PORTAL_NOT_CONFIGURED");
  return createServiceClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export async function portalAccount() {
  const auth = await createClient();
  const { data, error } = await auth.auth.getUser();
  const email = normalisePortalEmail(data.user?.email);
  if (error || !data.user || !email) return null;

  const db = portalService();
  const membershipResult = await db.from("client_portal_users").select("client_id,disabled").eq("user_id", data.user.id).maybeSingle();
  if (membershipResult.error) throw new Error("PORTAL_LOOKUP_FAILED");
  let membership = membershipResult.data;

  if (!membership) {
    const client = await db.from("clients").select("id").eq("portal_enabled", true).eq("portal_email", email).eq("archived", false).maybeSingle();
    if (client.error || !client.data) return null;
    const linked = await db.from("client_portal_users").upsert({ user_id: data.user.id, client_id: client.data.id, email }, { onConflict: "user_id" }).select("client_id,disabled").single();
    if (linked.error) throw new Error("PORTAL_LINK_FAILED");
    membership = linked.data;
  }

  if (membership.disabled) return null;
  const client = await db.from("clients").select("id,business_name,short_name,email,phone,website,domain,industry,account_manager,status,crm_enabled,bookings_enabled,payments_enabled,ecommerce_enabled,blog_enabled,seo_tools_enabled,portal_enabled,portal_email").eq("id", membership.client_id).eq("portal_enabled", true).eq("archived", false).maybeSingle();
  if (client.error || !client.data) return null;
  if (normalisePortalEmail(client.data.portal_email) !== email) return null;

  await db.from("client_portal_users").update({ last_seen_at: new Date().toISOString(), email }).eq("user_id", data.user.id);
  return { user: { id: data.user.id, email }, client: client.data, db };
}
