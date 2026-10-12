"use client";

import { FormEvent, useEffect, useState } from "react";

type Message = { role: "user" | "assistant"; content: string };
type Approval = { id: string; action_type: string; status: string; payload: { title?: string; client_name?: string; due_date?: string; priority?: string }; created_at: string };
type Briefing = { date: string; message: string; stats: { clients: number; open_leads: number; open_tasks: number; overdue_tasks: number; overdue_follow_ups: number }; priorities: Array<{ kind: string; title: string; detail: string; tone: string }>; approvals: number };

const errors: Record<string, string> = {
  AI_AUTH_FAILED: "The AI Gateway connection was rejected.",
  AI_BILLING_REQUIRED: "Vercel AI Gateway needs a valid payment method.",
  AI_BUDGET_REACHED: "The AI budget limit has been reached.",
  AI_MODEL_UNAVAILABLE: "The selected AI model is unavailable.",
  AI_RATE_LIMITED: "JARVIS is busy right now. Please try again shortly.",
  JARVIS_DATA_UNAVAILABLE: "JARVIS could not read the CRM briefing.",
  JARVIS_UNAVAILABLE: "JARVIS is temporarily unavailable.",
};

const starters = ["Give me today’s priorities.", "Summarise the pipeline and flag the best opportunity.", "Create a follow-up task for the most urgent lead."];

function dateLabel(value: string) {
  return new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short" }).format(new Date(`${value}T12:00:00`));
}

