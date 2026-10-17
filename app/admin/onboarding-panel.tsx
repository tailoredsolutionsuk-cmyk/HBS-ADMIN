"use client";
import { useEffect, useState } from "react";
import { BRIEF_FIELDS, STATUS_LABELS, includesMetaAds, parseProject, type Project } from "../../lib/onboarding/model";
import { deliveryPacket, suggestedBuilderBrief, type DeliveryStep } from "../../lib/onboarding/delivery";
import type { Brief as BuilderBrief } from "../../lib/builder/model";
import { suggestedMetaProposal, type MetaProposal } from "../../lib/onboarding/meta-proposal";
import { onboardingRequest } from "../../lib/onboarding/client";
import "../onboarding.css";

type State = {
  projects: Project[];
  clients: { id: string; business_name: string; portal_enabled: boolean; portal_email: string | null }[];
  permissions: { canCreate: boolean; canReview: boolean; canStartWebsite: boolean };
  automation: { enabled: boolean; pending: number }; truncated: boolean;
};
function Workstream({ title, missing, steps }: { title: string; missing: string[]; steps: DeliveryStep[] }) {
  return <section className="onboarding-workstream"><h4>{title}</h4>
    <strong>Inputs and decisions still needed</strong><ul>{missing.map(item => <li key={item}>{item}</li>)}</ul>
    <strong>Delivery sequence</strong><ol>{steps.map(item => <li key={item.title}><b>{item.title}</b>: {item.outcome}<br /><small>Proof: {item.evidence}{item.ownerApproval ? " Owner approval required." : ""}</small></li>)}</ol>
  </section>;
}
function WebsiteDraftForm({ project, clientName, onOpenWebsite }: { project: Project; clientName: string; onOpenWebsite?: (siteId: string) => void }) {
  const [brief, setBrief] = useState<BuilderBrief>(() => suggestedBuilderBrief(project, clientName));
  const [siteId, setSiteId] = useState("");
  const [siteRevision, setSiteRevision] = useState<number | null>(null);
  const [previewRequested, setPreviewRequested] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const fields: { key: keyof BuilderBrief; label: string; max: number; required?: boolean }[] = [
    { key: "businessName", label: "Business name", max: 300, required: true },
    { key: "niche", label: "Industry or niche", max: 300, required: true },
    { key: "audience", label: "Audience", max: 300, required: true },
    { key: "services", label: "Services", max: 2000, required: true },
    { key: "goal", label: "Website goal", max: 300 },
    { key: "location", label: "Location", max: 300 },
    { key: "about", label: "About the business", max: 2000 },
    { key: "email", label: "Public email", max: 300 },
    { key: "phone", label: "Public phone", max: 40 },
  ];
  return <form className="onboarding-form onboarding-workstream" onSubmit={async event => {
    event.preventDefault(); setBusy(true); setError(""); setNotice("");
    try {
      const result = await onboardingRequest<{ siteId: string; revision: number; alreadyExisted: boolean; previewReady: boolean }>("/api/admin/onboarding/website-draft", { projectId: project.id, briefRevision: project.revision, builderBrief: brief });
      setSiteId(result.siteId);
      setSiteRevision(result.revision);
      setPreviewRequested(result.previewReady);
      setNotice(result.previewReady ? "Current private preview is ready. Open it in Website Studio." : result.alreadyExisted ? "Existing private draft found. Your form did not overwrite it." : "Private website draft saved. Review and build its preview in Website Studio.");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not create the draft."); }
    finally { setBusy(false); }
  }}>
    <h4>Prepare private website draft</h4><p>Review these values from the approved client brief. Fill any gaps before saving. This creates an editable draft only.</p>
    {fields.map(field => <label key={field.key}>{field.label}<textarea rows={field.max > 300 ? 3 : 1} maxLength={field.max} required={field.required} disabled={busy || Boolean(siteId)} value={brief[field.key]} onChange={event => setBrief({ ...brief, [field.key]: event.target.value })} /></label>)}
    <label>Style<select disabled={busy || Boolean(siteId)} value={brief.tone} onChange={event => setBrief({ ...brief, tone: event.target.value })}>{["Clean and professional", "Warm and approachable", "Bold and contemporary", "Elegant and established"].map(value => <option key={value}>{value}</option>)}</select></label>
    {error && <p role="alert" className="onboarding-error">{error}</p>}{notice && <p role="status" className="onboarding-success">{notice}</p>}
    <div className="onboarding-actions"><button className="admin-primary-button" disabled={busy || Boolean(siteId)}>{busy ? "Saving…" : "Create or open private draft"}</button>{siteId && onOpenWebsite && <button type="button" onClick={() => onOpenWebsite(siteId)}>Open in Website Studio</button>}{siteId && siteRevision !== null && <button type="button" disabled={busy || previewRequested} onClick={async () => {
      if (!window.confirm("Build a private hosted preview for this saved website revision? This can create a GitHub repository and Vercel project and use your hosting allowance. Nothing will be published to the client's live domain.")) return;
      setBusy(true); setError(""); setNotice("");
      try { await onboardingRequest("/api/admin/builder", { action: "preview", id: siteId, revision: siteRevision, requestId: crypto.randomUUID() }); setPreviewRequested(true); setNotice("Private preview job queued. Open Website Studio to check its status and review the result."); }
      catch (cause) { setError(cause instanceof Error ? cause.message : "Could not queue the preview."); }
      finally { setBusy(false); }
    }}>Build private preview</button>}</div>
  </form>;
}
type SavedMetaProposal = { revision: number; source_brief_revision: number; draft: MetaProposal; reviewed_revision: number | null; review_decision: "approved" | "changes_requested" | null; review_note: string | null };
type MetaAiRun = { id: string; model: string; status: "requested" | "succeeded" | "failed"; error_code: string | null; input_tokens: number | null; output_tokens: number | null; requested_at: string };
function MetaProposalForm({ project, canEdit, canOwnerReview }: { project: Project; canEdit: boolean; canOwnerReview: boolean }) {
  const [draft, setDraft] = useState<MetaProposal>(() => suggestedMetaProposal(project));
  const [proposalRevision, setProposalRevision] = useState<number | null>(null);
  const [review, setReview] = useState<Pick<SavedMetaProposal, "reviewed_revision" | "review_decision" | "review_note"> | null>(null);
  const [reviewNote, setReviewNote] = useState("");
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [aiRuns, setAiRuns] = useState<MetaAiRun[]>([]);
  useEffect(() => {
    let active = true;
    void onboardingRequest<{ proposal: SavedMetaProposal | null; previewUrl: string | null; aiRuns: MetaAiRun[] }>(`/api/admin/onboarding/meta-proposal?projectId=${encodeURIComponent(project.id)}`)
      .then(result => {
        if (!active) return;
        setAiRuns(result.aiRuns);
        if (result.proposal?.source_brief_revision !== undefined && result.proposal.source_brief_revision !== project.revision) { setError("This proposal is based on an older brief. Request a new review before editing."); return; }
        const source = result.proposal?.draft || suggestedMetaProposal(project);
        const needsLandingPage = Boolean(result.previewUrl && !source.landingPage);
        setDraft(needsLandingPage ? { ...source, landingPage: result.previewUrl! } : source);
        if (result.proposal) { setProposalRevision(result.proposal.revision); setReview(result.proposal); }
        setDirty(Boolean(result.proposal && needsLandingPage));
      })
      .catch(cause => { if (active) setError(cause instanceof Error ? cause.message : "Could not load the proposal."); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [project.id, project.revision]);
  const fields: { key: keyof MetaProposal; label: string; max: number }[] = [
    { key: "objective", label: "Campaign objective", max: 500 }, { key: "offer", label: "Offer", max: 1000 },
    { key: "audience", label: "Audience", max: 1000 }, { key: "geography", label: "Target geography", max: 500 },
    { key: "landingPage", label: "Landing page HTTPS URL (after preview is ready)", max: 500 },
    { key: "conversionEvent", label: "Conversion event", max: 500 }, { key: "budgetProposal", label: "Budget proposal, not approval", max: 500 },
    { key: "primaryText", label: "Primary ad text", max: 2000 }, { key: "headline", label: "Ad headline", max: 300 },
    { key: "creativeBrief", label: "Creative brief", max: 2000 }, { key: "assetRights", label: "Asset rights evidence", max: 1000 },
    { key: "accessRequestDraft", label: "Meta access request draft (not sent)", max: 2000 },
  ];
  return <form className="onboarding-form onboarding-workstream" onSubmit={async event => {
    event.preventDefault(); setBusy(true); setError(""); setNotice("");
    try {
      const result = await onboardingRequest<{ proposal: SavedMetaProposal }>("/api/admin/onboarding/meta-proposal", { action: "save", projectId: project.id, briefRevision: project.revision, expectedRevision: proposalRevision, draft });
      setProposalRevision(result.proposal.revision); setDraft(result.proposal.draft);
      setReview(result.proposal); setDirty(false);
      setNotice(`Meta campaign proposal revision ${result.proposal.revision} saved for review. No request was sent and no ad was created.`);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not save proposal."); }
    finally { setBusy(false); }
  }}>
    <h4>Meta Ads proposal</h4><p>Draft campaign details and an access request. A proposed budget is information for review, not permission to spend.</p>
    {loading && <p role="status">Loading saved proposal…</p>}
    {fields.map(field => <label key={field.key}>{field.label}<textarea rows={field.max > 500 ? 3 : 1} maxLength={field.max} disabled={busy || loading || !canEdit} value={draft[field.key]} onChange={event => { setDraft({ ...draft, [field.key]: event.target.value }); setDirty(true); }} /></label>)}
    {canOwnerReview && <div><button type="button" disabled={busy || loading} onClick={async () => {
      if (!window.confirm("Generate one Meta copy draft using your direct OpenAI API credits? The approved brief and proposal inputs will be sent to OpenAI. Nothing will be saved, shared or published automatically.")) return;
      setBusy(true); setError(""); setNotice("");
      try {
        const result = await onboardingRequest<{ proposal: MetaProposal; model: string; auditId: string; usage: { inputTokens?: number; outputTokens?: number } }>("/api/admin/onboarding/meta-proposal/generate", { projectId: project.id, briefRevision: project.revision, draft, aiConsent: true });
        setDraft(result.proposal); setDirty(true); setNotice(`Copy drafted with ${result.model}. Review every claim and save a proposal revision before sharing.`);
        setAiRuns(previous => [{ id: result.auditId, model: result.model, status: "succeeded" as const, error_code: null, input_tokens: result.usage.inputTokens ?? null, output_tokens: result.usage.outputTokens ?? null, requested_at: new Date().toISOString() }, ...previous].slice(0, 10));
      } catch (cause) { setError(cause instanceof Error ? cause.message : "AI copy draft could not be generated."); }
      finally { setBusy(false); }
    }}>Draft ad copy with JARVIS</button><p>Only the approved brief and this proposal are sent. AI text is a draft; check claims, asset rights and the offer before saving.</p></div>}
    {canOwnerReview && aiRuns.length > 0 && <details><summary>Recent JARVIS copy requests ({aiRuns.length})</summary><ul>{aiRuns.map(run => <li key={run.id}>{new Date(run.requested_at).toLocaleString()}: {run.status} · {run.model}{run.status === "succeeded" ? ` · ${run.input_tokens ?? "?"} input / ${run.output_tokens ?? "?"} output tokens` : run.error_code ? ` · ${run.error_code}` : ""}</li>)}</ul></details>}
    {error && <p role="alert" className="onboarding-error">{error}</p>}{notice && <p role="status" className="onboarding-success">{notice}</p>}
    <div className="onboarding-actions">{canEdit && <button className="admin-primary-button" disabled={busy || loading || (proposalRevision !== null && !dirty)}>{busy ? "Saving…" : proposalRevision === null ? "Save first proposal" : "Save new proposal revision"}</button>}{proposalRevision !== null && <span>Saved revision {proposalRevision}{dirty ? " · Unsaved edits" : ""}</span>}</div>
    {review?.review_decision && <p className="onboarding-info">Owner review: {review.review_decision === "approved" ? "Approved for client review" : "Changes requested"} on revision {review.reviewed_revision}{review.reviewed_revision !== proposalRevision ? " · A newer revision needs review" : ""}{review.review_note ? ` — ${review.review_note}` : ""}. This is not approval to spend or launch ads.</p>}
    {canOwnerReview && proposalRevision !== null && <div className="onboarding-actions"><label>Owner review note<textarea maxLength={4000} value={reviewNote} disabled={busy} onChange={event => setReviewNote(event.target.value)} /></label><button type="button" disabled={busy || dirty} onClick={async () => {
      if (!window.confirm(`Approve Meta proposal revision ${proposalRevision} for client review? This does not send it or authorise ad spending.`)) return;
      setBusy(true); setError(""); setNotice("");
      try { const result = await onboardingRequest<{ proposal: SavedMetaProposal }>("/api/admin/onboarding/meta-proposal", { action: "review", projectId: project.id, briefRevision: project.revision, expectedRevision: proposalRevision, decision: "approved", note: reviewNote }); setReview(result.proposal); setNotice(`Proposal revision ${proposalRevision} approved for client review. Nothing was sent.`); }
      catch (cause) { setError(cause instanceof Error ? cause.message : "Could not review proposal."); }
      finally { setBusy(false); }
    }}>Approve exact revision</button><button type="button" disabled={busy || dirty || !reviewNote.trim()} onClick={async () => {
      setBusy(true); setError(""); setNotice("");
      try { const result = await onboardingRequest<{ proposal: SavedMetaProposal }>("/api/admin/onboarding/meta-proposal", { action: "review", projectId: project.id, briefRevision: project.revision, expectedRevision: proposalRevision, decision: "changes_requested", note: reviewNote }); setReview(result.proposal); setNotice(`Changes requested on proposal revision ${proposalRevision}.`); }
      catch (cause) { setError(cause instanceof Error ? cause.message : "Could not review proposal."); }
      finally { setBusy(false); }
    }}>Request changes</button></div>}
  </form>;
}
type ReviewPacketState = { ready: boolean; packet: {id:string;site_revision:number;proposal_revision:number;released_at:string}|null; siteRevision:number|null; previewDeployment:string|null; previewUrl:string|null; proposalRevision:number|null; clientReview:{decision:string;feedback:string;reviewed_at:string}|null };
function ReviewPacketPanel({ project, canShare }: { project: Project; canShare: boolean }) {
  const [state,setState] = useState<ReviewPacketState | null>(null);
  const [qaNote,setQaNote] = useState(""); const [busy,setBusy] = useState(false);
  const [error,setError] = useState(""); const [notice,setNotice] = useState("");
  async function load() {
    setBusy(true); setError("");
    try { setState(await onboardingRequest<ReviewPacketState>(`/api/admin/onboarding/review-packet?projectId=${encodeURIComponent(project.id)}`)); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Could not load client review readiness."); }
    finally { setBusy(false); }
  }
  async function share() {
    if (!state?.ready || state.siteRevision === null || state.proposalRevision === null || !state.previewDeployment) return;
    if (!window.confirm(`Share website preview revision ${state.siteRevision} and Meta proposal revision ${state.proposalRevision} in this client's portal? This makes both visible to the client. No email will be sent.`)) return;
    setBusy(true); setError(""); setNotice("");
    try {
      await onboardingRequest("/api/admin/onboarding/review-packet", { action:"share", confirmed:true, projectId:project.id, siteRevision:state.siteRevision, previewDeployment:state.previewDeployment, proposalRevision:state.proposalRevision, qaNote });
      setNotice("Exact preview and proposal shared in this client's portal. No email was sent.");
      await load();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not share the packet."); }
    finally { setBusy(false); }
  }
  return <section className="onboarding-workstream"><h4>Client review packet</h4><p>Share only after checking all four website pages, mobile layout, public contact details and proposal claims.</p>
    <button type="button" disabled={busy} onClick={() => void load()}>{busy ? "Checking…" : "Check review readiness"}</button>
    {error && <p role="alert" className="onboarding-error">{error}</p>}{notice && <p role="status" className="onboarding-success">{notice}</p>}
    {state && !state.ready && <p>Build the current website preview, then complete and approve the Meta proposal with its matching landing page.</p>}
    {state?.ready && !state.packet && canShare && <><p>Ready: website revision {state.siteRevision} and Meta proposal revision {state.proposalRevision}. Sharing makes both visible in the client portal.</p><label>QA evidence and checks<textarea maxLength={4000} value={qaNote} onChange={event => setQaNote(event.target.value)} /></label><button type="button" disabled={busy || !qaNote.trim()} onClick={() => void share()}>Share exact packet with client portal</button></>}
    {state?.packet && <p className="onboarding-success">Shared for client review: website revision {state.packet.site_revision}, proposal revision {state.packet.proposal_revision}. {state.clientReview ? `Client ${state.clientReview.decision === "approved" ? "approved" : "requested changes"}${state.clientReview.feedback ? `: ${state.clientReview.feedback}` : ""}.` : "Waiting for client response."}</p>}
  </section>;
}
export default function OnboardingPanel({ initialClientId = "", onOpenWebsite }: { initialClientId?: string; onOpenWebsite?: (siteId: string) => void }) {
  const [data, setData] = useState<State | null>(null);
  const [error, setError] = useState(""); const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false); const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(Boolean(initialClientId));
  const [requestId, setRequestId] = useState("");
  const [form, setForm] = useState({ client_id: initialClientId, name: "", service: "Website and Meta Ads", target_date: "" });
  const [selected, setSelected] = useState<string | null>(null); const [note, setNote] = useState("");
  async function load() {
    setLoading(true);
    try { setData(await onboardingRequest<State>("/api/admin/onboarding")); }
    catch (e) { setError(e instanceof Error ? e.message : "Could not load projects."); }
    finally { setLoading(false); }
  }
  useEffect(() => { void load(); }, []);
  const project = data?.projects.find(p => p.id === selected);
  const packet = project?.status === "approved" ? deliveryPacket(project, data?.clients.find(c => c.id === project.client_id)?.business_name || "Client name needs confirmation") : null;
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
        <label>Service<input required maxLength={100} list="onboarding-services" disabled={busy || Boolean(requestId)} value={form.service} onChange={e => setForm({ ...form, service: e.target.value })} /><datalist id="onboarding-services"><option value="Website and Meta Ads" /><option value="Website build" /></datalist><small>Choose “Website and Meta Ads” to enable the combined client review and release gates.</small></label>
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
          {packet && <div className="onboarding-handoff"><p className="onboarding-success">Delivery handoff prepared from approved brief revision {packet.briefRevision}. Continue the checklist in Tasks.</p>
            <p>First-phase outcome: a private website preview and a Meta campaign proposal for review. Review the Website Studio brief below before creating a draft. Building a hosted preview is a separate step; no Meta campaign is created.</p>
            <Workstream title="Website development" missing={packet.website.missing} steps={packet.website.steps} />
            {data.permissions.canStartWebsite && <WebsiteDraftForm key={project.id} project={project} clientName={packet.website.clientName} onOpenWebsite={onOpenWebsite} />}
            {includesMetaAds(project.service) && <><Workstream title="Meta Ads campaign" missing={packet.metaAds.missing} steps={packet.metaAds.steps} />
            <MetaProposalForm key={project.id} project={project} canEdit={data.permissions.canReview} canOwnerReview={data.permissions.canStartWebsite} />
            <ReviewPacketPanel key={`${project.id}-review`} project={project} canShare={data.permissions.canStartWebsite} /></>}
          </div>}
        </article> : <div className="onboarding-detail"><h3>Select a project</h3><p>View the brief and review its status here. Project checklists appear in Tasks.</p></div>}
      </div>
    </>}
  </section>;
}

