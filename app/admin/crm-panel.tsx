"use client";

import { DragEvent, FormEvent, useEffect, useMemo, useState } from "react";

type Client = { id: string; business_name: string; email: string | null; phone: string | null; domain: string | null; industry: string | null; status: string | null };
type Lead = { id: string; business_name: string; contact_name: string | null; name: string; email: string; phone: string; status: string; source: string; estimated_value: number | null; help_needed: string; notes: string | null; next_action: string | null; next_action_at: string | null; probability: number; lost_reason: string | null; stage_changed_at: string; converted_business_id: string | null; created_at: string };
type Task = { id: string; client_id: string | null; title: string; notes: string | null; done: boolean; due_date: string | null };
type Note = { id: string; entity_type: string; entity_id: string; note: string; created_at: string };
type Activity = { id: string; entity_type: string; entity_id: string; action: string; detail: string | null; created_at: string };
type CrmData = { clients: Client[]; leads: Lead[]; tasks: Task[]; notes: Note[]; activities: Activity[]; permissions: { canEdit: boolean }; metrics: { clients: number; openLeads: number; pipelineValue: number; weightedValue: number; overdueFollowUps: number; tasksDue: number } };

const stages = ["New", "Contacted", "Qualified", "Proposal", "Won", "Lost"];
const stageProbability: Record<string, number> = { New: 10, Contacted: 25, Qualified: 45, Proposal: 70, Won: 100, Lost: 0 };
const money = (value: number) => new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP", maximumFractionDigits: 0 }).format(value);
const when = (value: string) => new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }).format(new Date(value));
const localDateTime = (value: string | null) => value ? new Date(new Date(value).valueOf() - new Date(value).getTimezoneOffset() * 60000).toISOString().slice(0, 16) : "";

