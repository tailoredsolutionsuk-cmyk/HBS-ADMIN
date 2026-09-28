import { redirect } from "next/navigation";
import { summarizeClientAnalytics } from "../../lib/crm/client-analytics";
import { portalAccount } from "../../lib/portal/server";
import { safePortalUrl } from "../../lib/portal/validation";
import "./portal.css";

export const dynamic = "force-dynamic";

const shortDate = (value: string | null) => value
  ? new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric" }).format(new Date(value.includes("T") ? value : `${value}T12:00:00Z`))
  : "No date set";

const number = new Intl.NumberFormat("en-GB");

function websiteUrl(value: string | null) {
  if (!value) return null;
  return safePortalUrl(value.startsWith("https://") ? value : `https://${value}`);
}

export default async function PortalPage() {
  const account = await portalAccount();
  if (!account) redirect("/portal/login?access=required");
  const { client, db, user } = account;
  const analyticsSince = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const [tasks, sites, messages, pageViews] = await Promise.all([
    db.from("checklist_items").select("id,title,status,priority,category,due_date,updated_at").eq("client_id", client.id).order("done").order("due_date", { ascending: true, nullsFirst: false }).limit(50),
    db.from("builder_sites").select("id,name,published_revision,live_url,custom_domain,updated_at").eq("client_id", client.id).not("published_revision", "is", null).order("updated_at", { ascending: false }).limit(20),
    db.from("client_messages").select("id,subject,body,created_at").eq("client_id", client.id).order("created_at", { ascending: false }).limit(20),
    db.from("page_views").select("client_id,path,timestamp,visitor_hash,referrer,device,browser").eq("client_id", client.id).gte("timestamp", analyticsSince).order("timestamp", { ascending: false }).limit(5000),
  ]);
  if (tasks.error || sites.error || messages.error || pageViews.error) throw new Error("PORTAL_DATA_UNAVAILABLE");

  const open = (tasks.data || []).filter((task) => task.status !== "done");
  const analytics = summarizeClientAnalytics([client.id], pageViews.data || [])[0];
  const maxDaily = Math.max(1, ...analytics.daily.map((day) => day.value));
  const isUtx = client.id.toLowerCase() === "utx" || client.business_name.toLowerCase().includes("urbantrix");
  const directUrl = websiteUrl(client.website) || websiteUrl(client.domain);

  return <main className={`portal-shell${isUtx ? " portal-utx" : ""}`}>
    <header className="portal-header">
      <div className="portal-brand-lockup">
        {isUtx && <span className="portal-utx-mark">UTX</span>}
        <span className="portal-brand">{isUtx ? "URBANTRIX ACADEMY" : "HIGHLINE"}<i>{isUtx ? "TRAIN · PROGRESS · PERFORM" : "BRAND STRATEGY"}</i></span>
      </div>
      <div><span>{user.email}</span><form action="/api/portal/signout" method="post"><button>Sign out</button></form></div>
    </header>

    <section className="portal-hero">
      <div><p className="portal-kicker">{isUtx ? "Your digital HQ" : "Client portal"}</p><h1>{isUtx ? <>TRAIN. TRACK.<br /><em>PROGRESS.</em></> : client.business_name}</h1><p>{isUtx ? "Website performance, current work and every HBS update — all in one place." : "Your projects, website links and updates in one secure workspace."}</p></div>
      <div className="portal-hero-actions"><span className="portal-status">Account active</span>{directUrl && <a className="portal-primary-link" href={directUrl} target="_blank" rel="noopener noreferrer">Visit website ↗</a>}</div>
    </section>

    <section className="portal-stats">
      <article><span>Page views</span><strong>{number.format(analytics.views)}</strong><small>Last 30 days</small></article>
      <article><span>Unique visitors</span><strong>{number.format(analytics.visitors)}</strong><small>Last 30 days</small></article>
      <article><span>Open work</span><strong>{open.length}</strong><small>Tasks in progress</small></article>
      <article><span>Updates</span><strong>{messages.data?.length || 0}</strong><small>From your HBS team</small></article>
    </section>

    <section className="portal-card portal-analytics">
      <header><div><p className="portal-kicker">Website performance</p><h2>Last 30 days</h2></div><span>{analytics.lastSeenAt ? `Latest visit ${shortDate(analytics.lastSeenAt)}` : "Waiting for the first tracked visit"}</span></header>
      <div className="portal-analytics-grid">
        <div className="portal-chart" aria-label={`Daily website views over 30 days, ${analytics.views} total`}>
          {analytics.daily.map((day) => <div className="portal-bar-slot" key={day.label} title={`${shortDate(day.label)}: ${day.value} views`}><span style={{ height: `${Math.max(day.value ? 8 : 2, Math.round((day.value / maxDaily) * 100))}%` }} /></div>)}
        </div>
        <div className="portal-rankings">
          <div><h3>Top pages</h3>{analytics.pages.length ? analytics.pages.map((item) => <p key={item.label}><span>{item.label}</span><strong>{item.value}</strong></p>) : <small>Page data will appear when tracking begins.</small>}</div>
          <div><h3>Traffic sources</h3>{analytics.referrers.length ? analytics.referrers.map((item) => <p key={item.label}><span>{item.label}</span><strong>{item.value}</strong></p>) : <small>No traffic sources recorded yet.</small>}</div>
          <div><h3>Devices</h3>{analytics.devices.length ? analytics.devices.map((item) => <p key={item.label}><span>{item.label}</span><strong>{item.value}</strong></p>) : <small>No device data recorded yet.</small>}</div>
        </div>
      </div>
    </section>

    <div className="portal-grid">
      <section className="portal-card"><header><p className="portal-kicker">Delivery</p><h2>Project progress</h2></header>{open.length ? open.map((task) => <article className="portal-task" key={task.id}><div><strong>{task.title}</strong><span>{task.category} · {task.priority}</span></div><div><b>{task.status.replace("_", " ")}</b><small>{shortDate(task.due_date)}</small></div></article>) : <p className="portal-empty">No open work right now.</p>}</section>
      <section className="portal-card"><header><p className="portal-kicker">Websites</p><h2>Live projects</h2></header>{sites.data?.length ? sites.data.map((site) => { const target = site.custom_domain ? (String(site.custom_domain).startsWith("https://") ? site.custom_domain : `https://${site.custom_domain}`) : site.live_url; const url = safePortalUrl(target); return <article className="portal-site" key={site.id}><div><strong>{site.name}</strong><small>Published version {site.published_revision}</small></div>{url && <a href={url} target="_blank" rel="noopener noreferrer">Open website ↗</a>}</article>; }) : directUrl ? <article className="portal-site"><div><strong>{client.business_name}</strong><small>Live website</small></div><a href={directUrl} target="_blank" rel="noopener noreferrer">Open website ↗</a></article> : <p className="portal-empty">No published website is linked yet.</p>}</section>
    </div>

    <section className="portal-card portal-updates"><header><p className="portal-kicker">From HBS</p><h2>Latest updates</h2></header>{messages.data?.length ? messages.data.map((message) => <article key={message.id}><div><strong>{message.subject}</strong><time>{shortDate(message.created_at)}</time></div><p>{message.body}</p></article>) : <p className="portal-empty">No updates have been posted yet.</p>}</section>
    <footer className="portal-footer"><p>Need help? Contact your account manager{client.account_manager ? ` — ${client.account_manager}` : ""}.</p><span>Secure client workspace · Powered by HBS</span></footer>
  </main>;
}
