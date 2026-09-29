"use client";

import dynamic from "next/dynamic";
import { useEffect, useMemo, useState } from "react";
import AiPanel from "./ai-panel";
import { AdminShell, type AdminView, Icon, MetricCard } from "./admin-ui";
import CrmPanel from "./crm-panel";
import IntegrationsPanel from "./integrations-panel";

const BuilderPanel = dynamic(() => import("./builder-panel"), { loading: () => <DashboardSkeleton label="Opening website studio" /> });

type Website = { name: string; domain: string; type: string; status: string; color: string; updated: string; deployment: string };
type Activity = { title: string; detail: string; time: string; tone: string };
type DashboardStats = { activeWebsites: number | string; deployments: number | string; teamMembers: number | string; uptime: string; pageViews30d?: number };
type CrmSummary = {
  leads: { id: string; business_name: string; next_action: string | null; next_action_at: string | null; status: string }[];
  tasks: { id: string; title: string; due_date: string | null; done: boolean; priority: string }[];
  metrics: { clients: number; openLeads: number; pipelineValue: number; weightedValue: number; overdueFollowUps: number; tasksDue: number };
};

const fallbackStats: DashboardStats = { activeWebsites: 0, deployments: "—", teamMembers: "—", uptime: "—", pageViews30d: 0 };
const fallbackCrm: CrmSummary = { leads: [], tasks: [], metrics: { clients: 0, openLeads: 0, pipelineValue: 0, weightedValue: 0, overdueFollowUps: 0, tasksDue: 0 } };
const money = (value: number) => new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP", maximumFractionDigits: 0 }).format(value);
const shortDate = (value: string) => new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short" }).format(new Date(value));

function DashboardSkeleton({ label = "Loading workspace" }: { label?: string }) {
  return <div className="admin-dashboard-skeleton" aria-busy="true" aria-label={label}><span /><span /><span /><span /></div>;
}

