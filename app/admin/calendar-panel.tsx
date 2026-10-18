"use client";

import { useEffect, useMemo, useState } from "react";
import { Icon } from "./admin-ui";

type Task = { id: string; client_id: string | null; title: string; done: boolean; due_date: string | null };
type Client = { id: string; business_name: string };
type Event = { id: string; title: string; allDay: boolean; start: string; end: string };
type CalendarResponse = { configured?: boolean; connected?: boolean; reconnectRequired?: boolean; email?: string; events?: Event[]; error?: string };

const dateKey = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
const shiftDays = (date: Date, days: number) => new Date(date.getFullYear(), date.getMonth(), date.getDate() + days);

export default function CalendarPanel({ tasks, clients, onOpenTasks }: { tasks: Task[]; clients: Client[]; onOpenTasks: () => void }) {
  const [month, setMonth] = useState(() => new Date(new Date().getFullYear(), new Date().getMonth(), 1));
  const [calendar, setCalendar] = useState<CalendarResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [disconnecting, setDisconnecting] = useState(false);
  const [outlookStatus, setOutlookStatus] = useState<string | null>(null);
  const today = dateKey(new Date());
  const first = shiftDays(month, -month.getDay());
  const days = useMemo(() => Array.from({ length: 42 }, (_, index) => shiftDays(first, index)), [first.getTime()]);
  const end = shiftDays(first, 42);

  useEffect(() => {
    setOutlookStatus(new URLSearchParams(window.location.search).get("outlook"));
  }, []);

  useEffect(() => {
    let active = true;
    setLoading(true);
    fetch(`/api/admin/calendar?start=${dateKey(first)}&end=${dateKey(end)}`, { cache: "no-store" })
      .then(async (response) => {
        const data = await response.json() as CalendarResponse;
        if (!response.ok) throw new Error(data.error || "Calendar could not be loaded.");
        if (active) setCalendar(data);
      })
      .catch((error) => { if (active) setCalendar({ error: error.message }); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [month]);

  const clientNames = new Map(clients.map((client) => [client.id, client.business_name]));
  const work = tasks.filter((task) => !task.done && task.due_date);
  const eventByDay = new Map<string, Event[]>();
  for (const event of calendar?.events || []) {
    const key = event.start.slice(0, 10);
    if (!key) continue;
    eventByDay.set(key, [...(eventByDay.get(key) || []), event]);
  }

  async function disconnect() {
    if (!window.confirm("Disconnect your Outlook calendar from this CRM? Your Outlook events will no longer appear here.")) return;
    setDisconnecting(true);
    try {
      const response = await fetch("/api/admin/calendar", { method: "DELETE" });
      if (!response.ok) throw new Error("Could not disconnect Outlook.");
      setCalendar({ configured: true, connected: false, events: [] });
    } catch (error) { setCalendar((current) => ({ ...current, error: error instanceof Error ? error.message : "Disconnect failed." })); }
    finally { setDisconnecting(false); }
  }

  return <div className="admin-calendar-page">
    <section className="admin-welcome"><div><span className="admin-kicker">Your schedule</span><h2>Calendar</h2><p>See client tasks alongside your Outlook appointments. Outlook events are visible only to the CRM owner.</p></div></section>
    <section className="admin-panel admin-calendar-connection" aria-live="polite">
      <div><span className="admin-section-kicker">Microsoft Outlook</span><h3>{calendar?.reconnectRequired ? "Reconnect your calendar" : calendar?.connected ? "Calendar connected" : "Connect your calendar"}</h3><p>{calendar?.connected && !calendar.reconnectRequired ? `Showing appointments from ${calendar.email}. This is a read-only connection.` : "Connect your Microsoft account to see appointments here. No calendar changes will be made."}</p></div>
      {loading ? <span>Checking connection…</span> : calendar?.connected && !calendar.reconnectRequired ? <button className="admin-outline-button" onClick={disconnect} disabled={disconnecting}>{disconnecting ? "Disconnecting…" : "Disconnect Outlook"}</button> : calendar?.configured ? <a className="admin-primary-button" href="/api/admin/calendar/connect">{calendar?.reconnectRequired ? "Reconnect Outlook" : "Connect Outlook"}</a> : null}
    </section>
    {outlookStatus && outlookStatus !== "connected" ? <p className="admin-calendar-alert" role="alert">Outlook sign-in did not complete ({outlookStatus.replaceAll("_", " ")}). Please try again or check the calendar setup.</p> : null}
    {calendar?.error ? <p className="admin-calendar-alert" role="alert">{calendar.error === "OWNER_ACCESS_REQUIRED" ? "Only the workspace owner can view their Outlook calendar." : calendar.error === "OUTLOOK_STORAGE_UNAVAILABLE" ? "Calendar storage is not ready. Ask the administrator to apply the Outlook database setup." : calendar.error}</p> : null}
    {!loading && calendar?.configured === false ? <p className="admin-calendar-alert">Outlook is not configured yet. Add the Microsoft app credentials in the HBS Admin Vercel project to enable connection.</p> : null}
    <section className="admin-panel admin-calendar-card">
      <header className="admin-calendar-toolbar"><div><span className="admin-section-kicker">Schedule</span><h3>{new Intl.DateTimeFormat("en-GB", { month: "long", year: "numeric" }).format(month)}</h3></div><div><button className="admin-outline-button" onClick={() => setMonth(new Date(new Date().getFullYear(), new Date().getMonth(), 1))}>Today</button><button className="admin-outline-button" aria-label="Previous month" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))}><Icon name="chevron-left" size={16} /></button><button className="admin-outline-button" aria-label="Next month" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))}><span style={{ transform: "rotate(180deg)", display: "inline-flex" }}><Icon name="chevron-left" size={16} /></span></button></div></header>
      <div className="admin-calendar-scroll"><div className="admin-calendar-grid" role="grid" aria-label="Monthly calendar">
        {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((name) => <span className="admin-calendar-weekday" key={name}>{name}</span>)}
        {days.map((day) => {
          const key = dateKey(day);
          const due = work.filter((task) => task.due_date === key);
          const appointments = eventByDay.get(key) || [];
          return <div className={`admin-calendar-day ${day.getMonth() === month.getMonth() ? "" : "outside"} ${key === today ? "today" : ""}`} role="gridcell" aria-label={new Intl.DateTimeFormat("en-GB", { dateStyle: "full" }).format(day)} key={key}>
            <time dateTime={key}>{day.getDate()}</time>
            {appointments.slice(0, 3).map((event) => <div className="admin-calendar-event outlook" title={`${event.allDay ? "All day" : event.start.slice(11, 16)} · ${event.title}`} key={event.id}><small>{event.allDay ? "All day" : event.start.slice(11, 16)}</small> {event.title}</div>)}
            {due.slice(0, 3).map((task) => <button className="admin-calendar-event task" title={`${clientNames.get(task.client_id || "") || "General"} · ${task.title}`} onClick={onOpenTasks} key={task.id}><small>Task</small> {task.title}</button>)}
            {appointments.length + due.length > 6 ? <small className="admin-calendar-more">+{appointments.length + due.length - 6} more</small> : null}
          </div>;
        })}
      </div></div>
      <footer className="admin-calendar-legend"><span><i className="outlook" />Outlook appointments</span><span><i className="task" />Client tasks</span><button className="admin-text-button" onClick={onOpenTasks}>Manage tasks</button></footer>
    </section>
  </div>;
}
