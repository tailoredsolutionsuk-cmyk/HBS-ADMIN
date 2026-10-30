import { NextResponse } from "next/server";
import { createClient } from "../../../../lib/supabase/server";
import { portalService } from "../../../../lib/portal/server";
import { canEditOutreach, canUndoOutreach, outreachSince, parseOutreachEntry, uuidPattern, type OutreachPeriod } from "../../../../lib/crm/outreach";

export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "private, no-store" };
const failure = (error: string, status: number) => NextResponse.json({ error }, { status, headers });
async function staff() {
  const auth = await createClient();
  const { data, error } = await auth.auth.getUser();
  if (error || !data.user) return { error: failure("AUTH_REQUIRED", 401) };
  const { data: admin, error: adminError } = await auth.from("admin_users").select("role").eq("user_id", data.user.id).maybeSingle();
  if (adminError || !admin) return { error: failure("ADMIN_ACCESS_REQUIRED", 403) };
  return { auth, userId: data.user.id, role: String(admin.role) };
}
const validOrigin = (request: Request) => !request.headers.get("origin") || request.headers.get("origin") === new URL(request.url).origin;

export async function GET(request: Request) {
  try {
    const account = await staff();
    if ("error" in account) return account.error;
    const requested = new URL(request.url).searchParams.get("period") || "30d";
    if (!["today", "7d", "30d", "all"].includes(requested)) return failure("INVALID_PERIOD", 400);
    const db = portalService();
    const dashboard = await db.rpc("crm_outreach_dashboard", { p_since: outreachSince(requested as OutreachPeriod) });
    if (dashboard.error || !dashboard.data) return failure("OUTREACH_UNAVAILABLE", 503);
    const leads = [];
    for (let offset = 0; ; offset += 1000) {
      const page = await account.auth.from("leads").select("id,business_name,email,phone,main_location,status,source,notes,next_action,next_action_at").order("id").range(offset, offset + 999);
      if (page.error) return failure("OUTREACH_UNAVAILABLE", 503);
      leads.push(...(page.data || []));
      if (!page.data || page.data.length < 1000) break;
    }
    const stats = dashboard.data.leadStats.map((lead: Record<string, unknown>) => {
      const { bookingCreatedBy, ...safeLead } = lead;
      const history = (lead.history as Array<Record<string, unknown>>).map(({ created_by, ...event }) => ({ ...event, canUndo: canUndoOutreach(account.role, account.userId, created_by as string | null) }));
      return { ...safeLead, history, canUndoBooking: canUndoOutreach(account.role, account.userId, bookingCreatedBy as string | null) };
    });
    return NextResponse.json({ ...dashboard.data, leadStats: stats, leads, canEdit: canEditOutreach(account.role), period: requested }, { headers });
  } catch { return failure("OUTREACH_UNAVAILABLE", 503); }
}

export async function POST(request: Request) {
  if (!validOrigin(request)) return failure("INVALID_ORIGIN", 403);
  try {
    const account = await staff();
    if ("error" in account) return account.error;
    if (!canEditOutreach(account.role)) return failure("READ_ONLY_ACCESS", 403);
    const entry = parseOutreachEntry(await request.json().catch(() => null));
    if (!entry) return failure("INVALID_OUTREACH_ENTRY", 400);
    const lead = await account.auth.from("leads").select("id").eq("id", entry.leadId).maybeSingle();
    if (lead.error) return failure("OUTREACH_UNAVAILABLE", 503);
    if (!lead.data) return failure("LEAD_NOT_FOUND", 404);
    const db = portalService();
    const row = { id: entry.id, lead_id: entry.leadId, event_type: entry.kind, method: entry.method, notes: entry.notes, meeting_at: entry.meetingAt, sequence_step: entry.sequenceStep, created_by: account.userId };
    const saved = await db.from("crm_outreach_events").insert(row).select("id").single();
    if (!saved.error) return NextResponse.json({ id: saved.data.id }, { status: 201, headers });
    if (saved.error.code === "23505") {
      const existing = await db.from("crm_outreach_events").select("id,lead_id,event_type,method,notes,meeting_at,sequence_step,created_by").eq("id", entry.id).maybeSingle();
      if (existing.data) {
        const sameDate = (existing.data.meeting_at ? new Date(existing.data.meeting_at).toISOString() : null) === entry.meetingAt;
        const same = existing.data.lead_id === entry.leadId && existing.data.event_type === entry.kind && existing.data.method === entry.method && existing.data.notes === entry.notes && existing.data.sequence_step === entry.sequenceStep && existing.data.created_by === account.userId && sameDate;
        return same ? NextResponse.json({ id: existing.data.id, replayed: true }, { headers }) : failure("ENTRY_ID_CONFLICT", 409);
      }
      if (entry.sequenceStep) return failure("FOLLOW_UP_ALREADY_LOGGED", 409);
      if (entry.kind === "meeting_booked") {
        const booked = await db.from("crm_outreach_events").select("id").eq("lead_id", entry.leadId).eq("event_type", "meeting_booked").is("voided_at", null).maybeSingle();
        if (booked.data) return NextResponse.json({ id: booked.data.id, alreadyBooked: true }, { headers });
      }
    }
    if (saved.error.code === "P0001") return failure(saved.error.message === "SEQUENCE_CLOSED" ? "SEQUENCE_CLOSED" : "FOLLOW_UP_NOT_DUE", 409);
    return failure("OUTREACH_SAVE_FAILED", 503);
  } catch { return failure("OUTREACH_SAVE_FAILED", 503); }
}

export async function PATCH(request: Request) {
  if (!validOrigin(request)) return failure("INVALID_ORIGIN", 403);
  try {
    const account = await staff();
    if ("error" in account) return account.error;
    if (!canEditOutreach(account.role)) return failure("READ_ONLY_ACCESS", 403);
    const body = await request.json().catch(() => null);
    if (!body || typeof body.id !== "string" || !uuidPattern.test(body.id)) return failure("INVALID_OUTREACH_ENTRY", 400);
    const db = portalService();
    const event = await db.from("crm_outreach_events").select("id,created_by,voided_at").eq("id", body.id).maybeSingle();
    if (event.error) return failure("OUTREACH_UNAVAILABLE", 503);
    if (!event.data) return failure("ENTRY_NOT_FOUND", 404);
    if (!canUndoOutreach(account.role, account.userId, event.data.created_by)) return failure("UNDO_NOT_ALLOWED", 403);
    if (!event.data.voided_at) {
      const updated = await db.from("crm_outreach_events").update({ voided_at: new Date().toISOString(), voided_by: account.userId }).eq("id", body.id).is("voided_at", null);
      if (updated.error) return failure("OUTREACH_SAVE_FAILED", 503);
    }
    return NextResponse.json({ undone: true }, { headers });
  } catch { return failure("OUTREACH_SAVE_FAILED", 503); }
}

