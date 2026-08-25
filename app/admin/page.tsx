"use client";

import { useEffect, useMemo, useState } from "react";

type IconName = "activity" | "arrow-up-right" | "chevron-down" | "external" | "globe" | "grid" | "layers" | "link" | "plus" | "search" | "settings" | "users" | "x";

function Icon({ name, size = 17 }: { name: IconName; size?: number }) {
  const common = { width: size, height: size, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round" as const, strokeLinejoin: "round" as const, "aria-hidden": true };
  const paths: Record<IconName, React.ReactNode> = {
    activity: <><path d="M3 12h4l2.2-6 4.4 12 2.2-6H21" /></>,
    "arrow-up-right": <><path d="M7 17 17 7" /><path d="M7 7h10v10" /></>,
    "chevron-down": <path d="m6 9 6 6 6-6" />,
    external: <><path d="M14 3h7v7" /><path d="M10 14 21 3" /><path d="M21 14v5a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5" /></>,
    globe: <><circle cx="12" cy="12" r="9" /><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18" /></>,
    grid: <><rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" /><rect x="3" y="14" width="7" height="7" rx="1" /><rect x="14" y="14" width="7" height="7" rx="1" /></>,
    layers: <><path d="m12 3 9 5-9 5-9-5z" /><path d="m3 12 9 5 9-5M3 16l9 5 9-5" /></>,
    link: <><path d="M10 13a5 5 0 0 0 7.5.5l2-2a5 5 0 0 0-7-7l-1.2 1.2" /><path d="M14 11a5 5 0 0 0-7.5-.5l-2 2a5 5 0 0 0 7 7l1.2-1.2" /></>,
    plus: <><path d="M12 5v14M5 12h14" /></>,
    search: <><circle cx="11" cy="11" r="6.5" /><path d="m16 16 5 5" /></>,
    settings: <><circle cx="12" cy="12" r="3.5" /><path d="M19.4 15a2 2 0 1 0 0 2.8M4.6 9a2 2 0 1 0 0-2.8M15 4.6a2 2 0 1 0 2.8 0M9 19.4a2 2 0 1 0-2.8 0M4 12h2M18 12h2M12 4v2M12 18v2" /></>,
    users: <><circle cx="9" cy="8" r="3" /><path d="M3 20c.6-3.3 2.5-5 6-5s5.4 1.7 6 5M16 5.5a3 3 0 0 1 0 5.8M17 15c2.2.2 3.5 1.5 4 4" /></>,
    x: <><path d="m6 6 12 12M18 6 6 18" /></>,
  };
  return <svg {...common}>{paths[name]}</svg>;
}

type Website = { name: string; domain: string; type: string; status: string; color: string; updated: string; deployment: string };
type Activity = { title: string; detail: string; time: string; tone: string };
type DashboardStats = { activeWebsites: number | string; deployments: number | string; teamMembers: number | string; uptime: string; pageViews30d?: number };
type AnalyticsData = { totals: { views: number; visitors: number }; daily: { date: string; value: number }[]; pages: { label: string; value: number }[]; referrers: { label: string; value: number }[]; devices: { label: string; value: number }[]; browsers: { label: string; value: number }[] };

const fallbackWebsites: Website[] = [
  { name: "HBS Marketing", domain: "hbsmarketing.co.uk", type: "Marketing site", status: "Live", color: "peach", updated: "12 min ago", deployment: "Production" },
  { name: "HBS Client Dashboard", domain: "hbs-client-dashbaord.vercel.app", type: "Client portal", status: "Live", color: "blue", updated: "1 hour ago", deployment: "Production" },
  { name: "Autotek Mobile Mechanics", domain: "autotekmobilemechanics.vercel.app", type: "Business site", status: "Live", color: "mint", updated: "Yesterday", deployment: "Production" },
  { name: "Pollards Fruit & Veg", domain: "pollards-preview.vercel.app", type: "Commerce site", status: "Preview", color: "lavender", updated: "2 days ago", deployment: "Preview" },
];

const fallbackActivities: Activity[] = [
  { title: "Production deployment completed", detail: "HBS Marketing · main", time: "12 min ago", tone: "success" },
  { title: "New client workspace created", detail: "HBS Client Dashboard", time: "1 hour ago", tone: "blue" },
  { title: "Content updated", detail: "Autotek Mobile Mechanics · Home", time: "Yesterday", tone: "peach" },
  { title: "Preview deployment ready", detail: "Pollards Fruit & Veg · feature/menu", time: "2 days ago", tone: "lavender" },
];

const fallbackStats: DashboardStats = { activeWebsites: 0, deployments: "—", teamMembers: "—", uptime: "—" };

const navItems: { label: string; icon: IconName }[] = [
  { label: "Overview", icon: "grid" },
  { label: "Websites", icon: "globe" },
  { label: "Clients", icon: "users" },
  { label: "Deployments", icon: "layers" },
  { label: "Analytics", icon: "activity" },
  { label: "Activity", icon: "activity" },
  { label: "Integrations", icon: "link" },
];

function AnalyticsPanel({ data, loading }: { data: AnalyticsData | null; loading: boolean }) {
  const maxDaily = Math.max(...(data?.daily.map((item) => item.value) ?? [1]), 1);
  const maxPage = Math.max(...(data?.pages.map((item) => item.value) ?? [1]), 1);
  return <div className="admin-analytics-view">
    <section className="admin-welcome"><div><span className="admin-kicker">www.hbsmarketing.co.uk</span><h2>Website analytics</h2><p>Anonymous traffic collected from the HBS Marketing frontend.</p></div><span className="admin-analytics-live"><i />Last 30 days</span></section>
    {loading ? <section className="admin-panel admin-analytics-loading">Loading marketing analytics…</section> : data && <>
      <section className="admin-stats" aria-label="Marketing analytics statistics">
        <article className="admin-stat-card"><span className="admin-stat-icon peach"><Icon name="activity" size={17} /></span><span className="admin-stat-label">Page views</span><strong>{data.totals.views}</strong><small>Last <b>30 days</b></small></article>
        <article className="admin-stat-card"><span className="admin-stat-icon blue"><Icon name="users" size={17} /></span><span className="admin-stat-label">Unique visitors</span><strong>{data.totals.visitors}</strong><small>Privacy-safe <b>daily IDs</b></small></article>
        <article className="admin-stat-card"><span className="admin-stat-icon lavender"><Icon name="globe" size={17} /></span><span className="admin-stat-label">Tracked pages</span><strong>{data.pages.length}</strong><small>Top pages <b>shown below</b></small></article>
        <article className="admin-stat-card"><span className="admin-stat-icon mint"><Icon name="arrow-up-right" size={17} /></span><span className="admin-stat-label">Top page</span><strong className="admin-stat-text-value">{data.pages[0]?.label ?? "—"}</strong><small>{data.pages[0]?.value ?? 0} views</small></article>
      </section>
      <div className="admin-grid">
        <section className="admin-panel"><div className="admin-panel-heading"><div><span className="admin-section-kicker">Traffic</span><h3>Daily page views</h3></div></div><div className="admin-bar-chart">{data.daily.map((item) => <span key={item.date} title={`${item.date}: ${item.value}`} style={{ height: `${Math.max(4, (item.value / maxDaily) * 100)}%` }} />)}</div><div className="admin-chart-labels"><span>{data.daily[0]?.date}</span><span>{data.daily[data.daily.length - 1]?.date}</span></div></section>
        <section className="admin-panel"><div className="admin-panel-heading"><div><span className="admin-section-kicker">Content</span><h3>Popular pages</h3></div></div><div className="admin-ranking-list">{data.pages.map((item) => <div className="admin-ranking-row" key={item.label}><span title={item.label}>{item.label}</span><b>{item.value}</b><i><em style={{ width: `${(item.value / maxPage) * 100}%` }} /></i></div>)}</div></section>
      </div>
      <div className="admin-grid lower"><section className="admin-panel"><div className="admin-panel-heading"><div><span className="admin-section-kicker">Acquisition</span><h3>Referrers</h3></div></div><div className="admin-mini-list">{data.referrers.map((item) => <div key={item.label}><span>{item.label}</span><b>{item.value}</b></div>)}</div></section><section className="admin-panel"><div className="admin-panel-heading"><div><span className="admin-section-kicker">Audience</span><h3>Devices & browsers</h3></div></div><div className="admin-mini-list">{[...data.devices, ...data.browsers].map((item, index) => <div key={`${item.label}-${index}`}><span>{item.label}</span><b>{item.value}</b></div>)}</div></section></div>
    </>}
  </div>;
}

export default function AdminPage() {
  const [activeNav, setActiveNav] = useState("Overview");
  const [query, setQuery] = useState("");
  const [notice, setNotice] = useState("");
  const [websiteData, setWebsiteData] = useState<Website[]>(fallbackWebsites);
  const [activityData, setActivityData] = useState<Activity[]>(fallbackActivities);
  const [stats, setStats] = useState<DashboardStats>(fallbackStats);
  const [isConnected, setIsConnected] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [analytics, setAnalytics] = useState<AnalyticsData | null>(null);
  const [analyticsLoading, setAnalyticsLoading] = useState(false);
  const filteredWebsites = useMemo(() => websiteData.filter((site) => `${site.name} ${site.domain} ${site.type}`.toLowerCase().includes(query.toLowerCase())), [query, websiteData]);

  useEffect(() => {
    let mounted = true;
    fetch("/api/admin/overview")
      .then(async (response) => {
        if (!response.ok) return;
        const data = await response.json();
        if (!mounted) return;
        setWebsiteData(data.websites ?? []);
        setActivityData(data.activities ?? []);
        setStats(data.stats ?? fallbackStats);
        setIsConnected(true);
      })
      .catch(() => undefined)
      .finally(() => {
        if (mounted) setIsLoading(false);
      });
    return () => { mounted = false; };
  }, []);

  useEffect(() => {
    if (activeNav !== "Analytics" || analytics || analyticsLoading) return;
    setAnalyticsLoading(true);
    fetch("/api/admin/analytics").then(async (response) => {
      if (response.ok) setAnalytics(await response.json());
    }).catch(() => undefined).finally(() => setAnalyticsLoading(false));
  }, [activeNav, analytics, analyticsLoading]);

  function showNotice(message: string) {
    setNotice(message);
    window.setTimeout(() => setNotice(""), 2400);
  }

  return (
    <main className="admin-shell">
      <aside className="admin-sidebar">
        <div className="admin-brand"><span className="admin-brand-mark">H</span><span>hbs admin</span><span className="admin-beta">BETA</span></div>
        <button className="admin-workspace-select"><span className="admin-workspace-avatar">J</span><span><strong>Jordan&apos;s workspace</strong><small>Personal</small></span><Icon name="chevron-down" size={14} /></button>
        <div className="admin-nav-label">Workspace</div>
        <nav className="admin-nav" aria-label="Admin navigation">
          {navItems.map((item) => <button key={item.label} className={`admin-nav-item ${activeNav === item.label ? "active" : ""}`} onClick={() => setActiveNav(item.label)}><Icon name={item.icon} />{item.label}{item.label === "Websites" && <span className="admin-nav-count">{websiteData.length}</span>}</button>)}
        </nav>
        <div className="admin-sidebar-bottom">
          <button className="admin-nav-item" onClick={() => showNotice("Settings are coming next")}><Icon name="settings" />Settings</button>
          <div className="admin-profile"><span className="admin-profile-avatar">JM</span><span><strong>Jordan Miller</strong><small>Super admin</small></span><Icon name="chevron-down" size={14} /></div>
        </div>
      </aside>

      <section className="admin-content">
        <header className="admin-topbar">
          <div><span className="admin-eyebrow">Workspace / Admin</span><h1>{activeNav}</h1></div>
          <div className="admin-topbar-actions"><span className="admin-saved"><i />{isConnected ? "Supabase data live" : isLoading ? "Connecting to Supabase…" : "Sign-in required"}</span><button className="admin-outline-button" onClick={() => showNotice("Client dashboard opened in a new tab")}><Icon name="external" size={14} />Client dashboard</button><button className="admin-avatar-button">JM</button></div>
        </header>

        <div className="admin-main">
          {activeNav === "Overview" ? <>
            <section className="admin-welcome"><div><span className="admin-kicker">Tuesday, 25 August 2026</span><h2>Good morning, Jordan.</h2><p>Here&apos;s what&apos;s happening across your websites today.</p></div><button className="admin-primary-button" onClick={() => showNotice("Website creation flow opened")}><Icon name="plus" size={15} />New website</button></section>

            <section className="admin-stats" aria-label="Workspace statistics">
              <article className="admin-stat-card"><span className="admin-stat-icon peach"><Icon name="globe" size={17} /></span><span className="admin-stat-label">Active websites</span><strong>{stats.activeWebsites}</strong><small>From the <b>HBS backend</b></small></article>
              <article className="admin-stat-card"><span className="admin-stat-icon blue"><Icon name="layers" size={17} /></span><span className="admin-stat-label">Deployments</span><strong>{stats.deployments}</strong><small>Provider sync <b>coming next</b></small></article>
              <article className="admin-stat-card"><span className="admin-stat-icon lavender"><Icon name="users" size={17} /></span><span className="admin-stat-label">Team members</span><strong>{stats.teamMembers}</strong><small>Role sync <b>coming next</b></small></article>
              <article className="admin-stat-card"><span className="admin-stat-icon mint"><Icon name="activity" size={17} /></span><span className="admin-stat-label">Page views · 30d</span><strong>{isConnected ? stats.pageViews30d ?? 0 : "—"}</strong><small><b>{isConnected ? "Live" : "Awaiting access"}</b> from Supabase</small></article>
            </section>

            <div className="admin-grid">
              <section className="admin-panel admin-websites-panel"><div className="admin-panel-heading"><div><span className="admin-section-kicker">Portfolio</span><h3>Websites</h3></div><button className="admin-text-button" onClick={() => setActiveNav("Websites")}>View all <Icon name="arrow-up-right" size={13} /></button></div><div className="admin-search"><Icon name="search" size={15} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search websites..." /></div><div className="admin-site-list">{filteredWebsites.slice(0, 4).map((site) => <button className="admin-site-row" key={site.name} onClick={() => showNotice(`${site.name} selected`)}><span className={`admin-site-thumb ${site.color}`}><Icon name="globe" size={17} /></span><span className="admin-site-copy"><strong>{site.name}</strong><small>{site.domain}</small></span><span className={`admin-status ${site.status.toLowerCase()}`}><i />{site.status}</span><span className="admin-site-time">{site.updated}</span><Icon name="arrow-up-right" size={14} /></button>)}</div></section>

              <section className="admin-panel admin-services-panel"><div className="admin-panel-heading"><div><span className="admin-section-kicker">Infrastructure</span><h3>Connected services</h3></div><button className="admin-icon-button" aria-label="Manage integrations" onClick={() => setActiveNav("Integrations")}><Icon name="arrow-up-right" size={14} /></button></div><div className="admin-service-list"><div className="admin-service-row"><span className="admin-service-logo github">GH</span><span><strong>GitHub</strong><small>tailoredsolutionsuk-cmyk</small></span><span className="admin-connected"><i />Connected</span></div><div className="admin-service-row"><span className="admin-service-logo vercel">▲</span><span><strong>Vercel</strong><small>harleyjayy14&apos;s projects</small></span><span className="admin-connected"><i />Connected</span></div><div className="admin-service-row"><span className="admin-service-logo supabase">⌁</span><span><strong>Supabase</strong><small>Website-Code-HBS</small></span><span className={`admin-connected ${isConnected ? "" : "pending"}`}><i />{isConnected ? "Live data" : "Sign in required"}</span></div></div><div className="admin-service-footer"><span>{isConnected ? "All integrations are healthy" : "Supabase auth is required for live data"}</span><span className="admin-health-dot" /></div></section>
            </div>

            <div className="admin-grid lower">
              <section className="admin-panel"><div className="admin-panel-heading"><div><span className="admin-section-kicker">Latest changes</span><h3>Recent activity</h3></div><button className="admin-text-button" onClick={() => setActiveNav("Activity")}>View activity <Icon name="arrow-up-right" size={13} /></button></div><div className="admin-activity-list">{activityData.map((activity) => <div className="admin-activity-row" key={`${activity.title}-${activity.time}`}><span className={`admin-activity-dot ${activity.tone}`} /><span><strong>{activity.title}</strong><small>{activity.detail}</small></span><time>{activity.time}</time></div>)}</div></section>
              <section className="admin-panel admin-quick-panel"><div className="admin-panel-heading"><div><span className="admin-section-kicker">Shortcuts</span><h3>Quick actions</h3></div></div><div className="admin-quick-actions"><button onClick={() => showNotice("Deployment center opened")}><span><Icon name="layers" size={16} /></span><strong>Review deployments</strong><Icon name="arrow-up-right" size={13} /></button><button onClick={() => showNotice("Team management opened")}><span><Icon name="users" size={16} /></span><strong>Manage team access</strong><Icon name="arrow-up-right" size={13} /></button><button onClick={() => showNotice("Integration settings opened")}><span><Icon name="link" size={16} /></span><strong>Configure integrations</strong><Icon name="arrow-up-right" size={13} /></button></div></section>
            </div>
          </> : activeNav === "Analytics" ? <AnalyticsPanel data={analytics} loading={analyticsLoading} /> : <section className="admin-panel admin-placeholder"><span className="admin-stat-icon blue"><Icon name={navItems.find((item) => item.label === activeNav)?.icon ?? "grid"} size={20} /></span><span className="admin-section-kicker">Admin module</span><h2>{activeNav}</h2><p>This workspace module is ready to connect to Supabase data and live provider actions.</p><button className="admin-primary-button" onClick={() => showNotice(`${activeNav} module queued for build`)}><Icon name="plus" size={15} />Start building</button></section>}
        </div>
      </section>
      {notice && <div className="admin-toast"><span>✓</span>{notice}<button onClick={() => setNotice("")} aria-label="Dismiss notification"><Icon name="x" size={13} /></button></div>}
    </main>
  );
}

