"use client";

import { useEffect, useState } from "react";

type Integration = { id: string; name: string; configured: boolean; detail: string };
type ActivitySource = { project_name: string; enabled: boolean; webhook_id: number | null; last_verified_at: string | null; last_error: string | null };
type IntegrationData = { role: string; scopes: Record<string, string>; integrations: Integration[]; activityAutomation: { canManage: boolean; configured: boolean; sources: ActivitySource[] } };
type SheetsConnection = { configured: boolean; connected: boolean; email: string | null; sheetTitle: string; sheetName: string; lastSyncedAt: string | null };

const syncErrorMessage: Record<string, string> = {
  GOOGLE_SHEETS_NOT_CONFIGURED: "Google Sheets is not configured yet. Add the four Google OAuth variables in Vercel, then redeploy.",
  GOOGLE_SHEETS_NOT_CONNECTED: "Connect the Google account that can access the outreach spreadsheet, then sync again.",
  GOOGLE_SHEETS_FILE_ACCESS_DENIED: "Google connected, but that Google account cannot read this spreadsheet. Share it with the connected account and retry.",
  GOOGLE_SHEETS_NOT_FOUND: "The outreach spreadsheet or its Sheet1 tab could not be found.",
  GOOGLE_SHEETS_HEADERS_INVALID: "The sheet needs these headers: Business Name, Mobile Number, Location, Services Offered, and Customer Reviews.",
  GOOGLE_SHEETS_DEDUP_CHECK_FAILED: "The CRM could not check for existing leads. No spreadsheet rows were imported.",
  GOOGLE_SHEETS_LEAD_IMPORT_FAILED: "The CRM could not save the new leads. Please retry the sync.",
};

