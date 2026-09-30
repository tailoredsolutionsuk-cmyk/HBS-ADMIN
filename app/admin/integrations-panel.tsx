"use client";

import { useEffect, useState } from "react";

type Integration = { id: string; name: string; configured: boolean; detail: string };
type ActivitySource = { project_name: string; enabled: boolean; webhook_id: number | null; last_verified_at: string | null; last_error: string | null };
type IntegrationData = { role: string; scopes: Record<string, string>; integrations: Integration[]; activityAutomation: { canManage: boolean; configured: boolean; sources: ActivitySource[] } };

export default function IntegrationsPanel() {
  const [data, setData] = useState<IntegrationData | null>(null);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  useEffect(() => { fetch("/api/admin/integrations", { cache: "no-store" }).then(async (response) => { if (!response.ok) throw new Error(); setData(await response.json()); }).catch(() => setError("Integration status could not be loaded.")); }, []);

  async function activateActivityTracking() {
    setSaving(true); setError(""); setMessage("");
    try {
      const response = await fetch("/api/admin/integrations/activity", { method: "POST" });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || payload.results?.some((result: { ready: boolean }) => !result.ready)) throw new Error(payload.error || payload.results?.find((result: { ready: boolean; error?: string }) => !result.ready)?.error || "ACTIVATION_FAILED");
      setMessage("GitHub activity tracking is active for every connected project.");
      const refreshed = await fetch("/api/admin/integrations", { cache: "no-store" });
      if (refreshed.ok) setData(await refreshed.json());
    } catch (issue) { setError(issue instanceof Error ? issue.message : "Activity tracking could not be activated."); }
    finally { setSaving(false); }
  }

  return <div className="admin-integrations-view">
    <section className="admin-welcome"><div><span className="admin-kicker">Secure server connections</span><h2>Integrations & scopes</h2><p>Credentials remain encrypted in Vercel and are never returned to the browser.</p></div><span className="admin-analytics-live"><i />{data?.role || "Loading"}</span></section>
    {error && <p className="admin-crm-error">{error}</p>}
    {message && <p className="admin-crm-success" role="status">{message}</p>}
    <div className="admin-grid"><section className="admin-panel"><div className="admin-panel-heading"><div><span className="admin-section-kicker">Providers</span><h3>Environment readiness</h3></div></div><div className="admin-integration-grid">{data?.integrations.map((integration) => <article key={integration.id}><span className="admin-service-logo">{integration.name.slice(0, 2).toUpperCase()}</span><div><strong>{integration.name}</strong><small>{integration.detail}</small></div><b className={integration.configured ? "ready" : "missing"}>{integration.configured ? "Ready" : "Needs secret"}</b></article>) ?? <p className="admin-crm-loading">Checking connections…</p>}</div></section><section className="admin-panel"><div className="admin-panel-heading"><div><span className="admin-section-kicker">Access control</span><h3>Admin scopes</h3></div></div><div className="admin-scope-list">{data && Object.entries(data.scopes).map(([name, scope]) => <div key={name}><span>{name}</span><b>{scope}</b></div>)}</div></section></div>
    {data?.activityAutomation && <section className="admin-panel"><div className="admin-panel-heading"><div><span className="admin-section-kicker">Automatic audit trail</span><h3>GitHub → HBS CRM</h3><p>Every push creates a plain-English summary of the commits and changed files, linked to the right project and client without saving source code or private chat content.</p></div>{data.activityAutomation.canManage && <button className="admin-primary-button" disabled={saving} onClick={activateActivityTracking}>{saving ? "Connecting…" : data.activityAutomation.configured ? "Recheck tracking" : "Activate tracking"}</button>}</div><div className="admin-integration-grid">{data.activityAutomation.sources.map((source) => <article key={source.project_name}><span className="admin-service-logo">GH</span><div><strong>{source.project_name}</strong><small>{source.last_error || (source.last_verified_at ? `Verified ${new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeStyle: "short" }).format(new Date(source.last_verified_at))}` : "Ready to connect")}</small></div><b className={source.webhook_id && !source.last_error ? "ready" : "missing"}>{source.webhook_id && !source.last_error ? "Tracking" : "Not active"}</b></article>)}</div></section>}
  </div>;
}

