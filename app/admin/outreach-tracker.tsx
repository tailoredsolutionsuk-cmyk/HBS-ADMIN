"use client";

import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { Icon } from "./admin-ui";
import { followUpDraft, followUpSequence, outreachMethods, type OutreachDashboard, type OutreachEntry, type OutreachLead, type OutreachPeriod } from "../../lib/crm/outreach";

type Data = OutreachDashboard & { leads: OutreachLead[]; canEdit: boolean };
type Draft = { leadId: string; kind: OutreachEntry["kind"]; method: OutreachEntry["method"]; notes: string; meetingAt: string; sequenceStep: number | null };
const periods = [{ value: "today", label: "Today" }, { value: "7d", label: "Last 7 days" }, { value: "30d", label: "Last 30 days" }, { value: "all", label: "All time" }] as const;
const stages = ["New", "Contacted", "Qualified", "Proposal", "Won", "Lost"];
const formatDate = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/London", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
const dateKey = (value: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/London", year: "numeric", month: "2-digit", day: "2-digit" }).format(value);
const methodLabel = (method: string | null) => outreachMethods.find((item) => item.value === method)?.label || "Other";
const messages: Record<string, string> = { FOLLOW_UP_NOT_DUE: "This follow-up is not due yet. Refresh to check the sequence.", FOLLOW_UP_ALREADY_LOGGED: "This follow-up is already logged. Cancel this entry and refresh.", SEQUENCE_CLOSED: "The sequence has stopped or reached day 14. Cancel this entry and refresh.", AUTH_REQUIRED: "Please sign in again to view outreach.", ADMIN_ACCESS_REQUIRED: "An admin account is needed to view outreach.", READ_ONLY_ACCESS: "Your account can view outreach but cannot log changes.", OUTREACH_UNAVAILABLE: "Outreach data could not be loaded. Please refresh.", INVALID_OUTREACH_ENTRY: "Check the outreach details and try again.", LEAD_NOT_FOUND: "This lead is no longer available. Please refresh.", UNDO_NOT_ALLOWED: "You can undo your own entries. An owner or admin can correct other entries.", ENTRY_ID_CONFLICT: "That entry has already been saved with different details. Refresh before logging again." };
async function responseData(response: Response) {
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(messages[data.error] || "The change could not be confirmed. Retry to save the same entry safely.");
  return data;
}
function dueState(lead: OutreachLead, today: string) {
  if (["Won", "Lost"].includes(lead.status)) return "closed";
  if (!lead.next_action_at || !Number.isFinite(Date.parse(lead.next_action_at))) return "none";
  const due = dateKey(new Date(lead.next_action_at));
  return due < today ? "overdue" : due === today ? "today" : "upcoming";
}

export default function OutreachTracker({ onOpenPipeline, onOpenIntegrations }: { onOpenPipeline: () => void; onOpenIntegrations: () => void }) {
  const [data, setData] = useState<Data | null>(null);
  const [period, setPeriod] = useState<OutreachPeriod>("30d");
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [actionError, setActionError] = useState("");
  const [notice, setNotice] = useState("");
  const [query, setQuery] = useState("");
  const [contactFilter, setContactFilter] = useState("all");
  const [stage, setStage] = useState("all");
  const [dueFilter, setDueFilter] = useState("all");
  const [sequenceFilter, setSequenceFilter] = useState("all");
  const [now, setNow] = useState(() => new Date());
  useEffect(() => { const timer = window.setInterval(() => setNow(new Date()), 60000); return () => window.clearInterval(timer); }, []);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [pending, setPending] = useState<OutreachEntry | null>(null);
  const [saving, setSaving] = useState(false);
  const draftId = useRef("");
  const load = useCallback(async (signal?: AbortSignal) => {
    const payload = await fetch(`/api/admin/outreach?period=${period}`, { cache: "no-store", signal }).then(responseData);
    if (!Array.isArray(payload.leads) || !Array.isArray(payload.leadStats) || !payload.totals) throw new Error(messages.OUTREACH_UNAVAILABLE);
    if (!signal?.aborted) { setData(payload); setLoadError(""); }
  }, [period]);
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true); setLoadError(""); setData(null);
    load(controller.signal).catch((cause) => { if (!controller.signal.aborted) setLoadError(cause.message); }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [load]);
  const refresh = async () => {
    setLoading(true);
    try { await load(); } catch (cause) { setLoadError((cause as Error).message); } finally { setLoading(false); }
  };
  const openDraft = (leadId: string, kind: Draft["kind"], method: Draft["method"], sequenceStep: number | null = null, notes = "") => {
    if (draft && !window.confirm("Replace the unsaved outreach entry?")) return;
    draftId.current = crypto.randomUUID(); setPending(null); setActionError(""); setNotice("");
    setDraft({ leadId, kind, method, notes, meetingAt: "", sequenceStep });
  };
  const save = async (event: FormEvent) => {
    event.preventDefault(); if (!draft || saving) return;
    const entry: OutreachEntry = pending || { id: draftId.current, leadId: draft.leadId, kind: draft.kind, method: draft.method, notes: draft.notes, meetingAt: draft.meetingAt ? new Date(draft.meetingAt).toISOString() : null, sequenceStep: draft.sequenceStep };
    setPending(entry); setSaving(true); setActionError("");
    try {
      await fetch("/api/admin/outreach", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(entry) }).then(responseData);
      setDraft(null); setPending(null); setNotice(entry.kind === "outreach" ? `${entry.sequenceStep ? `Day ${entry.sequenceStep} follow-up` : methodLabel(entry.method) + " outreach"} logged.` : entry.kind === "meeting_booked" ? "Meeting booking recorded." : "Follow-up sequence stopped.");
      try { await load(); } catch { setLoadError("Your entry was saved. Refresh to load the latest totals."); }
    } catch (cause) { setActionError((cause as Error).message); }
    finally { setSaving(false); }
  };
  const undo = async (id: string) => {
    if (saving || !window.confirm("Undo this entry and remove it from the outreach totals?")) return;
    setSaving(true); setActionError(""); setNotice("");
    try {
      await fetch("/api/admin/outreach", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id }) }).then(responseData);
      setNotice("Entry undone. The audit record is retained.");
      try { await load(); } catch { setLoadError("The entry was undone. Refresh to load the latest totals."); }
    } catch (cause) { setActionError((cause as Error).message); } finally { setSaving(false); }
  };
  const stats = new Map(data?.leadStats.map((item) => [item.leadId, item]) || []);
  const term = query.trim().toLowerCase(), today = dateKey(new Date());
  const leads = (data?.leads || []).filter((lead) => {
    const record = stats.get(lead.id), due = dueState(lead, today);
    return (!term || [lead.business_name, lead.email, lead.phone, lead.main_location, lead.notes].some((value) => value?.toLowerCase().includes(term)))
      && (stage === "all" || lead.status === stage) && (dueFilter === "all" || due === dueFilter)
      && (contactFilter === "all" || (contactFilter === "new" && !record?.attempts) || (contactFilter === "contacted" && Boolean(record?.attempts)) || (contactFilter === "booked" && record?.meetingBooked))
      && (sequenceFilter === "all" || followUpSequence(record, lead.status, now).status === sequenceFilter);
  }).sort((a, b) => a.business_name.localeCompare(b.business_name));

  return <div className="admin-outreach-page">
    <section className="admin-welcome"><div><span className="admin-section-kicker">HBS sales workspace</span><h2>Outreach &amp; Follow-up</h2><p>Log completed calls and messages, record meetings booked, and track your cold lead activity.</p></div><button className="admin-outline-button" onClick={onOpenPipeline}>Open Pipeline <Icon name="arrow-up-right" size={14} /></button></section>
    <div className="admin-outreach-report-toolbar"><div className="admin-outreach-periods" aria-label="Outreach reporting period">{periods.map((item) => <button key={item.value} disabled={saving || loading} aria-pressed={period === item.value} onClick={() => setPeriod(item.value)}>{item.label}</button>)}</div><button className="admin-outline-button" disabled={saving || loading} onClick={refresh}>{loading ? "Loading…" : "Refresh"}</button></div>
    {loadError ? <p className="admin-lead-alert error" role="alert">{loadError}</p> : null}
    {actionError ? <p className="admin-lead-alert error" role="alert">{actionError}</p> : null}
    {notice ? <p className="admin-lead-alert success" role="status">{notice}</p> : null}
    {loading ? <div className="admin-panel admin-crm-loading" role="status">Loading outreach metrics…</div> : null}
    {data && !loading ? <>
      <section className="admin-outreach-kpis" aria-label="Outreach metrics"><article><span>Outreach attempts</span><strong>{data.totals.outreaches}</strong><small>Every logged call or message</small></article><article><span>Leads contacted</span><strong>{data.totals.contactedLeads}</strong><small>Unique leads in this period</small></article><article><span>Meetings booked</span><strong>{data.totals.meetingsBooked}</strong><small>Unique leads with bookings logged in this period</small></article></section>
      <section className="admin-panel"><div className="admin-panel-heading"><div><span className="admin-section-kicker">Selected reporting period · UK time</span><h3>Outreach by method</h3></div></div><div className="admin-outreach-method-totals">{outreachMethods.map((method) => <div key={method.value}><span>{method.label}</span><strong>{data.byMethod[method.value] || 0}</strong></div>)}</div><p className="admin-spreadsheet-footnote">Only recorded entries are counted. Meeting bookings are separate from outreach attempts.</p></section>
      <section className="admin-panel"><h3>Follow-up queue</h3><p>Day 1, day 3 and day 7 after the first logged outreach. Wait 7 days after the final follow-up, then leave it if there is no response (normally day 14). Drafts and reminders only; send through your usual channel, then mark sent. Record replies using Response received to stop further follow-ups.</p><button className="admin-outline-button" onClick={() => setSequenceFilter("due")}>{data.leads.filter(lead => followUpSequence(stats.get(lead.id), lead.status, now).status === "due").length} follow-ups due · Show queue</button><label className="admin-followup-filter">Sequence status<select value={sequenceFilter} onChange={event => setSequenceFilter(event.target.value)}><option value="all">All sequences</option><option value="due">Due now</option><option value="scheduled">Scheduled</option><option value="waiting">Waiting after final follow-up</option><option value="ended">Closed · no response</option><option value="stopped">Response / meeting / stopped</option><option value="not_started">Not started</option></select></label></section>
      <section className="admin-panel"><div className="admin-panel-heading"><div><span className="admin-section-kicker">All cold leads · lifetime history per lead</span><h3>Log your outreach</h3><p>Choose the method used, then save the entry. Record a meeting booking once it is confirmed.</p></div></div>
        {!data.canEdit ? <p className="admin-task-quick-help">Your account has read-only access.</p> : null}
        <div className="admin-outreach-log-filters"><label className="admin-search"><Icon name="search" size={15} /><input aria-label="Search outreach leads" placeholder="Search business, phone or location" value={query} onChange={(event) => setQuery(event.target.value)} /></label><label>Outreach status<select value={contactFilter} onChange={(event) => setContactFilter(event.target.value)}><option value="all">All leads</option><option value="new">No outreach logged</option><option value="contacted">Outreach logged</option><option value="booked">Meeting booked</option></select></label><label>Pipeline stage<select value={stage} onChange={(event) => setStage(event.target.value)}><option value="all">All stages</option>{stages.map((value) => <option key={value}>{value}</option>)}</select></label><label>Follow-up<select value={dueFilter} onChange={(event) => setDueFilter(event.target.value)}><option value="all">All follow-ups</option><option value="overdue">Overdue</option><option value="today">Due today</option><option value="upcoming">Upcoming</option><option value="none">No date set</option></select></label></div>
        <div className="admin-filter-feedback" role="status"><span>{leads.length} of {data.leads.length} leads shown</span>{query || contactFilter !== "all" || stage !== "all" || dueFilter !== "all" ? <button className="admin-text-button" onClick={() => { setQuery(""); setContactFilter("all"); setStage("all"); setDueFilter("all"); }}>Clear filters</button> : null}</div>
        <div className="admin-outreach-tracking-list">{leads.map((lead) => {
          const record = stats.get(lead.id), due = dueState(lead, today), editing = draft?.leadId === lead.id;
          const sequence = followUpSequence(record, lead.status, now);
          return <article className="admin-outreach-tracking-lead" key={lead.id}>
            <header><div><h3>{lead.business_name}</h3><p>{lead.main_location || "Location not listed"}{lead.phone ? ` · ${lead.phone}` : ""}</p><span>{record?.attempts || 0} outreach attempts · all time</span></div><span className={`admin-lead-stage ${lead.status.toLowerCase()}`}>{lead.status}</span></header>
            <div className="admin-outreach-log-buttons" aria-label={`Log activity for ${lead.business_name}`}>{outreachMethods.map((method) => <button className="admin-outline-button" key={method.value} disabled={!data.canEdit || saving || loading} onClick={() => openDraft(lead.id, "outreach", method.value)} aria-label={`Log ${method.label} outreach for ${lead.business_name}`}>{method.label}</button>)}<button className={record?.meetingBooked ? "admin-outreach-booked" : "admin-primary-button"} disabled={!data.canEdit || saving || Boolean(record?.meetingBooked)} onClick={() => openDraft(lead.id, "meeting_booked", null)}>{record?.meetingBooked ? "✓ Meeting booked" : "Meeting booked"}</button></div>
            <section className="admin-followup-sequence" aria-label={`Follow-up sequence for ${lead.business_name}`}><strong>{sequence.label}</strong>{sequence.dueAt ? <p>{sequence.status === "waiting" ? "Closes" : sequence.status === "ended" ? "Closed" : "Due"}: {formatDate.format(new Date(sequence.dueAt))}</p> : null}<p>Day 1 {record?.sequenceSteps?.includes(1) ? "✓" : "·"} Day 3 {record?.sequenceSteps?.includes(3) ? "✓" : "·"} Day 7 {record?.sequenceSteps?.includes(7) ? "✓" : "·"} 7 days after final: leave it</p>{sequence.step ? <details><summary>Review day {sequence.step} draft</summary><label>Suggested follow-up<textarea readOnly rows={7} value={followUpDraft(lead.business_name, sequence.step)} /></label><button className="admin-outline-button" onClick={async () => { try { await navigator.clipboard.writeText(followUpDraft(lead.business_name, sequence.step!)); setNotice("Follow-up draft copied. Review it before sending."); } catch { setActionError("Copy unavailable. Select and copy the draft text."); } }}>Copy draft</button><button className="admin-primary-button" disabled={!data.canEdit || saving || sequence.status !== "due"} onClick={() => openDraft(lead.id, "outreach", record?.firstMethod || "email", sequence.step, followUpDraft(lead.business_name, sequence.step!))}>Mark day {sequence.step} follow-up sent</button></details> : null}{!["stopped", "ended", "not_started"].includes(sequence.status) ? <div><button className="admin-outline-button" disabled={!data.canEdit || saving} onClick={() => openDraft(lead.id, "response_received", null)}>Response received</button><button className="admin-text-button" disabled={!data.canEdit || saving} onClick={() => openDraft(lead.id, "sequence_stopped", null)}>Stop follow-ups</button></div> : null}</section>
            {editing && draft ? <form className="admin-outreach-entry-form" onSubmit={save}><h4>{draft.kind === "outreach" ? (draft.sequenceStep ? `Confirm day ${draft.sequenceStep} follow-up sent` : `Log ${methodLabel(draft.method)} outreach`) : draft.kind === "meeting_booked" ? "Record meeting booking" : draft.kind === "response_received" ? "Record response and stop follow-ups" : "Stop follow-ups"}</h4>{draft.sequenceStep ? <label>Method used<select value={draft.method || "email"} disabled={saving || Boolean(pending)} onChange={event => setDraft({ ...draft, method: event.target.value as Draft["method"] })}>{outreachMethods.map(method => <option key={method.value} value={method.value}>{method.label}</option>)}</select></label> : null}{draft.kind === "meeting_booked" ? <label>Meeting date and time (optional; your local time)<input type="datetime-local" value={draft.meetingAt} disabled={saving || Boolean(pending)} onChange={(event) => setDraft({ ...draft, meetingAt: event.target.value })} /></label> : null}<label>Notes (optional)<textarea value={draft.notes} maxLength={2000} rows={2} disabled={saving || Boolean(pending)} onChange={(event) => setDraft({ ...draft, notes: event.target.value })} placeholder="What happened? Any useful details?" /></label>{pending && !saving ? <p>Save not confirmed. Retrying uses the same entry to prevent double counting.</p> : null}<div><button className="admin-primary-button" disabled={saving}>{saving ? "Saving…" : pending ? "Retry save" : draft.kind === "outreach" ? (draft.sequenceStep ? "Confirm follow-up sent" : "Save outreach") : draft.kind === "meeting_booked" ? "Save meeting booking" : "Confirm stop"}</button><button className="admin-outline-button" type="button" disabled={saving} onClick={() => { setDraft(null); setPending(null); setActionError(""); }}>Cancel</button></div></form> : null}
            <div className={`admin-outreach-follow-up ${due}`}><strong>{record?.meetingAt ? `Meeting · ${formatDate.format(new Date(record.meetingAt))}` : due === "overdue" ? "Follow-up overdue" : due === "today" ? "Follow-up due today" : due === "upcoming" ? "Follow-up scheduled" : ""}</strong><span>{lead.next_action || "Set the next action and follow-up date in Pipeline."}{lead.next_action_at ? ` · ${formatDate.format(new Date(lead.next_action_at))}` : ""}</span>{record?.meetingBooked && record.canUndoBooking && record.bookingId ? <button className="admin-text-button" disabled={saving} onClick={() => undo(record.bookingId!)}>Undo meeting booking</button> : null}</div>
            <details className="admin-outreach-business-details"><summary>History &amp; business details</summary><p>{lead.source || "CRM lead"}</p>{lead.notes ? <p className="admin-outreach-notes">{lead.notes}</p> : null}{record?.history.length ? <ol className="admin-outreach-history">{record.history.map((item) => <li key={item.id}><div><strong>{item.event_type === "outreach" ? `${methodLabel(item.method)} outreach` : item.event_type === "meeting_booked" ? "Meeting booked" : item.event_type === "response_received" ? "Response received" : "Follow-ups stopped"}</strong><time>{formatDate.format(new Date(item.occurred_at))}</time>{item.notes ? <p>{item.notes}</p> : null}</div>{item.canUndo && data.canEdit ? <button className="admin-text-button" disabled={saving} onClick={() => undo(item.id)}>Undo</button> : null}</li>)}</ol> : <p>No outreach recorded yet.</p>}<small>Latest five entries. Corrections are retained in the audit log.</small></details>
          </article>;
        })}</div>
        {!leads.length ? <div className="admin-empty-state compact"><strong>{data.leads.length ? "No leads match these filters" : "No cold leads yet"}</strong><p>{data.leads.length ? "Clear a filter to see more leads." : "Import your outreach spreadsheet or add a lead to Pipeline."}</p>{!data.leads.length ? <button className="admin-outline-button" onClick={onOpenIntegrations}>Open Integrations</button> : null}</div> : null}
      </section>
    </> : null}
  </div>;
}

