import { followUpSequence, type OutreachLead, type OutreachLeadStats } from "./outreach.ts";

export const outreachViews = [
  { value: "all", label: "All leads" },
  { value: "new", label: "Not contacted" },
  { value: "due", label: "Follow-ups due" },
  { value: "waiting", label: "Awaiting reply" },
  { value: "replied", label: "Replied" },
  { value: "booked", label: "Meeting booked" },
  { value: "closed", label: "Closed" },
] as const;
export type OutreachView = typeof outreachViews[number]["value"];

export const leadDisplayName = (name: string) => name.replace(/\s*Click to open side panel for more information\s*$/i, "").trim() || name;

export function outreachBucket(lead: OutreachLead, record: OutreachLeadStats | undefined, now: Date): Exclude<OutreachView, "all"> {
  if (record?.meetingBooked) return "booked";
  if (record?.sequenceStatus === "response_received") return "replied";
  const sequence = followUpSequence(record, lead.status, now);
  if (["stopped", "ended"].includes(sequence.status)) return "closed";
  if (sequence.status === "due") return "due";
  return record?.attempts ? "waiting" : "new";
}

// UK national numbers and explicit international numbers only; never guess a country.
export function whatsAppLink(phone: string | null, message = ""): string | null {
  if (!phone || !/^\+?[\d\s().-]+$/.test(phone.trim())) return null;
  const raw = phone.trim();
  let digits = raw.replace(/\D/g, "");
  if (raw.startsWith("+")) digits = digits.replace(/^440/, "44");
  else if (raw.startsWith("00")) digits = digits.slice(2).replace(/^440/, "44");
  else if (/^0[1-9]\d{9}$/.test(digits)) digits = "44" + digits.slice(1);
  else return null;
  if (!/^[1-9]\d{7,14}$/.test(digits)) return null;
  return `https://wa.me/${digits}${message ? `?text=${encodeURIComponent(message)}` : ""}`;
}

