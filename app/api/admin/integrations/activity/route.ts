import { NextResponse } from "next/server";
import { createClient } from "../../../../../lib/supabase/server";
import { portalService } from "../../../../../lib/portal/server";

export const dynamic = "force-dynamic";

async function ownerAccess() {
  const auth = await createClient();
  const claims = await auth.auth.getClaims();
  const userId = claims.data?.claims?.sub;
  if (!userId) return null;
  const admin = await auth.from("admin_users").select("role").eq("user_id", userId).maybeSingle();
  return admin.data && ["owner", "admin"].includes(admin.data.role) ? admin.data : null;
}

async function github(path: string, init?: RequestInit) {
  if (!process.env.GITHUB_TOKEN) throw new Error("GITHUB_NOT_CONFIGURED");
  const response = await fetch(`https://api.github.com${path}`, { ...init, headers: { Authorization: `Bearer ${process.env.GITHUB_TOKEN}`, Accept: "application/vnd.github+json", "Content-Type": "application/json", "X-GitHub-Api-Version": "2022-11-28", ...init?.headers }, cache: "no-store", signal: AbortSignal.timeout(15_000) });
  if (!response.ok) throw new Error(`GITHUB_WEBHOOK_${response.status}`);
  return response.status === 204 ? null : response.json();
}

export async function POST(request: Request) {
  if (request.headers.get("origin") !== new URL(request.url).origin) return NextResponse.json({ error: "INVALID_ORIGIN" }, { status: 403 });
  if (!await ownerAccess()) return NextResponse.json({ error: "ADMIN_ACCESS_REQUIRED" }, { status: 403 });
  if (!process.env.CRON_SECRET || process.env.CRON_SECRET.length < 32) return NextResponse.json({ error: "WEBHOOK_SECRET_NOT_CONFIGURED" }, { status: 503 });
  const db = portalService();
  const sources = await db.from("project_activity_sources").select("id,external_key,project_name,webhook_id").eq("provider", "github").eq("enabled", true);
  if (sources.error) return NextResponse.json({ error: "SOURCE_LOOKUP_FAILED" }, { status: 500 });
  const endpoint = `${new URL(request.url).origin}/api/integrations/github/activity`;
  const results = [];
  for (const source of sources.data ?? []) {
    try {
      const hooks = await github(`/repos/${source.external_key}/hooks?per_page=100`) as Array<{ id: number; active: boolean; events: string[]; config?: { url?: string } }>;
      let hook = hooks.find((item) => item.config?.url === endpoint && item.events.includes("push"));
      if (!hook) hook = await github(`/repos/${source.external_key}/hooks`, { method: "POST", body: JSON.stringify({ name: "web", active: true, events: ["push"], config: { url: endpoint, content_type: "json", secret: process.env.CRON_SECRET, insecure_ssl: "0" } }) as unknown as RequestInit["body"] });
      if (!hook?.id) throw new Error("GITHUB_WEBHOOK_INVALID_RESPONSE");
      await db.from("project_activity_sources").update({ webhook_id: hook.id, last_verified_at: new Date().toISOString(), last_error: null }).eq("id", source.id);
      results.push({ project: source.project_name, ready: true });
    } catch (error) {
      const message = error instanceof Error ? error.message : "GITHUB_WEBHOOK_FAILED";
      await db.from("project_activity_sources").update({ last_error: message.slice(0, 1000) }).eq("id", source.id);
      results.push({ project: source.project_name, ready: false, error: message });
    }
  }
  return NextResponse.json({ endpoint, results });
}
