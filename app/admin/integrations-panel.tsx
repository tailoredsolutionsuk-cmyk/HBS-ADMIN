"use client";

import { useEffect, useState } from "react";

type Integration = { id: string; name: string; configured: boolean; detail: string };
type IntegrationData = { role: string; scopes: Record<string, string>; integrations: Integration[] };

export default function IntegrationsPanel() {
  const [data, setData] = useState<IntegrationData | null>(null);
  const [error, setError] = useState("");
  useEffect(() => { fetch("/api/admin/integrations", { cache: "no-store" }).then(async (response) => { if (!response.ok) throw new Error(); setData(await response.json()); }).catch(() => setError("Integration status could not be loaded.")); }, []);

  return <div className="admin-integrations-view">
    <section className="admin-welcome"><div><span className="admin-kicker">Secure server connections</span><h2>Integrations & scopes</h2><p>Credentials remain encrypted in Vercel and are never returned to the browser.</p></div><span className="admin-analytics-live"><i />{data?.role || "Loading"}</span></section>
    {error && <p className="admin-crm-error">{error}</p>}
    <div className="admin-grid"><section className="admin-panel"><div className="admin-panel-heading"><div><span className="admin-section-kicker">Providers</span><h3>Environment readiness</h3></div></div><div className="admin-integration-grid">{data?.integrations.map((integration) => <article key={integration.id}><span className="admin-service-logo">{integration.name.slice(0, 2).toUpperCase()}</span><div><strong>{integration.name}</strong><small>{integration.detail}</small></div><b className={integration.configured ? "ready" : "missing"}>{integration.configured ? "Ready" : "Needs secret"}</b></article>) ?? <p className="admin-crm-loading">Checking connections…</p>}</div></section><section className="admin-panel"><div className="admin-panel-heading"><div><span className="admin-section-kicker">Access control</span><h3>Admin scopes</h3></div></div><div className="admin-scope-list">{data && Object.entries(data.scopes).map(([name, scope]) => <div key={name}><span>{name}</span><b>{scope}</b></div>)}</div></section></div>
  </div>;
}