export default function IntegrationsPanel() {
  const [data, setData] = useState<IntegrationData | null>(null);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [sheets, setSheets] = useState<SheetsConnection | null>(null);
  const [sheetsBusy, setSheetsBusy] = useState(false);
  const [sheetsMessage, setSheetsMessage] = useState("");
  const [sheetsError, setSheetsError] = useState("");
  useEffect(() => {
    const callbackStatus = new URLSearchParams(window.location.search).get("google_sheets");
    if (callbackStatus === "connected") setSheetsMessage("Google Sheets is connected. Sync the outreach list when you are ready.");
    else if (callbackStatus) setSheetsError(callbackStatus === "not_configured" ? "Google Sheets needs its server-side OAuth settings in Vercel." : `Google connection did not complete (${callbackStatus.replaceAll("_", " ")}).`);
    Promise.all([fetch("/api/admin/integrations", { cache: "no-store" }), fetch("/api/admin/google-sheets", { cache: "no-store" })])
      .then(async ([integrationsResponse, sheetsResponse]) => {
        if (!integrationsResponse.ok || !sheetsResponse.ok) throw new Error();
        const [integrations, connection] = await Promise.all([integrationsResponse.json(), sheetsResponse.json()]);
        setData(integrations); setSheets(connection);
      }).catch(() => setError("Integration status could not be loaded."));
  }, []);

  async function syncOutreachSheet() {
    setSheetsBusy(true); setSheetsError(""); setSheetsMessage("");
    try {
      const response = await fetch("/api/admin/google-sheets/sync", { method: "POST", headers: { "Content-Type": "application/json" }, credentials: "same-origin", body: "{}" });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(syncErrorMessage[payload.error] || "The outreach sheet could not be synced.");
      setSheetsMessage(`Sync complete: ${payload.imported} new lead${payload.imported === 1 ? "" : "s"} added, ${payload.alreadyInCrm} already in the CRM, and ${payload.alreadySynced} previously synced.`);
      const refreshed = await fetch("/api/admin/google-sheets", { cache: "no-store" });
      if (refreshed.ok) setSheets(await refreshed.json());
    } catch (issue) { setSheetsError(issue instanceof Error ? issue.message : "The outreach sheet could not be synced."); }
    finally { setSheetsBusy(false); }
  }

  async function disconnectOutreachSheet() {
    if (!window.confirm("Disconnect Google Sheets from the CRM? This removes the saved Google connection; imported CRM leads remain.")) return;
    setSheetsBusy(true); setSheetsError(""); setSheetsMessage("");
    try {
      const response = await fetch("/api/admin/google-sheets", { method: "DELETE", credentials: "same-origin" });
      if (!response.ok) throw new Error("Google Sheets could not be disconnected.");
      setSheets((value) => value ? { ...value, connected: false, email: null, lastSyncedAt: null } : value);
      setSheetsMessage("Google Sheets has been disconnected. Existing CRM leads were kept.");
    } catch (issue) { setSheetsError(issue instanceof Error ? issue.message : "Google Sheets could not be disconnected."); }
    finally { setSheetsBusy(false); }
  }

  async function activateActivityTracking() {
    setSaving(true); setError(""); setMessage("");
    try {
      const response = await fetch("/api/admin/integrations/activity", { method: "POST" });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || payload.results?.some((result: { ready: boolean }) => !result.ready)) throw new Error(payload.error || payload.results?.find((result: { ready: boolean; error?: string }) => !result.ready)?.error || "ACTIVATION_FAILED");
      setMessage("GitHub activity tracking is active for every connected project.");
      const refreshed = await fetch("/api/admin/integrations", { cache: "no-store" });
      if (refreshed.ok) setData(await refreshed.json());
    } catch (issue) {
      const message = issue instanceof Error ? issue.message : "Activity tracking could not be activated.";
      setError(message.startsWith("GITHUB_TOKEN_UNAUTHORIZED") ? "GitHub rejected the saved GITHUB_TOKEN. Replace it in Vercel with a current token that has Webhooks read and write access to every tracked repository." : message.startsWith("GITHUB_WEBHOOK_FORBIDDEN") ? "The saved GitHub token is valid but lacks Webhooks read and write access to a tracked repository." : message);
    }
    finally { setSaving(false); }
  }

  return <div className="admin-integrations-view">
    <section className="admin-welcome"><div><span className="admin-kicker">Secure server connections</span><h2>Integrations & scopes</h2><p>Credentials remain encrypted in Vercel and are never returned to the browser.</p></div><span className="admin-analytics-live"><i />{data?.role || "Loading"}</span></section>
    {error && <p className="admin-crm-error">{error}</p>}
    {message && <p className="admin-crm-success" role="status">{message}</p>}
    <section className="admin-panel admin-sheets-connection"><div className="admin-panel-heading"><div><span className="admin-section-kicker">Outreach prospect source</span><h3>Google Sheets · {sheets?.sheetTitle || "Leads For Outreach"}</h3><p>Import reviewed sheet rows into the CRM as new leads. Outreach stages, notes, and follow-up dates stay in the CRM.</p></div><b className={sheets?.connected ? "ready" : "missing"}>{sheets?.connected ? "Connected" : sheets?.configured ? "Ready to connect" : "Setup needed"}</b></div>
      {sheetsError ? <p className="admin-crm-error" role="alert">{sheetsError}</p> : null}
      {sheetsMessage ? <p className="admin-crm-success" role="status">{sheetsMessage}</p> : null}
      {sheets?.configured ? <div className="admin-sheets-controls">{sheets.connected ? <><p>Google account: <strong>{sheets.email}</strong>{sheets.lastSyncedAt ? ` · Last sync ${new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeStyle: "short" }).format(new Date(sheets.lastSyncedAt))}` : " · Not synced yet"}</p><button className="admin-primary-button" disabled={sheetsBusy} onClick={syncOutreachSheet}>{sheetsBusy ? "Syncing…" : "Sync outreach leads"}</button><button className="admin-outline-button" disabled={sheetsBusy} onClick={disconnectOutreachSheet}>Disconnect</button></> : <a className="admin-primary-button" href="/api/admin/google-sheets/connect">Connect Google Sheets</a>}</div> : <div className="admin-sheets-setup"><strong>One-time Google setup needed</strong><p>Add these server-side variables to the HBS Admin Vercel project, then redeploy:</p><ul><li><code>GOOGLE_SHEETS_CLIENT_ID</code></li><li><code>GOOGLE_SHEETS_CLIENT_SECRET</code></li><li><code>GOOGLE_SHEETS_REDIRECT_URI</code> = <code>https://www.hbsmarketing.online/api/admin/google-sheets/callback</code></li><li><code>GOOGLE_SHEETS_TOKEN_ENCRYPTION_KEY</code> = random 32-byte key in 64-character hex</li></ul><p>In Google Cloud Console, enable Google Sheets API and add the callback address above as an authorised redirect URI. The CRM requests read-only spreadsheet access.</p></div>}
      <p className="admin-sheets-mapping">Sheet columns used: Business Name, Mobile Number, Location, Services Offered, Customer Reviews. Repeat syncs skip already imported rows and match existing CRM records by business name or phone.</p>
    </section>
    <div className="admin-grid"><section className="admin-panel"><div className="admin-panel-heading"><div><span className="admin-section-kicker">Providers</span><h3>Environment readiness</h3></div></div><div className="admin-integration-grid">{data?.integrations.map((integration) => <article key={integration.id}><span className="admin-service-logo">{integration.name.slice(0, 2).toUpperCase()}</span><div><strong>{integration.name}</strong><small>{integration.detail}</small></div><b className={integration.configured ? "ready" : "missing"}>{integration.configured ? "Ready" : "Needs secret"}</b></article>) ?? <p className="admin-crm-loading">Checking connections…</p>}</div></section><section className="admin-panel"><div className="admin-panel-heading"><div><span className="admin-section-kicker">Access control</span><h3>Admin scopes</h3></div></div><div className="admin-scope-list">{data && Object.entries(data.scopes).map(([name, scope]) => <div key={name}><span>{name}</span><b>{scope}</b></div>)}</div></section></div>
    {data?.activityAutomation && <section className="admin-panel"><div className="admin-panel-heading"><div><span className="admin-section-kicker">Automatic audit trail</span><h3>GitHub → HBS CRM</h3><p>Every push creates a plain-English summary of the commits and changed files, linked to the right project and client without saving source code or private chat content.</p></div>{data.activityAutomation.canManage && <button className="admin-primary-button" disabled={saving} onClick={activateActivityTracking}>{saving ? "Connecting…" : data.activityAutomation.configured ? "Recheck tracking" : "Activate tracking"}</button>}</div><div className="admin-integration-grid">{data.activityAutomation.sources.map((source) => <article key={source.project_name}><span className="admin-service-logo">GH</span><div><strong>{source.project_name}</strong><small>{source.last_error || (source.last_verified_at ? `Verified ${new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeStyle: "short" }).format(new Date(source.last_verified_at))}` : "Ready to connect")}</small></div><b className={source.webhook_id && !source.last_error ? "ready" : "missing"}>{source.webhook_id && !source.last_error ? "Tracking" : "Not active"}</b></article>)}</div></section>}
  </div>;
}

