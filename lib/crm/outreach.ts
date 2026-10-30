export const outreachMethods = [{ value: "call", label: "Call" }, { value: "email", label: "Email" }, { value: "whatsapp", label: "WhatsApp" }, { value: "linkedin", label: "LinkedIn" }, { value: "other", label: "Other" }] as const;
export type OutreachMethod = typeof outreachMethods[number]["value"];
export type OutreachPeriod = "today" | "7d" | "30d" | "all";
export type OutreachLead = { id: string; business_name: string; email: string | null; phone: string | null; main_location: string | null; status: string; source: string | null; notes: string | null; next_action: string | null; next_action_at: string | null };
export type OutreachEntry = { id: string; leadId: string; kind: "outreach" | "meeting_booked" | "response_received" | "sequence_stopped"; method: OutreachMethod | null; notes: string; meetingAt: string | null; sequenceStep?: number | null };
export type OutreachHistory = { id: string; event_type: OutreachEntry["kind"]; method: OutreachMethod | null; notes: string; meeting_at: string | null; occurred_at: string; canUndo: boolean };
export type OutreachLeadStats = { leadId: string; attempts: number; meetingBooked: boolean; lastOutreachAt: string | null; bookingId: string | null; meetingAt: string | null; canUndoBooking: boolean; history: OutreachHistory[]; firstOutreachAt?: string | null; finalFollowUpAt?: string | null; firstMethod?: OutreachMethod | null; sequenceSteps?: number[]; sequenceStatus?: "response_received" | "sequence_stopped" | null };
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
  if (!["outreach", "meeting_booked", "response_received", "sequence_stopped"].includes(String(value.kind))) return null;
  const method = value.method ?? null;
  if (method !== null && !outreachMethods.some((item) => item.value === method)) return null;
  if (value.kind === "outreach" && method === null) return null;
  if (value.kind !== "outreach" && method !== null) return null;
  const sequenceStep = value.sequenceStep ?? null;
  if (sequenceStep !== null && (value.kind !== "outreach" || ![1, 3, 7].includes(sequenceStep as number))) return null;
  if (value.notes !== undefined && (typeof value.notes !== "string" || value.notes.length > 2000)) return null;
  let meetingAt: string | null = null;
  if (value.meetingAt !== undefined && value.meetingAt !== null && value.meetingAt !== "") {
    if (value.kind !== "meeting_booked" || typeof value.meetingAt !== "string") return null;
    const parsed = new Date(value.meetingAt);
    if (!Number.isFinite(parsed.valueOf())) return null;
    meetingAt = parsed.toISOString();
  }
  return { id: value.id, leadId: value.leadId, kind: value.kind as OutreachEntry["kind"], method: method as OutreachMethod | null, notes: typeof value.notes === "string" ? value.notes.trim() : "", meetingAt, sequenceStep: sequenceStep as number | null };
}

export function followUpSequence(record: OutreachLeadStats | undefined, leadStatus: string, now = new Date()) {
  if (record?.meetingBooked || ["Won", "Lost"].includes(leadStatus)) return { status: "stopped", label: record?.meetingBooked ? "Meeting booked · sequence stopped" : "Lead closed · sequence stopped", step: null, dueAt: null } as const;
  if (record?.sequenceStatus) return { status: "stopped", label: record.sequenceStatus === "response_received" ? "Response received · sequence stopped" : "Follow-ups stopped", step: null, dueAt: null } as const;
  if (!record?.firstOutreachAt) return { status: "not_started", label: "Starts after the first outreach is logged", step: null, dueAt: null } as const;
  const started = new Date(record.firstOutreachAt).valueOf();
  if (!Number.isFinite(started)) return { status: "not_started", label: "First outreach date unavailable", step: null, dueAt: null } as const;
  const finalSent = record.finalFollowUpAt ? Date.parse(record.finalFollowUpAt) : NaN;
  const ends = Number.isFinite(finalSent) ? finalSent + 7 * 86400000 : started + 14 * 86400000;
  if (now.valueOf() >= ends) return { status: "ended", label: "No response · sequence closed", step: null, dueAt: new Date(ends).toISOString() } as const;
  if (Number.isFinite(finalSent)) return { status: "waiting", label: "Final follow-up sent · wait 7 days, then leave it", step: null, dueAt: new Date(ends).toISOString() } as const;
  const step = [1, 3, 7].find(day => !record.sequenceSteps?.includes(day));
  if (!step) return { status: "waiting", label: "Final follow-up sent · wait until day 14, then leave it", step: null, dueAt: new Date(ends).toISOString() } as const;
  const dueAt = new Date(started + step * 86400000).toISOString();
  return { status: now.valueOf() >= Date.parse(dueAt) ? "due" : "scheduled", label: `Day ${step} follow-up`, step, dueAt } as const;
}

export function followUpDraft(business: string, step: number) {
  const opener = `Hi ${business} team,`;
  if (step === 1) return `${opener}\n\nJust following up on my message about website and marketing support for your business. Is this something you are currently looking into?\n\nHarley\nHBS Marketing`;
  if (step === 3) return `${opener}\n\nWould a short conversation about your website and how customers find you online be useful? If this is a priority, let me know a suitable time for a quick chat.\n\nHarley\nHBS Marketing`;
  return `${opener}\n\nOne final follow-up from me. If website or marketing support would be useful, I would be happy to arrange a quick chat. Otherwise I will leave it here.\n\nHarley\nHBS Marketing`;
}