export default function JarvisPanel() {
  const [brief, setBrief] = useState<Briefing | null>(null);
  const [approvals, setApprovals] = useState<Approval[]>([]);
  const [messages, setMessages] = useState<Message[]>([{ role: "assistant", content: "I’m JARVIS V1. I can read the live CRM, explain today’s priorities, and prepare tasks for your approval." }]);
  const [prompt, setPrompt] = useState("");
  const [loading, setLoading] = useState(true);
  const [thinking, setThinking] = useState(false);
  const [error, setError] = useState("");
  const [reviewing, setReviewing] = useState<string | null>(null);

  async function load() {
    const response = await fetch("/api/admin/jarvis", { cache: "no-store" });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(errors[body.error] || "JARVIS could not load.");
    setBrief(body.briefing);
    setApprovals(body.approvals ?? []);
  }

  useEffect(() => { load().catch((issue) => setError(issue instanceof Error ? issue.message : "JARVIS could not load.")).finally(() => setLoading(false)); }, []);

  async function ask(event?: FormEvent) {
    event?.preventDefault();
    const value = prompt.trim();
    if (!value || thinking) return;
    const nextMessages = [...messages, { role: "user" as const, content: value }];
    setMessages(nextMessages);
    setPrompt("");
    setThinking(true);
    setError("");
    try {
      const response = await fetch("/api/admin/jarvis", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "chat", message: value, history: nextMessages }) });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(errors[body.error] || "JARVIS could not answer.");
      setMessages((current) => [...current, { role: "assistant", content: body.text }]);
      setApprovals(body.approvals ?? []);
    } catch (issue) { setError(issue instanceof Error ? issue.message : "JARVIS could not answer."); }
    finally { setThinking(false); }
  }

  async function review(id: string, action: "approve" | "reject") {
    setReviewing(id);
    setError("");
    try {
      const response = await fetch("/api/admin/jarvis", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action, id }) });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(errors[body.error] || "The approval could not be completed.");
      await load();
      setMessages((current) => [...current, { role: "assistant", content: action === "approve" ? "Approved. The task is now in the CRM task list." : "Rejected. I left the CRM unchanged." }]);
    } catch (issue) { setError(issue instanceof Error ? issue.message : "The approval could not be completed."); }
    finally { setReviewing(null); }
  }

  return <div className="admin-jarvis-view">
    <section className="admin-welcome admin-jarvis-welcome"><div><span className="admin-kicker">JARVIS V1 · Read-only CRM intelligence</span><h2>Good morning, Harley.</h2><p>{brief ? `${dateLabel(brief.date)} · ${brief.message}` : "Loading your daily operating brief…"}</p></div><span className="admin-analytics-live"><i />Approval required for writes</span></section>
    {error && <p className="admin-crm-error" role="alert">{error}</p>}
    {loading ? <section className="admin-panel admin-crm-loading" aria-busy="true"><span className="admin-loading-pulse" />Preparing your briefing…</section> : <>
      <section className="admin-jarvis-stats" aria-label="JARVIS daily briefing"><article><span>Active clients</span><strong>{brief?.stats.clients ?? 0}</strong></article><article><span>Open pipeline</span><strong>{brief?.stats.open_leads ?? 0}</strong></article><article><span>Open tasks</span><strong>{brief?.stats.open_tasks ?? 0}</strong></article><article className={(brief?.stats.overdue_tasks ?? 0) + (brief?.stats.overdue_follow_ups ?? 0) ? "attention" : ""}><span>Needs attention</span><strong>{(brief?.stats.overdue_tasks ?? 0) + (brief?.stats.overdue_follow_ups ?? 0)}</strong></article></section>
      <div className="admin-jarvis-grid"><section className="admin-panel"><div className="admin-panel-heading"><div><span className="admin-section-kicker">Today</span><h3>Priority queue</h3></div><span className="admin-client-analytics-count">{brief?.priorities.length ?? 0} items</span></div>{brief?.priorities.length ? <div className="admin-jarvis-priorities">{brief.priorities.map((item, index) => <div key={`${item.kind}-${item.title}-${index}`}><span className={`admin-jarvis-priority ${item.tone}`}>!</span><span><strong>{item.title}</strong><small>{item.detail}</small></span></div>)}</div> : <div className="admin-empty-state compact"><span>✓</span><strong>No overdue priorities</strong><p>Ask JARVIS to review the wider pipeline.</p></div>}</section>
        <section className="admin-panel"><div className="admin-panel-heading"><div><span className="admin-section-kicker">Human review</span><h3>Approvals</h3></div><span className="admin-client-analytics-count">{approvals.length} pending</span></div>{approvals.length ? <div className="admin-jarvis-approvals">{approvals.map((approval) => <article key={approval.id}><div><strong>{approval.payload.title || "CRM task"}</strong><small>{approval.payload.client_name || "HBS internal"}{approval.payload.due_date ? ` · Due ${dateLabel(approval.payload.due_date)}` : ""} · {approval.payload.priority || "medium"}</small></div><div><button className="admin-primary-button" disabled={reviewing === approval.id} onClick={() => review(approval.id, "approve")}>{reviewing === approval.id ? "Saving…" : "Approve"}</button><button className="admin-text-button" disabled={reviewing === approval.id} onClick={() => review(approval.id, "reject")}>Reject</button></div></article>)}</div> : <p className="admin-crm-empty">No actions are waiting for approval.</p>}</section></div>
    </>}
    <section className="admin-panel admin-ai-panel"><div className="admin-panel-heading"><div><span className="admin-section-kicker">Ask JARVIS</span><h3>CRM command panel</h3></div><span className="admin-jarvis-safe">No secrets in prompts</span></div><div className="admin-ai-messages">{messages.map((message, index) => <article className={`admin-ai-message ${message.role === "user" ? "admin" : "assistant"}`} key={`${message.role}-${index}`}><span>{message.role === "user" ? "You" : "JARVIS"}</span><p>{message.content}</p></article>)}{thinking && <article className="admin-ai-message assistant"><span>JARVIS</span><p>Reviewing the CRM…</p></article>}</div><div className="admin-ai-starters">{starters.map((starter) => <button key={starter} onClick={() => setPrompt(starter)}>{starter}</button>)}</div><form className="admin-ai-composer" onSubmit={ask}><textarea value={prompt} onChange={(event) => setPrompt(event.target.value)} placeholder="Ask about leads, clients, tasks or priorities…" rows={3} maxLength={2500} /><button className="admin-primary-button" disabled={!prompt.trim() || thinking}>{thinking ? "Thinking…" : "Ask JARVIS"}</button></form></section>
  </div>;
}
