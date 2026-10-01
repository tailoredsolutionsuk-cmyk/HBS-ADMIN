import { NextResponse } from "next/server";
import { createClient } from "../../../../lib/supabase/server";
import { portalService } from "../../../../lib/portal/server";
import { defaultProfile, isDuplicateProspect, normaliseProspect, parseProfile, type IdealCustomerProfile, type Prospect } from "../../../../lib/leads/ideal-customer";

export const dynamic = "force-dynamic";

const editableRoles = new Set(["owner", "admin", "editor"]);
const message = (error: string, status: number) => NextResponse.json({ error }, { status });

async function adminContext() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const userId = data?.claims?.sub;
  if (!userId) return { error: message("AUTH_REQUIRED", 401) };
  const adminResult = await supabase.from("admin_users").select("email,role").eq("user_id", userId).maybeSingle();
  if (adminResult.error) return { error: message("ADMIN_LOOKUP_FAILED", 500) };
  if (!adminResult.data) return { error: message("ADMIN_ACCESS_REQUIRED", 403) };
  return { supabase, userId, admin: adminResult.data };
}

async function savedProfile(): Promise<IdealCustomerProfile | null> {
  const result = await portalService().from("lead_generator_profiles").select("sector,location,goal,website_preference").eq("id", "hbs").maybeSingle();
  if (result.error) return null;
  return parseProfile(result.data ? { ...result.data, websitePreference: result.data.website_preference } : defaultProfile);
}

async function existingBusinesses() {
  const db = portalService();
  const [leads, clients] = await Promise.all([
    db.from("leads").select("business_name,website_url,main_location").limit(5000),
    db.from("clients").select("business_name,domain,website").eq("archived", false).limit(5000),
  ]);
  if (leads.error || clients.error) return null;
  return { leads: leads.data || [], clients: clients.data || [] };
}

function candidateFromBody(value: unknown, profile: IdealCustomerProfile): Prospect | null {
  if (!value || typeof value !== "object") return null;
  const candidate = value as Record<string, unknown>;
  const source = candidate.source === "Brave Place Search" ? "Brave Place Search" : "Manual review";
  return normaliseProspect({
    title: candidate.name,
    url: candidate.website,
    provider_url: candidate.sourceUrl,
    categories: [candidate.sector],
    postal_address: { addressLocality: candidate.location, country: candidate.country },
    contact: { email: candidate.email, telephone: candidate.phone },
  }, profile, source);
}

export async function GET() {
  const context = await adminContext();
  if ("error" in context) return context.error;
  const profile = await savedProfile();
  if (!profile) return message("PROFILE_UNAVAILABLE", 503);
  return NextResponse.json({ profile, searchConfigured: Boolean(process.env.BRAVE_SEARCH_API_KEY), canEdit: editableRoles.has(context.admin.role) });
}

export async function POST(request: Request) {
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin) return message("INVALID_ORIGIN", 403);
  const context = await adminContext();
  if ("error" in context) return context.error;
  if (!editableRoles.has(context.admin.role)) return message("READ_ONLY_ACCESS", 403);

  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object") return message("INVALID_REQUEST", 400);
  const action = body.action;
  if (action === "save_profile") {
    const profile = parseProfile(body.profile);
    if (!profile) return message("INVALID_PROFILE", 400);
    const saved = await portalService().from("lead_generator_profiles").upsert({ id: "hbs", sector: profile.sector, location: profile.location, goal: profile.goal, website_preference: profile.websitePreference, updated_by: context.userId, updated_at: new Date().toISOString() }, { onConflict: "id" });
    if (saved.error) return message("PROFILE_SAVE_FAILED", 500);
    return NextResponse.json({ profile });
  }

  const profile = await savedProfile();
  if (!profile) return message("PROFILE_UNAVAILABLE", 503);

  if (action === "search") {
    if (!profile.location) return message("LOCATION_REQUIRED", 400);
    const token = process.env.BRAVE_SEARCH_API_KEY;
    if (!token) return message("SEARCH_NOT_CONFIGURED", 503);
    const params = new URLSearchParams({ q: profile.sector, location: `${profile.location}, United Kingdom`, country: "GB", search_lang: "en", count: "20" });
    let data: { results?: unknown };
    try {
      const response = await fetch(`https://api.search.brave.com/res/v1/local/place_search?${params}`, { headers: { "X-Subscription-Token": token, Accept: "application/json" }, cache: "no-store", signal: AbortSignal.timeout(12000) });
      if (!response.ok) return message(response.status === 429 ? "SEARCH_LIMIT_REACHED" : "SEARCH_PROVIDER_FAILED", 502);
      data = await response.json();
    } catch {
      return message("SEARCH_PROVIDER_UNAVAILABLE", 502);
    }
    const existing = await existingBusinesses();
    if (!existing) return message("DUPLICATE_CHECK_FAILED", 500);
    const results = Array.isArray(data.results) ? data.results.slice(0, 20).map((item) => normaliseProspect(item, profile, "Brave Place Search")).filter((item): item is Prospect => Boolean(item)) : [];
    return NextResponse.json({ results: results.map((prospect) => ({ ...prospect, duplicate: isDuplicateProspect(prospect, existing.leads, existing.clients) })) });
  }

  if (action === "review" || action === "save_lead") {
    const prospect = candidateFromBody(body.candidate, profile);
    if (!prospect) return message("INVALID_PROSPECT", 400);
    const existing = await existingBusinesses();
    if (!existing) return message("DUPLICATE_CHECK_FAILED", 500);
    prospect.duplicate = isDuplicateProspect(prospect, existing.leads, existing.clients);
    if (action === "review") return NextResponse.json({ prospect });
    if (prospect.duplicate) return message("PROSPECT_ALREADY_EXISTS", 409);

    const notes = [`Lead Finder profile match: ${prospect.score}/100`, ...prospect.reasons, prospect.sourceUrl ? `Listing source: ${prospect.sourceUrl}` : "Manual business review", "Verify public information before outreach."].join("\n");
    const saved = await context.supabase.from("leads").insert({
      business_name: prospect.name,
      name: prospect.name,
      email: prospect.email,
      phone: prospect.phone,
      help_needed: `Potential HBS ${profile.goal} project; qualify with the business first.`,
      website_url: prospect.website || null,
      has_website: Boolean(prospect.website),
      industry: prospect.sector,
      main_location: prospect.location,
      source: "Lead Finder",
      notes,
      status: "New",
      probability: 10,
      next_action: "Research and prepare a tailored introduction",
      assigned_to: context.admin.email,
      updated_at: new Date().toISOString(),
    }).select("id,business_name").single();
    if (saved.error) return message("LEAD_SAVE_FAILED", 500);
    await context.supabase.from("crm_activities").insert({ entity_type: "lead", entity_id: saved.data.id, action: "lead_created", detail: `Lead Finder added ${prospect.name} for review`, created_by: context.userId });
    return NextResponse.json({ lead: saved.data }, { status: 201 });
  }
  return message("INVALID_ACTION", 400);
}