export default function CrmPanel({ mode }: { mode: "Pipeline" | "Clients" | "Tasks" | "Activity" }) {
  const [data, setData] = useState<CrmData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [stageFilter, setStageFilter] = useState("All");
  const [followUpFilter, setFollowUpFilter] = useState("all");
  const [formOpen, setFormOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [selectedLeadId, setSelectedLeadId] = useState<string | null>(null);

  async function load() {
    setError("");
    const response = await fetch("/api/admin/crm", { cache: "no-store" });
    if (!response.ok) throw new Error("The CRM could not be loaded.");
    setData(await response.json());
  }
  useEffect(() => { load().catch((issue) => setError(issue instanceof Error ? issue.message : "CRM unavailable.")).finally(() => setLoading(false)); }, []);

  async function request(method: "POST" | "PATCH", body: Record<string, unknown>) {
    const response = await fetch("/api/admin/crm", { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.detail || "The change could not be saved.");
    await load();
    return payload;
  }

  async function createRecord(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setSaving(true); setError("");
    const form = new FormData(event.currentTarget);
    const body = mode === "Pipeline"
      ? { entity: "lead", businessName: form.get("businessName"), contactName: form.get("contactName"), email: form.get("email"), phone: form.get("phone"), estimatedValue: form.get("estimatedValue"), helpNeeded: form.get("helpNeeded"), source: form.get("source"), status: form.get("status"), probability: form.get("probability"), nextAction: form.get("nextAction"), nextActionAt: form.get("nextActionAt") }
      : mode === "Clients" ? { entity: "client", businessName: form.get("businessName"), email: form.get("email"), phone: form.get("phone") }
      : { entity: "task", title: form.get("title"), clientId: form.get("clientId"), dueDate: form.get("dueDate"), notes: form.get("notes") };
    try { await request("POST", body); setFormOpen(false); } catch (issue) { setError(issue instanceof Error ? issue.message : "Save failed."); } finally { setSaving(false); }
  }

  async function update(entity: string, id: string, updates: Record<string, unknown>) {
    setError("");
    try { await request("PATCH", { entity, id, ...updates }); } catch (issue) { setError(issue instanceof Error ? issue.message : "The update could not be saved."); }
  }

  async function saveLead(event: FormEvent<HTMLFormElement>, lead: Lead) {
    event.preventDefault(); setSaving(true);
    const form = new FormData(event.currentTarget);
    try { await update("lead", lead.id, { status: form.get("status"), estimatedValue: form.get("estimatedValue"), probability: form.get("probability"), helpNeeded: form.get("helpNeeded"), notes: form.get("notes"), nextAction: form.get("nextAction"), nextActionAt: form.get("nextActionAt"), lostReason: form.get("lostReason") }); } finally { setSaving(false); }
  }

  async function addNote(event: FormEvent<HTMLFormElement>, leadId: string) {
    event.preventDefault(); const form = new FormData(event.currentTarget); const note = String(form.get("note") || "").trim(); if (!note) return; setSaving(true);
    try { await request("POST", { entity: "note", entityType: "lead", entityId: leadId, note }); event.currentTarget.reset(); } catch (issue) { setError(issue instanceof Error ? issue.message : "The note could not be added."); } finally { setSaving(false); }
  }

  async function convertLead(lead: Lead) {
    setSaving(true); setError("");
    try { await request("POST", { entity: "conversion", id: lead.id }); } catch (issue) { setError(issue instanceof Error ? issue.message : "The lead could not be converted."); } finally { setSaving(false); }
  }

  function dragStart(event: DragEvent<HTMLElement>, leadId: string) { event.dataTransfer.setData("text/plain", leadId); event.dataTransfer.effectAllowed = "move"; }
  function drop(event: DragEvent<HTMLElement>, stage: string) { event.preventDefault(); const id = event.dataTransfer.getData("text/plain"); const lead = data?.leads.find((item) => item.id === id); if (lead && lead.status !== stage) update("lead", id, { status: stage, probability: stageProbability[stage] }); }

  const filteredClients = useMemo(() => (data?.clients ?? []).filter((client) => `${client.business_name} ${client.email || ""} ${client.domain || ""}`.toLowerCase().includes(query.toLowerCase())), [data, query]);
  const filteredLeads = useMemo(() => { const now = Date.now(); return (data?.leads ?? []).filter((lead) => { const due = lead.next_action_at ? new Date(lead.next_action_at).valueOf() : null; return `${lead.business_name} ${lead.contact_name || ""} ${lead.email || ""} ${lead.next_action || ""}`.toLowerCase().includes(query.toLowerCase()) && (stageFilter === "All" || lead.status === stageFilter) && (followUpFilter === "all" || (followUpFilter === "overdue" ? due !== null && due < now && !["Won", "Lost"].includes(lead.status) : followUpFilter === "unscheduled" ? due === null && !["Won", "Lost"].includes(lead.status) : due !== null)); }); }, [data, query, stageFilter, followUpFilter]);
  const selectedLead = data?.leads.find((lead) => lead.id === selectedLeadId) ?? null;
  const selectedNotes = (data?.notes ?? []).filter((note) => note.entity_type === "lead" && note.entity_id === selectedLeadId);
  const selectedActivities = (data?.activities ?? []).filter((activity) => activity.entity_type === "lead" && activity.entity_id === selectedLeadId);

  if (loading) return <section className="admin-panel admin-crm-loading">Loading CRM…</section>;
  if (!data) return <section className="admin-panel admin-crm-loading">{error || "The CRM is unavailable."}</section>;
  return <div className="admin-crm">
    <section className="admin-welcome admin-crm-heading"><div><span className="admin-kicker">HBS business operations</span><h2>{mode}</h2><p>{mode === "Pipeline" ? "Manage every opportunity from first contact to signed client." : mode === "Clients" ? "Keep client contact details and account status in one place." : mode === "Tasks" ? "Track the work that keeps projects and sales moving." : "A clear record of changes made across the CRM."}</p></div>{mode !== "Activity" && data?.permissions.canEdit && <button className="admin-primary-button" onClick={() => setFormOpen((open) => !open)}>+ New {mode === "Pipeline" ? "lead" : mode === "Clients" ? "client" : "task"}</button>}</section>
    {error && <p className="admin-crm-error" role="alert">{error}</p>}
    <section className="admin-stats admin-crm-stats"><article className="admin-stat-card"><span className="admin-stat-label">Clients</span><strong>{data?.metrics.clients ?? 0}</strong><small>Active records</small></article><article className="admin-stat-card"><span className="admin-stat-label">Open leads</span><strong>{data?.metrics.openLeads ?? 0}</strong><small>{money(data?.metrics.pipelineValue ?? 0)} total</small></article><article className="admin-stat-card"><span className="admin-stat-label">Weighted value</span><strong>{money(data?.metrics.weightedValue ?? 0)}</strong><small>Probability adjusted</small></article><article className="admin-stat-card"><span className="admin-stat-label">Overdue</span><strong>{data?.metrics.overdueFollowUps ?? 0}</strong><small>Follow-ups needing action</small></article></section>

    {formOpen && <form className="admin-panel admin-crm-form" onSubmit={createRecord}><div className="admin-panel-heading"><div><span className="admin-section-kicker">Create record</span><h3>New {mode === "Pipeline" ? "lead" : mode === "Clients" ? "client" : "task"}</h3></div><button type="button" className="admin-text-button" onClick={() => setFormOpen(false)}>Close</button></div>{mode === "Tasks" ? <><label>Task title<input name="title" required /></label><label>Client<select name="clientId"><option value="">General task</option>{data?.clients.map((client) => <option key={client.id} value={client.id}>{client.business_name}</option>)}</select></label><label>Due date<input type="date" name="dueDate" /></label><label className="wide">Notes<textarea name="notes" rows={3} /></label></> : <><label>Business name<input name="businessName" required /></label>{mode === "Pipeline" && <label>Contact name<input name="contactName" /></label>}<label>Email<input type="email" name="email" /></label><label>Phone<input name="phone" /></label>{mode === "Pipeline" && <><label>Source<input name="source" placeholder="Website, referral, phone…" /></label><label>Stage<select name="status" defaultValue="New">{stages.map((stage) => <option key={stage}>{stage}</option>)}</select></label><label>Estimated value (£)<input type="number" min="0" step="1" name="estimatedValue" /></label><label>Win probability (%)<input type="number" min="0" max="100" name="probability" defaultValue="10" /></label><label>Next action<input name="nextAction" placeholder="Call, send proposal…" /></label><label>Follow-up date<input type="datetime-local" name="nextActionAt" /></label><label className="wide">What do they need?<textarea name="helpNeeded" rows={3} /></label></>}</>}<button className="admin-primary-button" disabled={saving}>{saving ? "Saving…" : "Save record"}</button></form>}

    {mode === "Pipeline" && <><section className="admin-panel admin-pipeline-toolbar"><div className="admin-search"><span>⌕</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search leads…" /></div><label>Stage<select value={stageFilter} onChange={(event) => setStageFilter(event.target.value)}><option>All</option>{stages.map((stage) => <option key={stage}>{stage}</option>)}</select></label><label>Follow-ups<select value={followUpFilter} onChange={(event) => setFollowUpFilter(event.target.value)}><option value="all">All</option><option value="overdue">Overdue</option><option value="scheduled">Scheduled</option><option value="unscheduled">Not scheduled</option></select></label></section><section className="admin-pipeline">{stages.filter((stage) => stageFilter === "All" || stage === stageFilter).map((stage) => <div className={`admin-pipeline-column stage-${stage.toLowerCase()}`} key={stage} onDragOver={(event) => event.preventDefault()} onDrop={(event) => drop(event, stage)}><header><span>{stage}</span><b>{filteredLeads.filter((lead) => lead.status.toLowerCase() === stage.toLowerCase()).length}</b></header>{filteredLeads.filter((lead) => lead.status.toLowerCase() === stage.toLowerCase()).map((lead) => { const overdue = lead.next_action_at && new Date(lead.next_action_at).valueOf() < Date.now() && !["Won", "Lost"].includes(lead.status); return <article className="admin-lead-card" key={lead.id} draggable={data.permissions.canEdit} onDragStart={(event) => dragStart(event, lead.id)} onClick={() => setSelectedLeadId(lead.id)} tabIndex={0} onKeyDown={(event) => { if (event.key === "Enter") setSelectedLeadId(lead.id); }}><div className="admin-lead-card-top"><span className="admin-section-kicker">{lead.source || "Direct"}</span><span>{lead.probability}%</span></div><h3>{lead.business_name}</h3><p>{lead.contact_name || lead.name}</p><strong>{money(Number(lead.estimated_value || 0))}</strong><small>{lead.help_needed || "No requirement added"}</small><div className={`admin-follow-up ${overdue ? "overdue" : ""}`}><b>{lead.next_action || "Next action not set"}</b><span>{overdue ? "Overdue · " : ""}{lead.next_action_at ? when(lead.next_action_at) : "No follow-up set"}</span></div>{data.permissions.canEdit && <select aria-label={`Stage for ${lead.business_name}`} value={lead.status} onClick={(event) => event.stopPropagation()} onChange={(event) => update("lead", lead.id, { status: event.target.value, probability: stageProbability[event.target.value] })}>{stages.map((item) => <option key={item}>{item}</option>)}</select>}</article>; })}<button className="admin-pipeline-add" onClick={() => setFormOpen(true)}>+ Add lead</button></div>)}</section></>}

    {mode === "Clients" && <section className="admin-panel"><div className="admin-search"><span>⌕</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search clients…" /></div><div className="admin-crm-table"><div className="admin-crm-table-head"><span>Business</span><span>Contact</span><span>Website</span><span>Status</span></div>{filteredClients.map((client) => <div className="admin-crm-table-row" key={client.id}><span><strong>{client.business_name}</strong><small>{client.industry || "Client"}</small></span><span>{client.email ? <a href={`mailto:${client.email}`}>{client.email}</a> : "No email"}<small>{client.phone || "No phone"}</small></span><span>{client.domain || "Not connected"}</span><span className="admin-status live"><i />{client.status || "active"}</span></div>)}</div></section>}
    {mode === "Tasks" && <section className="admin-panel"><div className="admin-task-list">{data?.tasks.map((task) => <label className={`admin-task-row ${task.done ? "done" : ""}`} key={task.id}><input type="checkbox" checked={task.done} disabled={!data.permissions.canEdit} onChange={(event) => update("task", task.id, { done: event.target.checked })} /><span><strong>{task.title}</strong><small>{task.notes || data.clients.find((client) => client.id === task.client_id)?.business_name || "General task"}</small></span><time>{task.due_date ? new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short" }).format(new Date(`${task.due_date}T12:00:00`)) : "No due date"}</time></label>)}</div></section>}
    {mode === "Activity" && <section className="admin-panel"><div className="admin-activity-list">{data?.activities.length ? data.activities.map((activity) => <div className="admin-activity-row" key={activity.id}><span className="admin-activity-dot success" /><span><strong>{activity.detail || activity.action.replaceAll("_", " ")}</strong><small>{activity.entity_type} · {activity.entity_id}</small></span><time>{when(activity.created_at)}</time></div>) : <p className="admin-crm-empty">CRM changes will appear here.</p>}</div></section>}

    {selectedLead && <div className="admin-drawer-backdrop" onClick={() => setSelectedLeadId(null)}><aside className="admin-lead-drawer" onClick={(event) => event.stopPropagation()} aria-label={`${selectedLead.business_name} lead details`}><header><div><span className="admin-section-kicker">Lead details</span><h2>{selectedLead.business_name}</h2><p>{selectedLead.contact_name || selectedLead.name}</p></div><button className="admin-icon-button" onClick={() => setSelectedLeadId(null)} aria-label="Close lead details">×</button></header><div className="admin-lead-contact">{selectedLead.email && <a href={`mailto:${selectedLead.email}`}>Email {selectedLead.email}</a>}{selectedLead.phone && <a href={`tel:${selectedLead.phone}`}>Call {selectedLead.phone}</a>}</div><form className="admin-lead-detail-form" onSubmit={(event) => saveLead(event, selectedLead)}><label>Stage<select name="status" defaultValue={selectedLead.status}>{stages.map((stage) => <option key={stage}>{stage}</option>)}</select></label><label>Estimated value (£)<input name="estimatedValue" type="number" min="0" defaultValue={selectedLead.estimated_value ?? ""} /></label><label>Win probability (%)<input name="probability" type="number" min="0" max="100" defaultValue={selectedLead.probability} /></label><label>Follow-up date<input name="nextActionAt" type="datetime-local" defaultValue={localDateTime(selectedLead.next_action_at)} /></label><label className="wide">Next action<input name="nextAction" defaultValue={selectedLead.next_action || ""} placeholder="What needs to happen next?" /></label><label className="wide">Requirements<textarea name="helpNeeded" rows={3} defaultValue={selectedLead.help_needed || ""} /></label><label className="wide">Internal summary<textarea name="notes" rows={3} defaultValue={selectedLead.notes || ""} /></label><label className="wide">Lost reason<textarea name="lostReason" rows={2} defaultValue={selectedLead.lost_reason || ""} placeholder="Complete this if the opportunity is lost" /></label>{data.permissions.canEdit && <button className="admin-primary-button" disabled={saving}>{saving ? "Saving…" : "Save lead"}</button>}</form>{data.permissions.canEdit && !selectedLead.converted_business_id && <button className="admin-convert-button" disabled={saving} onClick={() => convertLead(selectedLead)}>Convert to client</button>}{selectedLead.converted_business_id && <p className="admin-converted-badge">✓ Converted to client</p>}<section className="admin-drawer-section"><h3>Notes</h3>{data.permissions.canEdit && <form className="admin-note-form" onSubmit={(event) => addNote(event, selectedLead.id)}><textarea name="note" rows={2} placeholder="Add a call note, decision or update…" required /><button disabled={saving}>Add note</button></form>}{selectedNotes.map((note) => <article className="admin-note" key={note.id}><p>{note.note}</p><time>{when(note.created_at)}</time></article>)}</section><section className="admin-drawer-section"><h3>History</h3>{selectedActivities.length ? selectedActivities.map((activity) => <div className="admin-drawer-activity" key={activity.id}><i /><span><b>{activity.detail || activity.action}</b><small>{when(activity.created_at)}</small></span></div>) : <p className="admin-crm-empty">No changes recorded yet.</p>}</section></aside></div>}
  </div>;
}

