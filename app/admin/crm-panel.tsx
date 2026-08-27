"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";

type Client = { id: string; business_name: string; email: string | null; phone: string | null; domain: string | null; industry: string | null; status: string | null };
type Lead = { id: string; business_name: string; contact_name: string | null; name: string; email: string; phone: string; status: string; source: string; estimated_value: number | null; help_needed: string };
type Task = { id: string; client_id: string | null; title: string; notes: string | null; done: boolean; due_date: string | null };
type Activity = { id: string; entity_type: string; entity_id: string; action: string; detail: string | null; created_at: string };
type CrmData = { clients: Client[]; leads: Lead[]; tasks: Task[]; activities: Activity[]; permissions: { canEdit: boolean }; metrics: { clients: number; openLeads: number; pipelineValue: number; tasksDue: number } };

const stages = ["New", "Contacted", "Qualified", "Proposal", "Won", "Lost"];
const money = (value: number) => new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP", maximumFractionDigits: 0 }).format(value);
const when = (value: string) => new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }).format(new Date(value));

export default function CrmPanel({ mode }: { mode: "Pipeline" | "Clients" | "Tasks" | "Activity" }) {
  const [data, setData] = useState<CrmData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [formOpen, setFormOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  async function load() {
    setError("");
    const response = await fetch("/api/admin/crm", { cache: "no-store" });
    if (!response.ok) throw new Error("The CRM could not be loaded.");
    setData(await response.json());
  }

  useEffect(() => { load().catch((issue) => setError(issue instanceof Error ? issue.message : "CRM unavailable.")).finally(() => setLoading(false)); }, []);

  async function createRecord(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError("");
    const form = new FormData(event.currentTarget);
    const body = mode === "Pipeline"
      ? { entity: "lead", businessName: form.get("businessName"), contactName: form.get("contactName"), email: form.get("email"), phone: form.get("phone"), estimatedValue: form.get("estimatedValue"), helpNeeded: form.get("helpNeeded") }
      : mode === "Clients"
        ? { entity: "client", businessName: form.get("businessName"), email: form.get("email"), phone: form.get("phone") }
        : { entity: "task", title: form.get("title"), clientId: form.get("clientId"), dueDate: form.get("dueDate"), notes: form.get("notes") };
    try {
      const response = await fetch("/api/admin/crm", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      if (!response.ok) throw new Error("The record could not be saved.");
      setFormOpen(false);
      await load();
    } catch (issue) { setError(issue instanceof Error ? issue.message : "Save failed."); }
    finally { setSaving(false); }
  }

  async function update(entity: string, id: string, updates: Record<string, unknown>) {
    setError("");
    const response = await fetch("/api/admin/crm", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ entity, id, ...updates }) });
    if (!response.ok) return setError("The update could not be saved.");
    await load();
  }

  const filteredClients = useMemo(() => (data?.clients ?? []).filter((client) => `${client.business_name} ${client.email || ""} ${client.domain || ""}`.toLowerCase().includes(query.toLowerCase())), [data, query]);
  if (loading) return <section className="admin-panel admin-crm-loading">Loading CRM…</section>;

  return <div className="admin-crm">
    <section className="admin-welcome admin-crm-heading"><div><span className="admin-kicker">HBS business operations</span><h2>{mode}</h2><p>{mode === "Pipeline" ? "Manage every sales opportunity from first contact to signed client." : mode === "Clients" ? "Keep client contact details and account status in one place." : mode === "Tasks" ? "Track the work that keeps projects and sales moving." : "A clear record of changes made across the CRM."}</p></div>{mode !== "Activity" && data?.permissions.canEdit && <button className="admin-primary-button" onClick={() => setFormOpen((open) => !open)}>+ New {mode === "Pipeline" ? "lead" : mode === "Clients" ? "client" : "task"}</button>}</section>
    {error && <p className="admin-crm-error" role="alert">{error}</p>}
    <section className="admin-stats admin-crm-stats"><article className="admin-stat-card"><span className="admin-stat-label">Clients</span><strong>{data?.metrics.clients ?? 0}</strong><small>Active records</small></article><article className="admin-stat-card"><span className="admin-stat-label">Open leads</span><strong>{data?.metrics.openLeads ?? 0}</strong><small>In the pipeline</small></article><article className="admin-stat-card"><span className="admin-stat-label">Pipeline value</span><strong>{money(data?.metrics.pipelineValue ?? 0)}</strong><small>Estimated revenue</small></article><article className="admin-stat-card"><span className="admin-stat-label">Tasks due</span><strong>{data?.metrics.tasksDue ?? 0}</strong><small>Still outstanding</small></article></section>

    {formOpen && <form className="admin-panel admin-crm-form" onSubmit={createRecord}><div className="admin-panel-heading"><div><span className="admin-section-kicker">Create record</span><h3>New {mode === "Pipeline" ? "lead" : mode === "Clients" ? "client" : "task"}</h3></div><button type="button" className="admin-text-button" onClick={() => setFormOpen(false)}>Close</button></div>{mode === "Tasks" ? <><label>Task title<input name="title" required /></label><label>Client<select name="clientId"><option value="">General task</option>{data?.clients.map((client) => <option key={client.id} value={client.id}>{client.business_name}</option>)}</select></label><label>Due date<input type="date" name="dueDate" /></label><label className="wide">Notes<textarea name="notes" rows={3} /></label></> : <><label>Business name<input name="businessName" required /></label>{mode === "Pipeline" && <label>Contact name<input name="contactName" /></label>}<label>Email<input type="email" name="email" /></label><label>Phone<input name="phone" /></label>{mode === "Pipeline" && <><label>Estimated value (£)<input type="number" min="0" step="1" name="estimatedValue" /></label><label className="wide">What do they need?<textarea name="helpNeeded" rows={3} /></label></>}</>}<button className="admin-primary-button" disabled={saving}>{saving ? "Saving…" : "Save record"}</button></form>}

    {mode === "Pipeline" && <section className="admin-pipeline">{stages.map((stage) => <div className="admin-pipeline-column" key={stage}><header><span>{stage}</span><b>{data?.leads.filter((lead) => lead.status.toLowerCase() === stage.toLowerCase()).length ?? 0}</b></header>{data?.leads.filter((lead) => lead.status.toLowerCase() === stage.toLowerCase()).map((lead) => <article className="admin-lead-card" key={lead.id}><span className="admin-section-kicker">{lead.source || "Direct"}</span><h3>{lead.business_name}</h3><p>{lead.contact_name || lead.name}</p><strong>{money(Number(lead.estimated_value || 0))}</strong><small>{lead.help_needed || "No requirement added"}</small>{data.permissions.canEdit && <select aria-label={`Stage for ${lead.business_name}`} value={lead.status} onChange={(event) => update("lead", lead.id, { status: event.target.value })}>{stages.map((item) => <option key={item}>{item}</option>)}</select>}</article>)}</div>)}</section>}

    {mode === "Clients" && <section className="admin-panel"><div className="admin-search"><span>⌕</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search clients…" /></div><div className="admin-crm-table"><div className="admin-crm-table-head"><span>Business</span><span>Contact</span><span>Website</span><span>Status</span></div>{filteredClients.map((client) => <div className="admin-crm-table-row" key={client.id}><span><strong>{client.business_name}</strong><small>{client.industry || "Client"}</small></span><span>{client.email ? <a href={`mailto:${client.email}`}>{client.email}</a> : "No email"}<small>{client.phone || "No phone"}</small></span><span>{client.domain || "Not connected"}</span><span className="admin-status live"><i />{client.status || "active"}</span></div>)}</div></section>}

    {mode === "Tasks" && <section className="admin-panel"><div className="admin-task-list">{data?.tasks.map((task) => <label className={`admin-task-row ${task.done ? "done" : ""}`} key={task.id}><input type="checkbox" checked={task.done} disabled={!data.permissions.canEdit} onChange={(event) => update("task", task.id, { done: event.target.checked })} /><span><strong>{task.title}</strong><small>{task.notes || data.clients.find((client) => client.id === task.client_id)?.business_name || "General task"}</small></span><time>{task.due_date ? new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short" }).format(new Date(`${task.due_date}T12:00:00`)) : "No due date"}</time></label>)}</div></section>}

    {mode === "Activity" && <section className="admin-panel"><div className="admin-activity-list">{data?.activities.length ? data.activities.map((activity) => <div className="admin-activity-row" key={activity.id}><span className="admin-activity-dot success" /><span><strong>{activity.detail || activity.action.replaceAll("_", " ")}</strong><small>{activity.entity_type} · {activity.entity_id}</small></span><time>{when(activity.created_at)}</time></div>) : <p className="admin-crm-empty">CRM changes will appear here.</p>}</div></section>}
  </div>;
}

