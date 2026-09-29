"use client";
import { useEffect, useState } from "react";
import { BRIEF_FIELDS, EMPTY_BRIEF, STATUS_LABELS, editableBrief, type Brief, type Project } from "../../lib/onboarding/model";
import { onboardingRequest } from "../../lib/onboarding/client";
import "../onboarding.css";

function BriefForm({ project, onSaved }: { project: Project; onSaved: () => Promise<void> }) {
  const [brief,setBrief] = useState<Brief>({ ...EMPTY_BRIEF,...project.brief });
  const [busy,setBusy] = useState(false); const [error,setError] = useState(""); const [notice,setNotice] = useState("");
  const [version,setVersion] = useState(project.revision);
  const [status,setStatus] = useState(project.status);
  const [dirty,setDirty] = useState(false);
  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ""; };
    window.addEventListener("beforeunload",warn);
    return () => window.removeEventListener("beforeunload",warn);
  },[dirty]);
  async function save(action: "save" | "submit") {
    setBusy(true); setError(""); setNotice("");
    try {
      const result = await onboardingRequest<{project: {revision:number;status:Project["status"]}}>("/api/portal/onboarding", { action,id:project.id,revision:version,brief });
      setVersion(result.project.revision); setStatus(result.project.status); setDirty(false);
      setNotice(action === "save" ? "Draft saved." : "Brief submitted to HBS for review.");
      await onSaved();
    } catch(e) { setError(e instanceof Error ? e.message : "Could not save your brief."); }
    finally { setBusy(false); }
  }
  const editable = editableBrief(status);
  return <article className="onboarding-detail">
    <h3>{project.name}</h3><p>{STATUS_LABELS[status]}</p>
    {project.review_note && <p className="onboarding-info">HBS feedback: {project.review_note}</p>}
    <p>Tell us what you need for this project. Do not include passwords, API keys or payment details.</p>
    {error && <p role="alert" className="onboarding-error">{error} Your text is kept here. Copy any unsaved changes before reloading if the project changed elsewhere.</p>}
    {notice && <p role="status" className="onboarding-success">{notice}</p>}
    <form className="onboarding-form" onSubmit={e => { e.preventDefault(); void save("submit"); }}>
      {BRIEF_FIELDS.map(([key,label],index) => <label key={key}>{label}{index<4 ? " (required to submit)" : " (optional)"}<textarea maxLength={4000} required={index<4} disabled={busy || !editable} value={brief[key]} onChange={e => { setBrief({...brief,[key]:e.target.value}); setDirty(true); }} /></label>)}
      {editable && <div className="onboarding-actions"><button type="button" disabled={busy} onClick={() => void save("save")}>{busy ? "Saving…" : "Save draft"}</button><button disabled={busy} className="onboarding-primary">Submit brief for review</button><span>{dirty ? "Unsaved changes" : "Up to date"}</span></div>}
    </form>
  </article>;
}
export default function PortalOnboarding() {
  const [projects,setProjects] = useState<Project[]>([]); const [error,setError] = useState("");
  const [loading,setLoading] = useState(true); const [truncated,setTruncated] = useState(false);
  async function load() {
    try { const data = await onboardingRequest<{projects:Project[];truncated:boolean}>("/api/portal/onboarding"); setProjects(data.projects); setTruncated(data.truncated); setError(""); }
    catch(e) { setError(e instanceof Error ? e.message : "Could not load project briefs."); }
    finally { setLoading(false); }
  }
  useEffect(() => { void load(); },[]);
  return <section className="portal-card portal-updates onboarding">
    <h2>Your project briefs</h2>
    {loading && <p role="status">Loading projects…</p>}
    {error && <p role="alert" className="onboarding-error">{error} <button onClick={() => void load()}>Try again</button></p>}
    {!loading && !error && !projects.length && <p>Your HBS team will add your project here when onboarding starts.</p>}
    {truncated && <p>Showing your latest 100 projects. Contact HBS for older projects.</p>}
    {projects.map(project => <BriefForm key={project.id} project={project} onSaved={load} />)}
  </section>;
}