function Overview({ websites, activities, stats, crm, loading, onNavigate, onCreate }: { websites: Website[]; activities: Activity[]; stats: DashboardStats; crm: CrmSummary; loading: boolean; onNavigate: (view: AdminView) => void; onCreate: (view: "Pipeline" | "Tasks" | "Websites") => void }) {
  const [today, setToday] = useState("");
  const [greeting, setGreeting] = useState("Welcome back");
  useEffect(() => {
    const now = new Date();
    setToday(new Intl.DateTimeFormat("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric" }).format(now));
    const hour = now.getHours();
    setGreeting(hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening");
  }, []);

  const overdueTasks = crm.tasks.filter((task) => !task.done && task.due_date && task.due_date < new Date().toISOString().slice(0, 10));
  const overdueLeads = crm.leads.filter((lead) => lead.next_action_at && new Date(lead.next_action_at).valueOf() < Date.now() && !["Won", "Lost"].includes(lead.status));
  const attention = [
    ...overdueTasks.slice(0, 3).map((task) => ({ id: task.id, title: task.title, detail: task.due_date ? `Task overdue since ${shortDate(`${task.due_date}T12:00:00`)}` : "Task overdue", view: "Tasks" as const, tone: "danger" })),
    ...overdueLeads.slice(0, 3).map((lead) => ({ id: lead.id, title: lead.business_name, detail: lead.next_action || "Follow-up is overdue", view: "Pipeline" as const, tone: "warning" })),
  ].slice(0, 5);

  if (loading) return <DashboardSkeleton />;
  return <>
    <section className="admin-welcome admin-executive-welcome"><div><span className="admin-kicker">{today || "Your business today"}</span><h2>{greeting}, Harley.</h2><p>Your websites, sales pipeline and client work are all in one place.</p></div><div className="admin-welcome-actions"><button className="admin-outline-button" onClick={() => onCreate("Pipeline")}><Icon name="plus" size={15} />Add lead</button><button className="admin-primary-button" onClick={() => onCreate("Websites")}><Icon name="plus" size={15} />New website</button></div></section>

    <section className="admin-stats admin-executive-stats" aria-label="Business overview">
      <MetricCard icon="globe" tone="peach" label="Live websites" value={stats.activeWebsites} detail={<>{stats.pageViews30d ?? 0} views in 30 days</>} />
      <MetricCard icon="activity" tone="mint" label="Open pipeline" value={money(crm.metrics.pipelineValue)} detail={<>{crm.metrics.openLeads} active opportunities</>} />
      <MetricCard icon="briefcase" tone="blue" label="Weighted value" value={money(crm.metrics.weightedValue)} detail="Probability adjusted" />
      <MetricCard icon="layers" tone="lavender" label="Open work" value={crm.metrics.tasksDue} detail={<>{overdueTasks.length} overdue task{overdueTasks.length === 1 ? "" : "s"}</>} />
    </section>

    <div className="admin-dashboard-grid">
      <section className="admin-panel admin-attention-panel"><div className="admin-panel-heading"><div><span className="admin-section-kicker">Priority queue</span><h3>Needs attention</h3></div><span className={`admin-attention-count ${attention.length ? "active" : ""}`}>{attention.length}</span></div>{attention.length ? <div className="admin-attention-list">{attention.map((item) => <button key={`${item.view}-${item.id}`} onClick={() => onNavigate(item.view)}><span className={`admin-attention-icon ${item.tone}`}>!</span><span><strong>{item.title}</strong><small>{item.detail}</small></span><Icon name="arrow-up-right" size={14} /></button>)}</div> : <div className="admin-empty-state compact"><span>✓</span><strong>You&apos;re all caught up</strong><p>No overdue tasks or follow-ups.</p></div>}</section>
      <section className="admin-panel admin-quick-panel"><div className="admin-panel-heading"><div><span className="admin-section-kicker">Shortcuts</span><h3>Quick actions</h3></div></div><div className="admin-quick-actions"><button onClick={() => onCreate("Pipeline")}><span><Icon name="activity" size={17} /></span><strong>Add a new lead</strong><Icon name="arrow-up-right" size={14} /></button><button onClick={() => onCreate("Tasks")}><span><Icon name="layers" size={17} /></span><strong>Create a task</strong><Icon name="arrow-up-right" size={14} /></button><button onClick={() => onNavigate("Clients")}><span><Icon name="users" size={17} /></span><strong>Open client directory</strong><Icon name="arrow-up-right" size={14} /></button><button onClick={() => onNavigate("AI Assistant")}><span><Icon name="sparkles" size={17} /></span><strong>Ask HBS AI</strong><Icon name="arrow-up-right" size={14} /></button></div></section>
    </div>

    <div className="admin-grid lower">
      <section className="admin-panel admin-websites-panel"><div className="admin-panel-heading"><div><span className="admin-section-kicker">Portfolio</span><h3>Client websites</h3></div><button className="admin-text-button" onClick={() => onNavigate("Websites")}>View all <Icon name="arrow-up-right" size={13} /></button></div><div className="admin-site-list">{websites.length ? websites.slice(0, 5).map((site) => <button className="admin-site-row" key={`${site.name}-${site.domain}`} onClick={() => onNavigate("Websites")}><span className={`admin-site-thumb ${site.color}`}><Icon name="globe" size={17} /></span><span className="admin-site-copy"><strong>{site.name}</strong><small>{site.domain}</small></span><span className={`admin-status ${site.status.toLowerCase()}`}><i />{site.status}</span><span className="admin-site-time">{site.updated}</span><Icon name="arrow-up-right" size={14} /></button>) : <div className="admin-empty-state compact"><strong>No websites connected yet</strong><p>Create your first managed website to begin.</p></div>}</div></section>
      <section className="admin-panel admin-activity-panel"><div className="admin-panel-heading"><div><span className="admin-section-kicker">Latest changes</span><h3>Recent activity</h3></div><button className="admin-text-button" onClick={() => onNavigate("Tasks")}>View tasks <Icon name="arrow-up-right" size={13} /></button></div><div className="admin-activity-list">{activities.length ? activities.slice(0, 6).map((activity, index) => <div className="admin-activity-row" key={`${activity.title}-${index}`}><span className={`admin-activity-dot ${activity.tone}`} /><span><strong>{activity.title}</strong><small>{activity.detail}</small></span><time>{activity.time}</time></div>) : <div className="admin-empty-state compact"><strong>No recent activity</strong><p>Updates will appear here as work is completed.</p></div>}</div></section>
    </div>

    <section className="admin-panel admin-service-strip"><div><span className="admin-section-kicker">Infrastructure</span><h3>Connected services</h3></div>{[{ name: "GitHub", mark: "GH" }, { name: "Vercel", mark: "▲" }, { name: "Supabase", mark: "S" }].map((service) => <div className="admin-service-pill" key={service.name}><span>{service.mark}</span><div><strong>{service.name}</strong><small><i />Connected</small></div></div>)}<button className="admin-text-button" onClick={() => onNavigate("Integrations")}>Manage <Icon name="arrow-up-right" size={13} /></button></section>
  </>;
}

