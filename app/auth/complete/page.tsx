"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { createClient } from "../../../lib/supabase/client";

export default function AuthCompletePage() {
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let active = true;
    const fragment = new URLSearchParams(window.location.hash.slice(1));
    if (fragment.get("error") || !fragment.get("access_token")) {
      setFailed(true);
      return;
    }

    const timer = window.setTimeout(() => active && setFailed(true), 10000);
    const supabase = createClient();
    void supabase.auth.getSession().then(({ data, error }) => {
      window.clearTimeout(timer);
      if (!active) return;
      if (error || !data.session) {
        setFailed(true);
        return;
      }
      window.history.replaceState(null, "", "/auth/complete");
      window.location.replace("/portal");
    });

    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, []);

  return <main className="portal-shell portal-login-shell"><section className="portal-login-card"><span className="portal-brand">HIGHLINE <i>BRAND STRATEGY</i></span><p className="portal-kicker">Secure client sign in</p><h1>{failed ? "That link didn’t work." : "Signing you in…"}</h1><p>{failed ? "The sign-in link may have expired or already been used. Request a fresh link to continue." : "We’re verifying your one-time link and opening your private workspace."}</p>{failed ? <Link className="portal-auth-link" href="/portal/login?error=invalid_link">Request a new link</Link> : <div className="portal-auth-progress" role="status" aria-label="Signing in" />}</section></main>;
}
