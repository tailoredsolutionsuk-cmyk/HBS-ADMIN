import { createHmac } from "node:crypto";
import { analyticsBrowser, analyticsDevice, analyticsOrigin, analyticsPath, analyticsReferrer } from "../../../../lib/analytics/public";
import { portalService } from "../../../../lib/portal/server";

export const dynamic = "force-dynamic";

function headers(origin?: string) {
  return {
    ...(origin ? { "Access-Control-Allow-Origin": origin } : {}),
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Cache-Control": "no-store",
    "Vary": "Origin",
  };
}

async function clientFor(request: Request) {
  const site = analyticsOrigin(request.headers.get("origin"));
  if (!site) return null;
  const db = portalService();
  const { data, error } = await db.from("clients").select("id,domain,website").eq("archived", false).in("domain", [site.hostname, site.domain]).limit(2);
  if (error || data?.length !== 1) return null;
  const client = data[0];
  const configured = analyticsOrigin(client.website)?.domain || String(client.domain || "").toLowerCase().replace(/^www\./, "");
  return configured === site.domain ? { db, clientId: client.id as string, site } : null;
}

export async function OPTIONS(request: Request) {
  const client = await clientFor(request).catch(() => null);
  return client ? new Response(null, { status: 204, headers: headers(client.site.origin) }) : new Response(null, { status: 403, headers: headers() });
}

export async function POST(request: Request) {
  const client = await clientFor(request).catch(() => null);
  if (!client) return new Response(null, { status: 403, headers: headers() });
  const responseHeaders = headers(client.site.origin);
  if (request.headers.get("dnt") === "1") return new Response(null, { status: 204, headers: responseHeaders });
  if (!request.headers.get("content-type")?.startsWith("application/json")) return new Response(null, { status: 415, headers: responseHeaders });

  const length = Number(request.headers.get("content-length") || "0");
  if (length > 2000) return new Response(null, { status: 413, headers: responseHeaders });
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return new Response(null, { status: 400, headers: responseHeaders });
  }
  const path = analyticsPath(body.path);
  if (!path) return new Response(null, { status: 400, headers: responseHeaders });

  const userAgent = (request.headers.get("user-agent") || "").slice(0, 500);
  const ip = (request.headers.get("x-forwarded-for") || "unknown").split(",")[0].trim().slice(0, 100);
  const secret = process.env.BUILDER_FORM_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!secret) return new Response(null, { status: 503, headers: responseHeaders });
  const day = new Date().toISOString().slice(0, 10);
  const visitorHash = createHmac("sha256", secret).update(`${day}:${client.clientId}:${ip}:${userAgent}`).digest("hex").slice(0, 32);
  const minuteAgo = new Date(Date.now() - 60_000).toISOString();
  const recent = await client.db.from("page_views").select("id", { count: "exact", head: true }).eq("client_id", client.clientId).eq("visitor_hash", visitorHash).gte("timestamp", minuteAgo);
  if (recent.error) return new Response(null, { status: 503, headers: responseHeaders });
  if ((recent.count || 0) >= 60) return new Response(null, { status: 204, headers: responseHeaders });

  const country = (request.headers.get("x-vercel-ip-country") || "").toUpperCase();
  const { error } = await client.db.from("page_views").insert({
    client_id: client.clientId,
    path,
    referrer: analyticsReferrer(body.referrer, client.site.hostname),
    visitor_hash: visitorHash,
    device: analyticsDevice(userAgent),
    browser: analyticsBrowser(userAgent),
    country: /^[A-Z]{2}$/.test(country) ? country : null,
  });
  return new Response(null, { status: error ? 503 : 204, headers: responseHeaders });
}
