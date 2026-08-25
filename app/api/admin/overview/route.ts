import { NextResponse } from "next/server";
import { createClient } from "../../../../lib/supabase/server";

export const dynamic = "force-dynamic";

type ClientRecord = {
  id: string;
  business_name: string | null;
  short_name: string | null;
  domain: string | null;
  status: string | null;
  position: number | null;
  updated_at: string | null;
  created_at: string | null;
};

function relativeTime(value: string | null) {
  if (!value) return "Unknown";
  const elapsed = Date.now() - new Date(value).getTime();
  const minutes = Math.max(1, Math.round(elapsed / 60000));
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} ago`;
  const days = Math.round(hours / 24);
  return `${days} day${days === 1 ? "" : "s"} ago`;
}

function toneFor(index: number) {
  return (["peach", "blue", "mint", "lavender"] as const)[index % 4];
}

export async function GET() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const claims = data?.claims;

  if (!claims?.sub) return NextResponse.json({ error: "AUTH_REQUIRED" }, { status: 401 });

  const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const [adminResult, clientsResult, viewsResult, alertsResult] = await Promise.all([
    supabase.from("admin_users").select("email, role").eq("user_id", claims.sub).maybeSingle(),
    supabase.from("clients").select("id,business_name,short_name,domain,status,position,updated_at,created_at").eq("archived", false).order("position", { ascending: true, nullsFirst: false }),
    supabase.from("page_views").select("id", { count: "exact", head: true }).gte("timestamp", since),
    supabase.from("alert_events").select("event,title,detail,read,created_at").order("created_at", { ascending: false }).limit(8),
  ]);

  if (adminResult.error) return NextResponse.json({ error: "ADMIN_ACCESS_REQUIRED" }, { status: 403 });
  if (!adminResult.data) return NextResponse.json({ error: "ADMIN_ACCESS_REQUIRED" }, { status: 403 });
  if (clientsResult.error || viewsResult.error || alertsResult.error) {
    return NextResponse.json({ error: "SUPABASE_QUERY_FAILED" }, { status: 500 });
  }

  const clients = (clientsResult.data ?? []) as ClientRecord[];
  const websites = clients.map((client, index) => ({
    name: client.business_name || client.short_name || client.id,
    domain: client.domain || "Domain not connected",
    type: "Client website",
    status: client.status === "active" ? "Live" : client.status ? client.status.replace(/^./, (letter) => letter.toUpperCase()) : "Pending",
    color: toneFor(index),
    updated: relativeTime(client.updated_at || client.created_at),
    deployment: client.status === "active" ? "Production" : "Preview",
  }));

  const activities = (alertsResult.data ?? []).map((alert, index) => ({
    title: alert.title || alert.event || "HBS activity",
    detail: alert.detail || "Supabase event",
    time: relativeTime(alert.created_at),
    tone: toneFor(index),
  }));

  return NextResponse.json({
    websites,
    activities,
    stats: {
      activeWebsites: clients.filter((client) => client.status === "active").length,
      deployments: "—",
      teamMembers: "—",
      uptime: "—",
      pageViews30d: viewsResult.count ?? 0,
    },
    admin: adminResult.data,
  });
}

