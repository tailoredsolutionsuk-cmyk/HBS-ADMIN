"use client";

import { useRouter } from "next/navigation";
import { type FormEvent, useState } from "react";

export default function PortalLoginForm() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [step, setStep] = useState<"email" | "code">("email");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  async function requestCode(event: FormEvent<HTMLFormElement>) {
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
      if (!response.ok) throw new Error(body.error || "The portal could not send a sign-in code.");
      setStep("code");
      setMessage(body.message || "Check your inbox for your six-digit code.");
    } catch (issue) {
      setMessage(issue instanceof Error ? issue.message : "The portal could not send a sign-in code. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  async function verifyCode(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch("/api/portal/verify-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, code }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "That code is invalid or has expired.");
      router.replace("/portal");
      router.refresh();
    } catch (issue) {
      setMessage(issue instanceof Error ? issue.message : "That code is invalid or has expired.");
      setBusy(false);
    }
  }

  if (step === "email") {
    return <form className="portal-login-form" onSubmit={requestCode}><label>Work email<input type="email" autoComplete="email" required maxLength={320} value={email} onChange={(event) => setEmail(event.target.value)} placeholder="you@business.co.uk" /></label><button disabled={busy}>{busy ? "Sending code…" : "Email me a sign-in code"}</button>{message && <p role="status">{message}</p>}</form>;
  }

  return <form className="portal-login-form" onSubmit={verifyCode}><p className="portal-code-sent">Code sent to <strong>{email}</strong></p><label>Six-digit code<input className="portal-otp-input" inputMode="numeric" autoComplete="one-time-code" autoFocus maxLength={6} pattern="[0-9]{6}" required value={code} onChange={(event) => setCode(event.target.value.replace(/\D/g, "").slice(0, 6))} placeholder="000000" /></label><button disabled={busy || code.length !== 6}>{busy ? "Verifying…" : "Verify and sign in"}</button><button className="portal-text-button" type="button" disabled={busy} onClick={() => { setStep("email"); setCode(""); setMessage(""); }}>Request a new code</button>{message && <p role="status">{message}</p>}</form>;
}
