"use client";

export default function PortalError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <main className="portal-shell portal-login-shell"><section className="portal-login-card"><span className="portal-brand">HIGHLINE <i>BRAND STRATEGY</i></span><p className="portal-kicker">Client portal</p><h1>We couldn’t load your workspace.</h1><p>Your account is still secure. Please try again, or contact your account manager if the problem continues.</p><button className="portal-retry" type="button" onClick={reset}>Try again</button></section></main>;
}
