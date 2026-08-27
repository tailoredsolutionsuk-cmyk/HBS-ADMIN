"use client";

import { FormEvent, useState } from "react";
import { createClient } from "../../lib/supabase/client";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setIsSubmitting(true);

    try {
      const supabase = createClient();
      const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
      if (signInError) throw signInError;
      window.location.assign("/");
    } catch (signInError) {
      setError(signInError instanceof Error ? signInError.message : "Unable to sign in.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <main className="admin-login-shell">
      <section className="admin-login-card">
        <div className="admin-login-brand"><span className="admin-brand-mark">H</span><span>hbs admin</span></div>
        <span className="admin-section-kicker">Secure workspace</span>
        <h1>Welcome back.</h1>
        <p>Sign in with your HBS admin account to manage the connected websites.</p>
        <form onSubmit={handleSubmit} className="admin-login-form">
          <label>Email<input type="email" value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="email" required /></label>
          <label>Password<input type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="current-password" required /></label>
          {error && <p className="admin-login-error" role="alert">{error}</p>}
          <button className="admin-primary-button" type="submit" disabled={isSubmitting}>{isSubmitting ? "Signing in…" : "Sign in"}</button>
        </form>
        <small className="admin-login-help">Access is limited to users allowlisted in Supabase.</small>
      </section>
    </main>
  );
}