export default function AdminPage() {
  const [activeView, setActiveView] = useState<AdminView>("Overview");
  const [builderStart, setBuilderStart] = useState(0);
  const [builderDirty, setBuilderDirty] = useState(false);
  const [createSignal, setCreateSignal] = useState(0);
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [websites, setWebsites] = useState<Website[]>([]);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [stats, setStats] = useState<DashboardStats>(fallbackStats);
  const [crm, setCrm] = useState<CrmSummary>(fallbackCrm);
  const [connected, setConnected] = useState(false);
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState("");

  const navigate = (view: AdminView, startWebsite = false) => {
    if (activeView === "Websites" && view !== activeView && builderDirty && !window.confirm("Leave the builder and discard unsaved changes?")) return;
    setBuilderDirty(false);
    if (view === "Websites") setBuilderStart(startWebsite ? (value) => value + 1 : 0);
    setActiveView(view);
  };

  const create = (view: "Pipeline" | "Tasks" | "Websites") => {
    if (view === "Websites") navigate("Websites", true);
    else { setCreateSignal((value) => value + 1); navigate(view); }
  };

  useEffect(() => {
    let mounted = true;
    Promise.all([fetch("/api/admin/overview", { cache: "no-store" }), fetch("/api/admin/crm", { cache: "no-store" })])
      .then(async ([overviewResponse, crmResponse]) => {
        if (!overviewResponse.ok || !crmResponse.ok) throw new Error("Workspace data could not be loaded.");
        const [overviewData, crmData] = await Promise.all([overviewResponse.json(), crmResponse.json()]);
        if (!mounted) return;
        setWebsites(overviewData.websites ?? []);
        setActivities(overviewData.activities ?? []);
        setStats(overviewData.stats ?? fallbackStats);
        setCrm(crmData);
        setConnected(true);
      })
      .catch(() => { if (mounted) setNotice("Some live workspace data could not be loaded."); })
      .finally(() => { if (mounted) setLoading(false); });
    return () => { mounted = false; };
  }, []);

  const module = useMemo(() => {
    if (activeView === "Overview") return <Overview websites={websites} activities={activities} stats={stats} crm={crm} loading={loading} onNavigate={navigate} onCreate={create} />;
    if (activeView === "Websites") return <BuilderPanel startNew={builderStart} onDirty={setBuilderDirty} />;
    if (activeView === "AI Assistant") return <AiPanel />;
    if (activeView === "Integrations") return <IntegrationsPanel />;
    return <CrmPanel mode={activeView as "Pipeline" | "Clients" | "Tasks"} startCreate={createSignal} />;
  }, [activeView, activities, builderStart, createSignal, crm, loading, stats, websites]);

  return <AdminShell activeView={activeView} collapsed={collapsed} mobileOpen={mobileOpen} connected={connected} loading={loading} onNavigate={navigate} onToggleCollapsed={() => setCollapsed((value) => !value)} onToggleMobile={() => setMobileOpen((value) => !value)}><div className="admin-main">{module}</div>{notice ? <div className="admin-toast" role="status"><span>!</span>{notice}<button onClick={() => setNotice("")} aria-label="Dismiss notification"><Icon name="x" size={13} /></button></div> : null}</AdminShell>;
}
