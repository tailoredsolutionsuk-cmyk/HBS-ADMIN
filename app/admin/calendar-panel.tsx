"use client";

import { useEffect, useMemo, useState } from "react";
import { Icon } from "./admin-ui";
import { eventDays, type CalendarEvent } from "../../lib/calendar/calendar-events";

type Task = { id: string; client_id: string | null; title: string; done: boolean; due_date: string | null };
type Client = { id: string; business_name: string };
type CalendarResponse = { configured?: boolean; connected?: boolean; reconnectRequired?: boolean; email?: string; accountEmail?: string; events?: CalendarEvent[]; error?: string; truncated?: boolean; syncedAt?: string };

const dateKey = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
const shiftDays = (date: Date, days: number) => new Date(date.getFullYear(), date.getMonth(), date.getDate() + days);

export default function CalendarPanel({ tasks, clients, onOpenTasks }: { tasks: Task[]; clients: Client[]; onOpenTasks: () => void }) {
  const [month, setMonth] = useState(() => new Date(new Date().getFullYear(), new Date().getMonth(), 1));
  const [calendar, setCalendar] = useState<CalendarResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [disconnecting, setDisconnecting] = useState(false);
  const [googleStatus, setGoogleStatus] = useState<string | null>(null);
  const [revision, setRevision] = useState(0);
  const today = dateKey(new Date());
  const first = useMemo(() => shiftDays(month, -((month.getDay() + 6) % 7)), [month]);
  const days = useMemo(() => Array.from({ length: 42 }, (_, index) => shiftDays(first, index)), [first]);
  const startKey = dateKey(first);
  const endKey = dateKey(shiftDays(first, 42));
  const timeFormat = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/London", hour: "2-digit", minute: "2-digit" });

  useEffect(() => {
    setGoogleStatus(new URLSearchParams(window.location.search).get("google_calendar"));
  }, []);

  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    setLoading(true);
    fetch(`/api/admin/calendar/google?start=${startKey}&end=${endKey}`, { cache: "no-store", signal: controller.signal })
      .then(async (response) => {
        const data = await response.json() as CalendarResponse;
        if (!response.ok) throw new Error(data.error || "Calendar could not be loaded.");
        if (active) setCalendar(data);
      })
      .catch((error) => { if (active) setCalendar({ error: error.message }); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; controller.abort(); };
  }, [startKey, endKey, revision]);

  const clientNames = new Map(clients.map((client) => [client.id, client.business_name]));
  const work = tasks.filter((task) => !task.done && task.due_date);
  const eventByDay = new Map<string, CalendarEvent[]>();
  const dayKeys = days.map(dateKey);
  for (const event of calendar?.events || []) {
    for (const key of eventDays(event, dayKeys)) eventByDay.set(key, [...(eventByDay.get(key) || []), event]);
  }

  async function disconnect() {
    if (!window.confirm("Disconnect Google Calendar from this CRM? This removes the CRM connection. Your Google events are kept.")) return;
    setDisconnecting(true);
    try {
      const response = await fetch("/api/admin/calendar/google", { method: "DELETE" });
      if (!response.ok) throw new Error("Could not disconnect Google Calendar.");
      setCalendar({ configured: true, connected: false, events: [] });
      setGoogleStatus(null);
    } catch (error) { setCalendar((current) => ({ ...current, error: error instanceof Error ? error.message : "Disconnect failed." })); }
    finally { setDisconnecting(false); }
  }

  return <div className="admin-calendar-page">
    <section className="admin-welcome"><div><span className="admin-kicker">Your schedule</span><h2>Calendar</h2><p>Your Google Calendar appointments and client deadlines in one place. Appointments are visible only to the workspace owner.</p></div></section>
    <section className="admin-panel admin-calendar-connection" aria-live="polite">
      <div><span className="admin-section-kicker">Google Calendar</span><h3>{calendar?.reconnectRequired ? "Reconnect your calendar" : calendar?.connected ? "Calendar connected" : "Connect your calendar"}</h3><p>{calendar?.connected && !calendar.reconnectRequired ? `Showing the primary calendar for ${calendar.email}. Read-only access.` : `Connect ${calendar?.accountEmail || "tailoredsolutionsuk@gmail.com"} to see your appointments here.`}</p></div>
      {loading ? <span role="status">Loading calendar…</span> : calendar?.connected && !calendar.reconnectRequired ? <button className="admin-outline-button" onClick={disconnect} disabled={disconnecting}>{disconnecting ? "Disconnecting…" : "Disconnect Google Calendar"}</button> : calendar?.configured ? <a className="admin-primary-button" href="/api/admin/calendar/google/connect">{calendar?.reconnectRequired ? "Reconnect Google Calendar" : "Connect Google Calendar"}</a> : null}
    </section>
    {googleStatus && googleStatus !== "connected" ? <p className="admin-calendar-alert" role="alert">{googleStatus === "wrong_account" ? "Choose tailoredsolutionsuk@gmail.com when connecting your calendar." : googleStatus === "permission_required" ? "Calendar access was not approved. Reconnect and select read-only access to your events." : googleStatus === "invalid" ? "The connection request expired. Click Connect Google Calendar to try again." : "Google sign-in did not complete. Please try connecting again."}</p> : null}
    {calendar?.error ? <p className="admin-calendar-alert" role="alert">{calendar.error === "OWNER_ACCESS_REQUIRED" ? "Only the workspace owner can view Google Calendar appointments." : calendar.error === "GOOGLE_CALENDAR_STORAGE_UNAVAILABLE" ? "Calendar connection storage needs administrator setup." : calendar.error}</p> : null}
    {!loading && calendar?.configured === false ? <p className="admin-calendar-alert">Google Calendar setup is pending. Client tasks are still available below.</p> : null}
    {calendar?.truncated ? <p className="admin-calendar-alert" role="status">This is a busy month. Some appointments are not shown. Open Google Calendar for your full schedule.</p> : null}
    {!loading && calendar?.connected && !calendar.error && calendar.events?.length === 0 ? <p role="status">No Google appointments in this date range. Dated client tasks still appear below.</p> : null}
    <section className="admin-panel admin-calendar-card">
      <header className="admin-calendar-toolbar"><div><span className="admin-section-kicker">Schedule · UK time</span><h3>{new Intl.DateTimeFormat("en-GB", { month: "long", year: "numeric" }).format(month)}</h3></div><div><button className="admin-outline-button" onClick={() => setRevision((value) => value + 1)} disabled={loading}>Refresh</button><button className="admin-outline-button" onClick={() => setMonth(new Date(new Date().getFullYear(), new Date().getMonth(), 1))}>Today</button><button className="admin-outline-button" aria-label="Previous month" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))}><Icon name="chevron-left" size={16} /></button><button className="admin-outline-button" aria-label="Next month" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))}><span style={{ transform: "rotate(180deg)", display: "inline-flex" }}><Icon name="chevron-left" size={16} /></span></button></div></header>
      <div className="admin-calendar-scroll"><div className="admin-calendar-grid" role="grid" aria-label="Monthly calendar">
        {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((name) => <span className="admin-calendar-weekday" key={name}>{name}</span>)}
        {days.map((day) => {
          const key = dateKey(day);
          const due = work.filter((task) => task.due_date === key);
          const appointments = eventByDay.get(key) || [];
          return <div className={`admin-calendar-day ${day.getMonth() === month.getMonth() ? "" : "outside"} ${key === today ? "today" : ""}`} role="gridcell" aria-label={new Intl.DateTimeFormat("en-GB", { dateStyle: "full" }).format(day)} key={key}>
            <time dateTime={key}>{day.getDate()}</time>
            {appointments.slice(0, 3).map((event) => <div className="admin-calendar-event outlook" title={`${event.allDay ? "All day" : timeFormat.format(new Date(event.start))} · ${event.title}`} key={event.id}><small>{event.allDay ? "All day" : timeFormat.format(new Date(event.start))}</small> {event.url ? <a href={event.url} target="_blank" rel="noreferrer">{event.title}</a> : event.title}</div>)}
            {appointments.length > 3 ? <details><summary>+{appointments.length - 3} more appointments</summary>{appointments.slice(3).map((event) => <p key={event.id}>{event.allDay ? "All day" : timeFormat.format(new Date(event.start))} · {event.url ? <a href={event.url} target="_blank" rel="noreferrer">{event.title}</a> : event.title}</p>)}</details> : null}
            {due.slice(0, 3).map((task) => <button className="admin-calendar-event task" title={`${clientNames.get(task.client_id || "") || "General"} · ${task.title}`} onClick={onOpenTasks} key={task.id}><small>Task</small> {task.title}</button>)}
            {due.length > 3 ? <button className="admin-text-button" onClick={onOpenTasks}>+{due.length - 3} more tasks</button> : null}
          </div>;
        })}
      </div></div>
      <footer className="admin-calendar-legend"><span><i className="outlook" />Google appointments</span><span><i className="task" />Client tasks</span><button className="admin-text-button" onClick={onOpenTasks}>Manage tasks</button><a href="https://calendar.google.com/" target="_blank" rel="noreferrer">Open Google Calendar</a>{calendar?.syncedAt ? <small>Updated {timeFormat.format(new Date(calendar.syncedAt))}</small> : null}</footer>
    </section>
  </div>;
}
