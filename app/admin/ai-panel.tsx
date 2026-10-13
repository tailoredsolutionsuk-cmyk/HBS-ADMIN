"use client";

import { FormEvent, useState } from "react";

type Message = { role: "admin" | "assistant"; text: string };
const starters = ["Draft a friendly follow-up to a fictional new lead.", "Suggest three ways a small business can improve its website.", "Write a short, generic marketing checklist."];

const aiErrors: Record<string, string> = {
  AI_AUTH_FAILED: "The AI Gateway connection was rejected. An administrator needs to reconnect it in Vercel.",
  AI_BILLING_REQUIRED: "Vercel AI Gateway needs a valid payment method before it can unlock the included free credits.",
  AI_BUDGET_REACHED: "The AI budget limit has been reached.",
  AI_MODEL_UNAVAILABLE: "The selected AI model is unavailable. An administrator needs to choose a supported Vercel AI Gateway model.",
  AI_RATE_LIMITED: "The AI assistant is busy right now. Please wait a moment and try again.",
  AI_SCOPE_REQUIRED: "Only owners and admins can use the AI assistant.",
  AI_UNAVAILABLE: "The AI assistant is temporarily unavailable. Please try again.",
};

export default function AiPanel() {
  const [messages, setMessages] = useState<Message[]>([{ role: "assistant", text: "I can help draft and brainstorm from what you type here. I do not read your CRM records. What would you like to work on?" }]);
  const [prompt, setPrompt] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function ask(event?: FormEvent) {
    event?.preventDefault();
    const message = prompt.trim();
    if (!message || loading) return;
    setMessages((current) => [...current, { role: "admin", text: message }]);
    setPrompt("");
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/admin/ai", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ message }) });
      const body = await response.json();
      if (!response.ok) throw new Error(aiErrors[body.error] || "The AI assistant is temporarily unavailable. Please try again.");
      setMessages((current) => [...current, { role: "assistant", text: body.text }]);
    } catch (issue) { setError(issue instanceof Error ? issue.message : "AI is unavailable."); }
    finally { setLoading(false); }
  }

  function useStarter(value: string) { setPrompt(value); }

  return <div className="admin-ai-view">
    <section className="admin-welcome"><div><span className="admin-kicker">Vercel AI SDK · Prompt-only trial</span><h2>HBS AI assistant</h2><p>Only what you type is sent to Vercel AI Gateway. During the free-model trial, do not enter client names, contact details or confidential business information: the model provider may retain prompts and responses.</p></div><span className="admin-analytics-live"><i />Admin scope</span></section>
    <section className="admin-panel admin-ai-panel">
      <div className="admin-ai-messages">{messages.map((message, index) => <article className={`admin-ai-message ${message.role}`} key={`${message.role}-${index}`}><span>{message.role === "assistant" ? "HBS AI" : "You"}</span><p>{message.text}</p></article>)}{loading && <article className="admin-ai-message assistant"><span>HBS AI</span><p>Thinking…</p></article>}</div>
      {error && <p className="admin-crm-error" role="alert">{error}</p>}
      <div className="admin-ai-starters">{starters.map((starter) => <button key={starter} onClick={() => useStarter(starter)}>{starter}</button>)}</div>
      <form className="admin-ai-composer" onSubmit={ask}><textarea value={prompt} onChange={(event) => setPrompt(event.target.value)} placeholder="Try a general marketing question with fictional details…" rows={3} maxLength={2500} /><button className="admin-primary-button" disabled={!prompt.trim() || loading}>{loading ? "Thinking…" : "Ask HBS AI"}</button></form>
    </section>
  </div>;
}

