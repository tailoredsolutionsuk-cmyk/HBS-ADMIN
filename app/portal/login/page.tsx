import { redirect } from "next/navigation";
import { portalAccount } from "../../../lib/portal/server";
import PortalLoginForm from "./login-form";
import "../portal.css";
import "../portal-otp.css";

export const dynamic = "force-dynamic";

export default async function PortalLoginPage({ searchParams }: { searchParams: Promise<{ error?: string; access?: string }> }) {
  const [account, params] = await Promise.all([portalAccount(), searchParams]);
  if (account) redirect("/portal");
  const notice = params.error ? "That sign-in code is invalid or has expired. Request a new one below." : params.access ? "Sign in with the email enabled for your client account." : "";
  return <main className="portal-shell portal-login-shell"><section className="portal-login-card"><span className="portal-brand">HIGHLINE <i>BRAND STRATEGY</i></span><p className="portal-kicker">Private client workspace</p><h1>Welcome back.</h1><p>Enter the email connected to your Highline Brand Strategy client account. We’ll send a secure six-digit code—no password needed.</p>{notice && <p className="portal-login-notice" role="alert">{notice}</p>}<PortalLoginForm /><small>Need access? Contact your account manager.</small></section></main>;
}
