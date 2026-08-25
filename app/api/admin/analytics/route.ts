import { NextResponse } from "next/server";
import { createClient } from "../../../../lib/supabase/server";

export const dynamic = "force-dynamic";

type ViewRow = {
  path: string | null;
  timestamp: string;
  visitor_hash: string | null;
  referrer: string | null;
  device: string | null;
  browser: string | null;
};

function topValues(rows: ViewRow[], key: "path" | "referrer" | "device" | "browser", limit: number) {
  const counts = new Map<string, number>();
  for (const row of rows) {
    const value = row[key] || "Direct / unknown";
    counts.set(value, (counts.get(value) ?? 0) + 1);
  }
  return [...counts.entries()]
    .sort(([, left], [, right]) => right - left)
    .slice(0, limit)
    .map(([label, value]) => ({ label, value }));
}

export async function GET() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const claims = data?.claims;
  if (!claims?.sub) return NextResponse.json({ error: "AUTH_REQUIRED" }, { status: 401 });

  const sinceDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const since = sinceDate.toISOString();
  const [adminResult, countResult, viewsResult] = await Promise.all([
    supabase.from("admin_users").select("email, role").eq("user_id", claims.sub).maybeSingle(),
    supabase.from("page_views").select("id", { count: "exact", head: true }).or("client_id.is.null,client_id.eq.hbsmarketing").gte("timestamp", since),
    supabase.from("page_views").select("path,timestamp,visitor_hash,referrer,device,browser").or("client_id.is.null,client_id.eq.hbsmarketing").gte("timestamp", since).order("timestamp", { ascending: false }).limit(5000),
  ]);

  if (!adminResult.data) return NextResponse.json({ error: "ADMIN_ACCESS_REQUIRED" }, { status: 403 });
  if (countResult.error || viewsResult.error) return NextResponse.json({ error: "SUPABASE_QUERY_FAILED" }, { status: 500 });

  const rows = (viewsResult.data ?? []) as ViewRow[];
  const daily = Array.from({ length: 30 }, (_, index) => {
    const date = new Date(Date.now() - (29 - index) * 24 * 60 * 60 * 1000);
    const key = date.toISOString().slice(0, 10);
    return { date: date.toLocaleDateString("en-GB", { day: "2-digit", month: "short" }), value: rows.filter((row) => row.timestamp.slice(0, 10) === key).length };
  });

  return NextResponse.json({
    range: "30d",
    totals: { views: countResult.count ?? 0, visitors: new Set(rows.map((row) => row.visitor_hash).filter(Boolean)).size },
    daily,
    pages: topValues(rows, "path", 8),
    referrers: topValues(rows, "referrer", 6),
    devices: topValues(rows, "device", 4),
    browsers: topValues(rows, "browser", 5),
  });
}

