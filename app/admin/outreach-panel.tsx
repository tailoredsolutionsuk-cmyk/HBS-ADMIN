"use client";

import { useEffect, useState } from "react";
import { Icon } from "./admin-ui";
import type { Lead } from "./metrics-panel";

const stages = ["New", "Contacted", "Qualified", "Proposal", "Won", "Lost"];
const dateFormat = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/London", day: "numeric", month: "short", year: "numeric" });
const dayFormat = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/London", year: "numeric", month: "2-digit", day: "2-digit" });
function dayKey(date: Date) {
  const parts = dayFormat.formatToParts(date);
  return ["year", "month", "day"].map((name) => parts.find((part) => part.type === name)?.value).join("-");
}
function followUp(lead: Lead, today: string) {
  if (["Won", "Lost"].includes(lead.status)) return "closed";
  const due = lead.next_action_at ? new Date(lead.next_action_at) : null;
  if (!due || !Number.isFinite(due.valueOf())) return "none";
  const day = dayKey(due);
  return day < today ? "overdue" : day === today ? "today" : "upcoming";
}
const detail = (notes: string | null | undefined, label: string) => notes?.split("\n").find((line) => line.startsWith(`${label}:`))?.slice(label.length + 1).trim() || "Not listed";

export default function OutreachPanel({ onOpenPipeline, onOpenIntegrations }: { onOpenPipeline: () => void; onOpenIntegrations: () => void }) {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [reload, setReload] = useState(0);
  const [query, setQuery] = useState("");
  const [stage, setStage] = useState("all");
  const [dueFilter, setDueFilter] = useState("all");

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError("");
    fetch("/api/admin/crm", { cache: "no-store", signal: controller.signal }).then(async (response) => {
      if (!response.ok) throw new Error(response.status === 401 || response.status === 403 ? "Please sign in with an admin account to view outreach leads." : "Outreach leads could not be loaded. Please try again.");
      const data = await response.json();
      if (!Array.isArray(data.leads)) throw new Error("Outreach leads could not be loaded. Please try again.");
      if (!controller.signal.aborted) setLeads(data.leads.filter((lead: Lead) => lead.source === "Google Sheets: Leads For Outreach"));
    }).catch((cause: unknown) => {
      if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : "Outreach leads could not be loaded.");
    }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [reload]);

  const today = dayKey(new Date());
  const count = (name: string) => leads.filter((lead) => lead.status === name).length;
  const counts = [{ name: "New", count: count("New") }, { name: "In progress", count: count("Contacted") + count("Qualified") + count("Proposal") }, { name: "Won", count: count("Won") }, { name: "Lost", count: count("Lost") }];
  const term = query.trim().toLocaleLowerCase("en-GB");
  const filtered = leads.filter((lead) => {
    const due = followUp(lead, today);
    return (!term || [lead.business_name, lead.phone, lead.main_location, lead.notes, lead.next_action].some((value) => value?.toLocaleLowerCase("en-GB").includes(term)))
      && (stage === "all" || lead.status === stage)
      && (dueFilter === "all" || dueFilter === due || (dueFilter === "due" && ["overdue", "today"].includes(due)));
  }).sort((a, b) => {
    const rank = (lead: Lead) => ["Won", "Lost"].includes(lead.status) ? Infinity : Number.isFinite(Date.parse(lead.next_action_at || "")) ? Date.parse(lead.next_action_at!) : Infinity;
    return (rank(a) - rank(b) || a.business_name.localeCompare(b.business_name));
  });

  return <div className="admin-outreach-page">
    <section className="admin-welcome"><div><span className="admin-section-kicker">HBS sales workspace</span><h2>Outreach &amp; Follow-up</h2><p>Review spreadsheet leads, track outreach stages and see who needs a follow-up.</p></div><button className="admin-outline-button" type="button" onClick={onOpenPipeline}>Manage in Pipeline <Icon name="arrow-up-right" size={14} /></button></section>
    <section className="admin-panel admin-spreadsheet-dashboard" aria-label="Spreadsheet outreach dashboard" aria-busy={loading}>
      <div className="admin-panel-heading"><div><span className="admin-section-kicker">Spreadsheet prospects</span><h3>Leads For Outreach</h3><p>Imported spreadsheet details with outreach updates managed in the CRM.</p></div><button className="admin-outline-button" type="button" disabled={loading} onClick={() => setReload((value) => value + 1)}>{loading ? "Loading…" : "Refresh"}</button></div>
      {error ? <div className="admin-lead-alert error" role="alert">{error}</div> : null}
      {loading ? <div className="admin-crm-loading" role="status">Loading outreach leads…</div> : !error ? <>
        <div className="admin-spreadsheet-stats"><article><small>Imported leads</small><strong>{leads.length}</strong></article>{counts.map((item) => <article key={item.name}><small>{item.name}</small><strong>{item.count}</strong></article>)}</div>
        {leads.length ? <>
          <div className="admin-outreach-priorities" aria-label="Follow-up priorities">{[{ label: "Overdue", value: "overdue" }, { label: "Due today", value: "today" }, { label: "Upcoming", value: "upcoming" }].map((item) => <button key={item.value} type="button" className={item.value} aria-pressed={dueFilter === item.value} onClick={() => setDueFilter((current) => current === item.value ? "all" : item.value)}><strong>{leads.filter((lead) => followUp(lead, today) === item.value).length}</strong> {item.label}</button>)}</div>
          <div className="admin-spreadsheet-toolbar admin-outreach-toolbar"><label className="admin-search"><Icon name="search" size={15} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search business, phone, location or service" aria-label="Search outreach leads" /></label><label className="admin-outreach-filter-label">Outreach stage<select value={stage} onChange={(event) => setStage(event.target.value)} aria-label="Filter outreach stage"><option value="all">All stages</option>{stages.map((item) => <option key={item}>{item}</option>)}</select></label><label className="admin-outreach-filter-label">Follow-up<select value={dueFilter} onChange={(event) => setDueFilter(event.target.value)} aria-label="Filter follow-up date"><option value="all">All follow-ups</option><option value="due">Due or overdue</option><option value="overdue">Overdue</option><option value="today">Due today</option><option value="upcoming">Upcoming</option><option value="none">No date set</option></select></label></div>
          <div className="admin-filter-feedback" role="status"><span>{filtered.length} of {leads.length} leads shown</span>{query || stage !== "all" || dueFilter !== "all" ? <button className="admin-text-button" type="button" onClick={() => { setQuery(""); setStage("all"); setDueFilter("all"); }}>Clear filters</button> : null}</div>
          <div className="admin-spreadsheet-list admin-outreach-list" role="list" aria-label="Outreach leads">{filtered.length ? filtered.map((lead) => {
            const due = followUp(lead, today);
            return <article className="admin-spreadsheet-row admin-outreach-row" key={lead.id} role="listitem">
              <div className="admin-spreadsheet-business"><strong>{lead.business_name}</strong><small>{lead.main_location || "Location not listed"}</small>{lead.phone ? <a className="admin-outreach-phone" href={`tel:${lead.phone.replace(/[^+0-9]/g, "")}`}>{lead.phone}</a> : <small>No phone listed</small>}</div>
              <div className={`admin-outreach-follow-up ${due}`}><strong>{due === "closed" ? "Opportunity closed" : due === "none" ? "No follow-up scheduled" : `${due === "overdue" ? "Overdue" : due === "today" ? "Due today" : "Upcoming"} · ${dateFormat.format(new Date(lead.next_action_at!))}`}</strong><span>{lead.next_action || "Set a next action in Pipeline."}</span></div>
              <div className="admin-spreadsheet-stage"><span className={`admin-lead-stage ${lead.status.toLowerCase()}`}>{lead.status}</span></div>
              <details className="admin-outreach-business-details"><summary>Business details</summary><div className="admin-spreadsheet-service"><small>Services</small><span>{detail(lead.notes, "Services listed")}</span><small>Customer reviews</small><span>{detail(lead.notes, "Customer reviews listed")}</span></div></details>
            </article>;
          }) : <div className="admin-empty-state compact"><strong>No leads match these filters</strong><p>Try a different search, outreach stage or follow-up date.</p></div>}</div>
          <p className="admin-spreadsheet-footnote">{filtered.length} of {leads.length} spreadsheet leads. Update stages, notes and follow-up dates in Pipeline. Dates use UK time.</p>
        </> : <div className="admin-empty-state compact"><strong>No spreadsheet leads in the CRM yet</strong><p>Connect and sync “Leads For Outreach” from Integrations to see prospects here.</p><button type="button" className="admin-outline-button" onClick={onOpenIntegrations}>Open Integrations</button></div>}
      </> : null}
    </section>
  </div>;
}
