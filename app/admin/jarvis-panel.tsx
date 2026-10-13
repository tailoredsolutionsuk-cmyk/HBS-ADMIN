"use client";

import { FormEvent, useEffect, useState } from "react";

type Message = { id: number; role: "user" | "assistant"; content: string; created_at?: string };
type Conversation = { id: string; title: string; created_at: string; updated_at: string };
type KnowledgeNote = { id: string; content: string; created_at: string };
type Approval = { id: string; action_type: string; status: string; payload: { title?: string; client_name?: string; due_date?: string; priority?: string }; created_at: string };
type Briefing = { date: string; message: string; stats: { clients: number; open_leads: number; open_tasks: number; overdue_tasks: number; overdue_follow_ups: number }; priorities: Array<{ kind: string; title: string; detail: string; tone: string }>; approvals: number };

const errors: Record<string, string> = {
  AI_AUTH_FAILED: "The AI Gateway connection was rejected.",
  AI_BILLING_REQUIRED: "Vercel AI Gateway needs a valid payment method.",
  AI_BUDGET_REACHED: "The AI budget limit has been reached.",
  AI_MODEL_UNAVAILABLE: "The selected AI model is unavailable.",
  AI_RATE_LIMITED: "JARVIS is busy right now. Please try again shortly.",
  CONVERSATION_NOT_FOUND: "This conversation is unavailable. Open another chat or create a new one.",
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
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeConversation, setActiveConversation] = useState<Conversation | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [knowledge, setKnowledge] = useState<KnowledgeNote[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [opening, setOpening] = useState(false);
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
    setConversations(body.conversations ?? []);
    return body.conversations as Conversation[];
  }

  async function openConversation(id: string) {
    setOpening(true);
    setError("");
    try {
      const response = await fetch(`/api/admin/jarvis?conversation_id=${encodeURIComponent(id)}`, { cache: "no-store" });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(errors[body.error] || "This conversation could not be opened.");
      setActiveConversation(body.conversation);
      setMessages(body.messages ?? []);
      setKnowledge(body.knowledge ?? []);
      setHasMore(Boolean(body.hasMore));
    } catch (issue) { setError(issue instanceof Error ? issue.message : "This conversation could not be opened."); }
    finally { setOpening(false); }
  }

  useEffect(() => {
    load().then((saved) => saved?.[0] ? openConversation(saved[0].id) : undefined)
      .catch((issue) => setError(issue instanceof Error ? issue.message : "JARVIS could not load."))
      .finally(() => setLoading(false));
  }, []);

  async function createConversation() {
    if (thinking || opening) return;
    setOpening(true);
    setError("");
    try {
      const response = await fetch("/api/admin/jarvis", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "create_conversation" }) });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(errors[body.error] || "A new conversation could not be created.");
      setConversations((current) => [body.conversation, ...current]);
      setActiveConversation(body.conversation);
      setMessages([]);
      setKnowledge([]);
      setHasMore(false);
      setPrompt("");
    } catch (issue) { setError(issue instanceof Error ? issue.message : "A new conversation could not be created."); }
    finally { setOpening(false); }
  }

  async function loadOlder() {
    if (!activeConversation || !messages.length || opening) return;
    setOpening(true);
    try {
      const before = messages[0].id;
      const response = await fetch(`/api/admin/jarvis?conversation_id=${encodeURIComponent(activeConversation.id)}&before=${before}`, { cache: "no-store" });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(errors[body.error] || "Earlier messages could not be loaded.");
      setMessages((current) => [...(body.messages ?? []), ...current]);
      setHasMore(Boolean(body.hasMore));
    } catch (issue) { setError(issue instanceof Error ? issue.message : "Earlier messages could not be loaded."); }
    finally { setOpening(false); }
  }

  async function ask(event?: FormEvent) {
    event?.preventDefault();
    const value = prompt.trim();
    if (!value || thinking || !activeConversation) return;
    const conversationId = activeConversation.id;
    const optimisticId = -Date.now();
    setMessages((current) => [...current, { id: optimisticId, role: "user", content: value }]);
    setPrompt("");
    setThinking(true);
    setError("");
    try {
      const response = await fetch("/api/admin/jarvis", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "chat", conversation_id: conversationId, message: value }) });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(errors[body.error] || "JARVIS could not answer.");
      setMessages((current) => [...current.filter((item) => item.id !== optimisticId), body.userMessage, body.assistantMessage]);
      setActiveConversation(body.conversation);
      setConversations((current) => [{ ...body.conversation, updated_at: new Date().toISOString() }, ...current.filter((item) => item.id !== conversationId)]);
      if (body.memorySaved) setKnowledge((current) => [{ id: String(body.userMessage.id), content: value, created_at: body.userMessage.created_at }, ...current].slice(0, 12));
      else setError("The answer was saved, but its searchable memory could not be indexed. The chat transcript remains available.");
      setApprovals(body.approvals ?? []);
    } catch (issue) {
      const message = issue instanceof Error ? issue.message : "JARVIS could not answer.";
      await openConversation(conversationId);
      setError(message);
    }
    finally { setThinking(false); }
  }

  async function review(id: string, action: "approve" | "reject") {
    setReviewing(id);
    setError("");
    try {
      const response = await fetch("/api/admin/jarvis", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action, id, conversation_id: activeConversation?.id }) });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(errors[body.error] || "The approval could not be completed.");
      await load();
      if (activeConversation) await openConversation(activeConversation.id);
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
    <section className="admin-panel admin-jarvis-conversations"><div className="admin-panel-heading"><div><span className="admin-section-kicker">Saved chats</span><h3>Conversations</h3></div><button className="admin-primary-button" disabled={thinking || opening} onClick={createConversation}>+ New chat</button></div><div className="admin-jarvis-conversation-list" aria-label="Saved JARVIS conversations">{conversations.length ? conversations.map((conversation) => <button key={conversation.id} className={activeConversation?.id === conversation.id ? "active" : ""} aria-pressed={activeConversation?.id === conversation.id} disabled={thinking || opening} onClick={() => openConversation(conversation.id)}><strong>{conversation.title}</strong><small>{new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short" }).format(new Date(conversation.updated_at))}</small></button>) : <p className="admin-crm-empty">No saved conversations yet. Open a new chat to begin.</p>}</div></section>
    <div className="admin-jarvis-chat-grid"><section className="admin-panel admin-ai-panel"><div className="admin-panel-heading"><div><span className="admin-section-kicker">Ask JARVIS</span><h3>{activeConversation?.title || "Start a conversation"}</h3></div><span className="admin-jarvis-safe">Private per admin · Approval required for writes</span></div>{hasMore && <button className="admin-text-button" disabled={opening} onClick={loadOlder}>Load earlier messages</button>}<div className="admin-ai-messages" aria-live="polite">{opening && !messages.length ? <p className="admin-crm-empty">Opening conversation…</p> : messages.length ? messages.map((message) => <article className={`admin-ai-message ${message.role === "user" ? "admin" : "assistant"}`} key={message.id}><span>{message.role === "user" ? "You" : "JARVIS"}</span><p>{message.content}</p></article>) : <div className="admin-empty-state compact"><strong>No messages yet</strong><p>Open a new chat, then ask JARVIS about the CRM or your plans.</p></div>}{thinking && <article className="admin-ai-message assistant"><span>JARVIS</span><p>Reviewing this conversation and the CRM…</p></article>}</div><div className="admin-ai-starters">{starters.map((starter) => <button key={starter} disabled={!activeConversation || thinking} onClick={() => setPrompt(starter)}>{starter}</button>)}</div><form className="admin-ai-composer" onSubmit={ask}><textarea value={prompt} onChange={(event) => setPrompt(event.target.value)} placeholder={activeConversation ? "Ask about leads, clients, tasks or priorities…" : "Open a new chat to ask JARVIS…"} rows={3} maxLength={2500} disabled={!activeConversation || thinking} /><button className="admin-primary-button" disabled={!activeConversation || !prompt.trim() || thinking}>{thinking ? "Thinking…" : "Ask JARVIS"}</button></form></section>
      <aside className="admin-panel admin-jarvis-knowledge" aria-label="Conversation knowledge base"><div className="admin-panel-heading"><div><span className="admin-section-kicker">This chat only</span><h3>Knowledge base</h3></div></div><p>JARVIS can recall your earlier statements in this conversation. Notes are searchable history, not verified CRM facts.</p>{knowledge.length ? <ul>{knowledge.map((note) => <li key={note.id}>{note.content}</li>)}</ul> : <div className="admin-empty-state compact"><strong>No notes yet</strong><p>Your messages become searchable as you chat, even if an answer fails.</p></div>}</aside></div>
  </div>;
}
