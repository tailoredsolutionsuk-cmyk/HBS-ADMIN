"use client";
import { useEffect, useState } from "react";
import { BRIEF_FIELDS, STATUS_LABELS, parseProject, type Project } from "../../lib/onboarding/model";
import { onboardingRequest } from "../../lib/onboarding/client";
import "../onboarding.css";

type State = {
  projects: Project[];
  clients: { id: string; business_name: string; portal_enabled: boolean; portal_email: string | null }[];
  permissions: { canCreate: boolean; canReview: boolean };
  automation: { enabled: boolean; pending: number }; truncated: boolean;
};
export default function OnboardingPanel({ initialClientId = "" }: { initialClientId?: string }) {
  const [data, setData] = useState<State | null>(null);
  const [error, setError] = useState(""); const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false); const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(Boolean(initialClientId));
  const [requestId, setRequestId] = useState("");
  const [form, setForm] = useState({ client_id: initialClientId, name: "", service: "Website build", target_date: "" });
  const [selected, setSelected] = useState<string | null>(null); const [note, setNote] = useState("");
  async function load() {
    setLoading(true);
    try { setData(await onboardingRequest<State>("/api/admin/onboarding")); }
    catch (e) { setError(e instanceof Error ? e.message : "Could not load projects."); }
    finally { setLoading(false); }
  }
  useEffect(() => { void load(); }, []);
  const project = data?.projects.find(p => p.id === selected);
  const client = data?.clients.find(c => c.id === form.client_id);
  async function mutate(body: unknown, message: string) {
    setBusy(true); setError(""); setNotice("");
    try {
      await onboardingRequest("/api/admin/onboarding", body);
      setNotice(message); setCreating(false); setRequestId(""); await load();
    } catch (e) { setError(e instanceof Error ? e.message : "Could not save. Retry with the same details."); }
    finally { setBusy(false); }
  }
  return <section className="onboarding admin-panel">
    <header className="onboarding-heading"><div><span className="admin-section-kicker">New client work</span><h2>Project onboarding</h2><p>Collect a clear brief, track the checklist and approve the next stage.</p></div>
      {data?.permissions.canCreate && <button className="admin-primary-button" onClick={() => { setCreating(true); setSelected(null); }}>Start new project</button>}
    </header>
    {error && <div role="alert" className="onboarding-error">{error} <button onClick={() => { setError(""); void load(); }} disabled={busy}>Reload</button></div>}
    {notice && <p role="status" className="onboarding-success">{notice}</p>}
    {loading && !data ? <p role="status">Loading projects…</p> : null}
    {data && <>
      <p className="onboarding-info">Email automation is not connected. No invitation or reminder is sent automatically. {data.automation.pending} event(s) recorded for future delivery.</p>
      {data.truncated && <p role="status">Showing the latest 200 projects and up to 500 clients. Contact your administrator if a record is missing.</p>}
      {creating && data.permissions.canCreate && <form className="onboarding-form" onSubmit={event => {
        event.preventDefault();
        try {
          const project = parseProject(form);
          const id = requestId || crypto.randomUUID(); setRequestId(id);
          void mutate({ action: "create", id, project }, "Project and eight checklist tasks created. Share the portal link after confirming client access.");
        } catch (e) { setError(e instanceof Error ? e.message : "Check your project details."); }
      }}>
        <h3>Start a project</h3>
        <label>Client<select required disabled={busy || Boolean(requestId)} value={form.client_id} onChange={e => setForm({ ...form, client_id: e.target.value })}><option value="">Select a client</option>{data.clients.map(c => <option key={c.id} value={c.id}>{c.business_name}</option>)}</select></label>
        <label>Project name<input required maxLength={160} disabled={busy || Boolean(requestId)} value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="Example: UTX website refresh" /></label>
        <label>Service<input required maxLength={100} disabled={busy || Boolean(requestId)} value={form.service} onChange={e => setForm({ ...form, service: e.target.value })} /></label>
        <label>Target launch date (optional)<input type="date" disabled={busy || Boolean(requestId)} value={form.target_date} onChange={e => setForm({ ...form, target_date: e.target.value })} /></label>
        {client && <p className="onboarding-info">{client.portal_enabled && client.portal_email ? `Portal access enabled for ${client.portal_email}. No email will be sent.` : "Portal access is not ready. Enable the correct email in Clients before sharing the portal link."}</p>}
        {requestId && !busy && <p>The previous attempt may have saved. Retry with these same details; duplicate tasks will not be created.</p>}
        <div className="onboarding-actions"><button className="admin-primary-button" disabled={busy}>{busy ? "Saving…" : requestId ? "Retry safely" : "Create project and checklist"}</button><button type="button" disabled={busy} onClick={() => setCreating(false)}>Close</button></div>
      </form>}
      <div className="onboarding-grid">
        <div className="onboarding-list">
          {!data.projects.length && <p>No projects yet. Start a project for a client to create their onboarding checklist.</p>}
          {data.projects.map(p => <button className="onboarding-project" aria-pressed={selected === p.id} key={p.id} onClick={() => { setSelected(p.id); setNote(""); }}>
            <strong>{p.name}</strong><span>{data.clients.find(c => c.id === p.client_id)?.business_name || "Archived client"}</span><span>{STATUS_LABELS[p.status]}</span>
            {p.target_date && <small>Target: {new Intl.DateTimeFormat("en-GB").format(new Date(p.target_date+"T12:00:00Z"))}</small>}
          </button>)}
        </div>
        {project ? <article className="onboarding-detail"><h3>{project.name}</h3><p>{project.service} · {STATUS_LABELS[project.status]}</p>
          <p>Client login: <a href="/portal/login" target="_blank" rel="noreferrer">Open portal login</a>. Only the enabled client account can view this brief.</p>
          {project.review_note && <p className="onboarding-info">Last review: {project.review_note}</p>}
          <dl>{BRIEF_FIELDS.map(([key,label]) => <div key={key}><dt>{label}</dt><dd>{project.brief[key] || "Not provided"}</dd></div>)}</dl>
          {project.status === "submitted" && data.permissions.canReview && <div className="onboarding-form">
            <label>Review note (required when requesting changes)<textarea maxLength={4000} value={note} onChange={e => setNote(e.target.value)} disabled={busy} /></label>
            <div className="onboarding-actions"><button disabled={busy} className="admin-primary-button" onClick={() => { if (window.confirm("Approve this brief? This does not build or publish a website.")) void mutate({action:"approve",id:project.id,revision:project.revision,note},"Brief approved. Website provisioning remains a separate step."); }}>Approve brief</button><button disabled={busy || !note.trim()} onClick={() => void mutate({action:"request_changes",id:project.id,revision:project.revision,note},"Changes requested. The client can edit the brief again in their portal.")}>Request changes</button></div>
          </div>}
          {project.status === "approved" && <p className="onboarding-success">Brief approved. Continue the project checklist in Tasks; automatic website provisioning is not enabled.</p>}
        </article> : <div className="onboarding-detail"><h3>Select a project</h3><p>View the brief and review its status here. Project checklists appear in Tasks.</p></div>}
      </div>
    </>}
  </section>;
}

