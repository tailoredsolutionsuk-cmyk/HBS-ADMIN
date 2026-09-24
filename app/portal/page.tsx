import { redirect } from "next/navigation";
import { portalAccount } from "../../lib/portal/server";
import { safePortalUrl } from "../../lib/portal/validation";
import "./portal.css";

export const dynamic = "force-dynamic";

const date = (value: string | null) => value
  ? new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric" }).format(new Date(`${value}T12:00:00Z`))
  : "No date set";

export default async function PortalPage() {
  const account = await portalAccount();
  if (!account) redirect("/portal/login?access=required");
  const { client, db, user } = account;
  const [tasks, sites, messages] = await Promise.all([
    db.from("checklist_items").select("id,title,status,priority,category,due_date,updated_at").eq("client_id", client.id).order("done").order("due_date", { ascending: true, nullsFirst: false }).limit(50),
    db.from("builder_sites").select("id,name,published_revision,live_url,custom_domain,updated_at").eq("client_id", client.id).not("published_revision", "is", null).order("updated_at", { ascending: false }).limit(20),
    db.from("client_messages").select("id,subject,body,created_at").eq("client_id", client.id).order("created_at", { ascending: false }).limit(20),
  ]);
  if (tasks.error || sites.error || messages.error) throw new Error("PORTAL_DATA_UNAVAILABLE");
  const open = (tasks.data || []).filter((task) => task.status !== "done");

  return <main className="portal-shell">
    <header className="portal-header"><span className="portal-brand">HIGHLINE <i>BRAND STRATEGY</i></span><div><span>{user.email}</span><form action="/api/portal/signout" method="post"><button>Sign out</button></form></div></header>
    <section className="portal-hero"><div><p className="portal-kicker">Client portal</p><h1>{client.business_name}</h1><p>Your projects, website links and updates in one secure workspace.</p></div><span className="portal-status">Account active</span></section>
    <section className="portal-stats"><article><span>Open work</span><strong>{open.length}</strong><small>Tasks in progress</small></article><article><span>Websites</span><strong>{sites.data?.length || 0}</strong><small>Published projects</small></article><article><span>Updates</span><strong>{messages.data?.length || 0}</strong><small>Recent messages</small></article></section>
    <div className="portal-grid"><section className="portal-card"><header><p className="portal-kicker">Delivery</p><h2>Project progress</h2></header>{open.length ? open.map((task) => <article className="portal-task" key={task.id}><div><strong>{task.title}</strong><span>{task.category} · {task.priority}</span></div><div><b>{task.status.replace("_", " ")}</b><small>{date(task.due_date)}</small></div></article>) : <p className="portal-empty">No open work right now.</p>}</section>
    <section className="portal-card"><header><p className="portal-kicker">Websites</p><h2>Live projects</h2></header>{sites.data?.length ? sites.data.map((site) => { const target = site.custom_domain ? (String(site.custom_domain).startsWith("https://") ? site.custom_domain : `https://${site.custom_domain}`) : site.live_url; const url = safePortalUrl(target); return <article className="portal-site" key={site.id}><div><strong>{site.name}</strong><small>Published version {site.published_revision}</small></div>{url && <a href={url} target="_blank" rel="noopener noreferrer">Open website ↗</a>}</article>; }) : <p className="portal-empty">No published website is linked yet.</p>}</section></div>
    <section className="portal-card portal-updates"><header><p className="portal-kicker">From Highline</p><h2>Latest updates</h2></header>{messages.data?.length ? messages.data.map((message) => <article key={message.id}><div><strong>{message.subject}</strong><time>{new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric" }).format(new Date(message.created_at))}</time></div><p>{message.body}</p></article>) : <p className="portal-empty">No updates have been posted yet.</p>}</section>
    <footer className="portal-footer"><p>Need help? Contact your account manager{client.account_manager ? ` — ${client.account_manager}` : ""}.</p></footer>
  </main>;
}
