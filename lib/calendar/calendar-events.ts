export type GoogleEvent = { id?: string; status?: string; summary?: string; start?: { date?: string; dateTime?: string }; end?: { date?: string; dateTime?: string }; htmlLink?: string };
export type CalendarEvent = { id: string; title: string; allDay: boolean; start: string; end: string; url?: string };

export function calendarEvent(event: GoogleEvent): CalendarEvent | null {
  if (!event.id || event.status === "cancelled") return null;
  const start = event.start?.date || event.start?.dateTime;
  const end = event.end?.date || event.end?.dateTime;
  if (!start || !end || Number.isNaN(Date.parse(start)) || Number.isNaN(Date.parse(end))) return null;
  let url: string | undefined;
  try { const parsed = new URL(event.htmlLink || ""); if (parsed.protocol === "https:" && ["calendar.google.com", "www.google.com"].includes(parsed.hostname)) url = parsed.href; } catch { /* Optional link. */ }
  return { id: event.id, title: event.summary || "Busy", allDay: Boolean(event.start?.date), start, end, url };
}

export function eventDays(event: CalendarEvent, days: string[]) {
  if (event.allDay) return days.filter((day) => day >= event.start && day < event.end);
  const format = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/London", year: "numeric", month: "2-digit", day: "2-digit" });
  const first = format.format(new Date(event.start));
  const last = format.format(new Date(Math.max(Date.parse(event.start), Date.parse(event.end) - 1)));
  return days.filter((day) => day >= first && day <= last);
}
