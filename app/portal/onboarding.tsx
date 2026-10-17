"use client";
import { useEffect, useState } from "react";
import { BRIEF_FIELDS, EMPTY_BRIEF, STATUS_LABELS, editableBrief, includesMetaAds, type Brief, type Project } from "../../lib/onboarding/model";
import { onboardingRequest } from "../../lib/onboarding/client";
import { PAGE_KEYS, PAGE_NAMES, type PageKey } from "../../lib/builder/model";
import type { MetaProposal } from "../../lib/onboarding/meta-proposal";
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
      {BRIEF_FIELDS.map(([key,label],index) => <label key={key}>{label}{index<4 ? " (required to submit)" : " (optional)"}<textarea maxLength={key === "publicEmail" ? 300 : key === "publicPhone" ? 40 : 4000} required={index<4} disabled={busy || !editable} value={brief[key]} onChange={e => { setBrief({...brief,[key]:e.target.value}); setDirty(true); }} /></label>)}
      {editable && <div className="onboarding-actions"><button type="button" disabled={busy} onClick={() => void save("save")}>{busy ? "Saving…" : "Save draft"}</button><button disabled={busy} className="onboarding-primary">Submit brief for review</button><span>{dirty ? "Unsaved changes" : "Up to date"}</span></div>}
    </form>
  </article>;
}
type ClientPacket = { id: string; site_revision: number; proposal_revision: number; released_at: string };
function PortalReviewPacket({ project }: { project: Project }) {
  const [open,setOpen] = useState(false), [busy,setBusy] = useState(false);
  const [packet,setPacket] = useState<ClientPacket | null>(null), [proposal,setProposal] = useState<MetaProposal | null>(null);
  const [page,setPage] = useState<PageKey>("home"), [html,setHtml] = useState("");
  const [review,setReview] = useState<{decision:string;feedback:string} | null>(null);
  const [feedback,setFeedback] = useState(""), [error,setError] = useState(""), [notice,setNotice] = useState("");
  async function load(nextPage: PageKey) {
    setBusy(true); setError("");
    try {
      const result = await onboardingRequest<{packet:ClientPacket|null;proposal?:MetaProposal;previewHtml?:string;review?:{decision:string;feedback:string}|null}>(`/api/portal/onboarding/review-packet?projectId=${encodeURIComponent(project.id)}&page=${nextPage}`);
      setPacket(result.packet); setProposal(result.proposal || null); setHtml(result.previewHtml || ""); setReview(result.review || null); setPage(nextPage); setOpen(true);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not load your review packet."); }
    finally { setBusy(false); }
  }
  async function respond(decision: "approved" | "changes_requested") {
    if (!packet) return;
    if (decision === "approved" && !window.confirm("Approve this website preview and Meta proposal for this review round? This does not approve ad spend or a live launch.")) return;
    setBusy(true); setError(""); setNotice("");
    try {
      const result = await onboardingRequest<{review:{decision:string;feedback:string}}>("/api/portal/onboarding/review-packet", {action:"review",projectId:project.id,packetId:packet.id,decision,feedback});
      setReview(result.review); setNotice(decision === "approved" ? "Your approval was recorded for this exact preview and proposal." : "Your feedback was recorded for HBS.");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not record your feedback."); }
    finally { setBusy(false); }
  }
  return <section className="onboarding-workstream"><h4>Website and Meta Ads review</h4>
    {!open && <button type="button" disabled={busy} onClick={() => void load("home")}>{busy ? "Loading…" : "Open review packet"}</button>}
    {error && <p role="alert" className="onboarding-error">{error}</p>}{notice && <p role="status" className="onboarding-success">{notice}</p>}
    {open && !packet && <p>No current review packet has been shared yet. HBS will prepare a new one if the website or proposal changes.</p>}
    {packet && proposal && <><p>Review packet shared {new Intl.DateTimeFormat("en-GB").format(new Date(packet.released_at))}. Website revision {packet.site_revision}; Meta proposal revision {packet.proposal_revision}.</p>
      <div className="onboarding-actions" role="group" aria-label="Website preview pages">{PAGE_KEYS.map(key => <button type="button" key={key} disabled={busy} aria-pressed={page===key} onClick={() => void load(key)}>{PAGE_NAMES[key]}</button>)}</div>
      <iframe title={`${PAGE_NAMES[page]} website preview`} sandbox="" referrerPolicy="no-referrer" srcDoc={html} className="onboarding-client-preview" />
      <h5>Meta Ads proposal</h5><dl>{([ ["Objective",proposal.objective], ["Offer",proposal.offer], ["Audience",proposal.audience], ["Geography",proposal.geography], ["Proposed budget",proposal.budgetProposal], ["Primary ad text",proposal.primaryText], ["Headline",proposal.headline], ["Creative",proposal.creativeBrief], ["Landing page",proposal.landingPage], ["Conversion event",proposal.conversionEvent], ["Asset rights",proposal.assetRights] ] as const).map(([label,value]) => <div key={label}><dt>{label}</dt><dd>{value || "To be confirmed"}</dd></div>)}</dl>
      <p>A proposal budget and this review do not authorise HBS to spend money or launch ads. HBS will request separate approval before any live release.</p>
      {review && <p className="onboarding-info">Your latest response: {review.decision === "approved" ? "Approved" : "Changes requested"}{review.feedback ? ` — ${review.feedback}` : ""}.</p>}
      <label>Feedback for HBS<textarea maxLength={4000} value={feedback} disabled={busy} onChange={event => setFeedback(event.target.value)} /></label>
      <div className="onboarding-actions"><button type="button" disabled={busy} onClick={() => void respond("approved")}>Approve this review packet</button><button type="button" disabled={busy || !feedback.trim()} onClick={() => void respond("changes_requested")}>Request changes</button></div>
    </>}
  </section>;
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
    {projects.map(project => <div key={project.id}><BriefForm project={project} onSaved={load} />{project.status === "approved" && includesMetaAds(project.service) && <PortalReviewPacket project={project} />}</div>)}
  </section>;
}

