export const outreachMethods = [{ value: "call", label: "Call" }, { value: "email", label: "Email" }, { value: "whatsapp", label: "WhatsApp" }, { value: "linkedin", label: "LinkedIn" }, { value: "other", label: "Other" }] as const;
export type OutreachMethod = typeof outreachMethods[number]["value"];
export type OutreachPeriod = "today" | "7d" | "30d" | "all";
export type OutreachLead = { id: string; business_name: string; email: string | null; phone: string | null; main_location: string | null; status: string; source: string | null; notes: string | null; next_action: string | null; next_action_at: string | null };
export type OutreachEntry = { id: string; leadId: string; kind: "outreach" | "meeting_booked"; method: OutreachMethod | null; notes: string; meetingAt: string | null };
export type OutreachHistory = { id: string; event_type: OutreachEntry["kind"]; method: OutreachMethod | null; notes: string; meeting_at: string | null; occurred_at: string; canUndo: boolean };
export type OutreachLeadStats = { leadId: string; attempts: number; meetingBooked: boolean; lastOutreachAt: string | null; bookingId: string | null; meetingAt: string | null; canUndoBooking: boolean; history: OutreachHistory[] };
export type OutreachDashboard = { totals: { outreaches: number; contactedLeads: number; meetingsBooked: number }; byMethod: Record<OutreachMethod, number>; leadStats: OutreachLeadStats[] };
export const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export const canEditOutreach = (role: string) => ["owner", "admin", "editor"].includes(role);
export const canUndoOutreach = (role: string, userId: string, createdBy: string | null) => ["owner", "admin"].includes(role) || (role === "editor" && userId === createdBy);

// Interpret reporting days in the business's timezone, including BST changes.
export function outreachSince(period: OutreachPeriod, now = new Date()): string | null {
  if (period === "all") return null;
  const parts = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/London", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(now);
  const get = (type: string) => Number(parts.find((part) => part.type === type)?.value);
  const target = new Date(Date.UTC(get("year"), get("month") - 1, get("day") - (period === "7d" ? 6 : period === "30d" ? 29 : 0)));
  const londonHour = Number(new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/London", hour: "2-digit", hourCycle: "h23" }).format(target));
  return new Date(target.valueOf() - londonHour * 3600000).toISOString();
}

export function parseOutreachEntry(body: unknown): OutreachEntry | null {
  if (!body || typeof body !== "object" || Array.isArray(body)) return null;
  const value = body as Record<string, unknown>;
  if (typeof value.id !== "string" || !uuidPattern.test(value.id) || typeof value.leadId !== "string" || !uuidPattern.test(value.leadId)) return null;
  if (value.kind !== "outreach" && value.kind !== "meeting_booked") return null;
  const method = value.method ?? null;
  if (method !== null && !outreachMethods.some((item) => item.value === method)) return null;
  if (value.kind === "outreach" && method === null) return null;
  if (value.notes !== undefined && (typeof value.notes !== "string" || value.notes.length > 2000)) return null;
  let meetingAt: string | null = null;
  if (value.meetingAt !== undefined && value.meetingAt !== null && value.meetingAt !== "") {
    if (value.kind !== "meeting_booked" || typeof value.meetingAt !== "string") return null;
    const parsed = new Date(value.meetingAt);
    if (!Number.isFinite(parsed.valueOf())) return null;
    meetingAt = parsed.toISOString();
  }
  return { id: value.id, leadId: value.leadId, kind: value.kind, method: method as OutreachMethod | null, notes: typeof value.notes === "string" ? value.notes.trim() : "", meetingAt };
}
