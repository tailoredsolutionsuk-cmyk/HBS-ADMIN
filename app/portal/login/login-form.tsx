"use client";

import { type FormEvent, useState } from "react";

export default function PortalLoginForm() {
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch("/api/portal/login-link", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const body = await response.json();
      setMessage(body.message || body.error || "Please try again.");
    } catch {
      setMessage("The portal could not send a sign-in link. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return <form className="portal-login-form" onSubmit={submit}><label>Work email<input type="email" autoComplete="email" required maxLength={320} value={email} onChange={(event) => setEmail(event.target.value)} placeholder="you@business.co.uk" /></label><button disabled={busy}>{busy ? "Sending secure link…" : "Email me a sign-in link"}</button>{message && <p role="status">{message}</p>}</form>;
}
