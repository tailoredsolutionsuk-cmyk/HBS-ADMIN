"use client";

import { useMemo } from "react";
import { Icon, MetricCard, type AdminView } from "./admin-ui";

type Client = { id: string; business_name: string; status: string | null };
type Lead = { id: string; business_name: string; status: string; estimated_value: number | null; probability: number; converted_business_id: string | null; next_action: string | null; next_action_at: string | null };
type Task = { id: string; client_id: string | null; title: string; priority: string; status: string; done: boolean; due_date: string | null };
type ClientAnalytics = { clientId: string; views: number; visitors: number; trackedPages: number; lastSeenAt: string | null };
type PortalUser = { client_id: string; disabled: boolean; last_login_at: string | null; login_count: number };
type ProjectActivity = { id: string; project_name: string; action: string; summary: string; occurred_at: string };

export type MetricsCrmData = {
  clients: Client[];
  clientAnalytics: ClientAnalytics[];
  leads: Lead[];
  tasks: Task[];
  portalUsers: PortalUser[];
  projectActivities: ProjectActivity[];
  metrics: { clients: number; openLeads: number; pipelineValue: number; weightedValue: number; overdueFollowUps: number; tasksDue: number };
};

const stages = ["New", "Contacted", "Qualified", "Proposal", "Won", "Lost"];
const money = (value: number) => new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP", maximumFractionDigits: 0 }).format(value);
const number = (value: number) => new Intl.NumberFormat("en-GB").format(value);
const shortDate = (value: string) => new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric" }).format(new Date(value));

export default function MetricsPanel({ data, loading, onNavigate }: { data: MetricsCrmData; loading: boolean; onNavigate: (view: AdminView) => void }) {
  const dashboard = useMemo(() => {
    const today = new Date().toISOString().slice(0, 10);
    const completedTasks = data.tasks.filter((task) => task.done || task.status === "done").length;
    const overdueTasks = data.tasks.filter((task) => !task.done && task.due_date && task.due_date < today).length;
    const totalViews = data.clientAnalytics.reduce((sum, item) => sum + item.views, 0);
    const totalVisitors = data.clientAnalytics.reduce((sum, item) => sum + item.visitors, 0);
    const completionRate = data.tasks.length ? Math.round((completedTasks / data.tasks.length) * 100) : 0;
    const totalLogins = data.portalUsers.reduce((sum, user) => sum + (user.login_count || 0), 0);

    const pipeline = stages.map((stage) => {
      const matching = data.leads.filter((lead) => lead.status === stage);
      return { stage, count: matching.length, value: matching.reduce((sum, lead) => sum + (lead.estimated_value || 0), 0) };
    });
    const maxPipelineValue = Math.max(1, ...pipeline.map((item) => item.value));

    const taskStatuses = [
      { label: "To do", value: data.tasks.filter((task) => !task.done && task.status === "todo").length, tone: "todo" },
      { label: "In progress", value: data.tasks.filter((task) => !task.done && task.status === "in_progress").length, tone: "progress" },
      { label: "Blocked", value: data.tasks.filter((task) => !task.done && task.status === "blocked").length, tone: "blocked" },
      { label: "Overdue", value: overdueTasks, tone: "overdue" },
      { label: "Complete", value: completedTasks, tone: "done" },
    ];

    const analyticsMap = new Map(data.clientAnalytics.map((item) => [item.clientId, item]));
    const clients = data.clients.map((client) => {
      const analytics = analyticsMap.get(client.id);
      const tasks = data.tasks.filter((task) => task.client_id === client.id);
      const portalUsers = data.portalUsers.filter((user) => user.client_id === client.id && !user.disabled);
      return {
        id: client.id,
        name: client.business_name,
        status: client.status || "active",
        views: analytics?.views || 0,
        visitors: analytics?.visitors || 0,
        openTasks: tasks.filter((task) => !task.done).length,
        completedTasks: tasks.filter((task) => task.done).length,
        portalLogins: portalUsers.reduce((sum, user) => sum + (user.login_count || 0), 0),
        lastSeenAt: analytics?.lastSeenAt || null,
      };
    }).sort((a, b) => b.views - a.views || b.openTasks - a.openTasks || a.name.localeCompare(b.name));

    return { completedTasks, overdueTasks, totalViews, totalVisitors, completionRate, totalLogins, pipeline, maxPipelineValue, taskStatuses, clients };
  }, [data]);

  if (loading) return <div className="admin-dashboard-skeleton" aria-busy="true" aria-label="Loading business metrics"><span /><span /><span /><span /></div>;

  return <div className="admin-metrics-page">
    <section className="admin-welcome admin-metrics-welcome">
      <div><span className="admin-kicker">CRM intelligence</span><h2>Business metrics</h2><p>A live view of sales, delivery, client traffic and portal engagement.</p></div>
      <span className="admin-analytics-live"><i />Live CRM data</span>
    </section>

    <section className="admin-stats" aria-label="Key CRM metrics">
      <MetricCard icon="activity" tone="mint" label="Pipeline value" value={money(data.metrics.pipelineValue)} detail={`${data.metrics.openLeads} active opportunities`} />
      <MetricCard icon="briefcase" tone="blue" label="Weighted forecast" value={money(data.metrics.weightedValue)} detail="Probability adjusted" />
      <MetricCard icon="chart" tone="peach" label="Website views" value={number(dashboard.totalViews)} detail={`${number(dashboard.totalVisitors)} visitors · last 30 days`} />
      <MetricCard icon="layers" tone="lavender" label="Work completed" value={`${dashboard.completionRate}%`} detail={`${dashboard.completedTasks} of ${data.tasks.length} tasks`} />
    </section>

    <div className="admin-metrics-grid">
      <section className="admin-panel admin-metrics-funnel">
        <div className="admin-panel-heading"><div><span className="admin-section-kicker">Sales dashboard</span><h3>Pipeline by stage</h3></div><button className="admin-text-button" onClick={() => onNavigate("Pipeline")}>Open pipeline <Icon name="arrow-up-right" size={13} /></button></div>
        <div className="admin-metrics-summary"><span><strong>{data.metrics.openLeads}</strong> open leads</span><span className={data.metrics.overdueFollowUps ? "attention" : ""}><strong>{data.metrics.overdueFollowUps}</strong> overdue follow-ups</span></div>
        <div className="admin-funnel-list">
          {dashboard.pipeline.map((item) => <div className="admin-funnel-row" key={item.stage}>
            <div><strong>{item.stage}</strong><small>{item.count} {item.count === 1 ? "opportunity" : "opportunities"}</small></div>
            <div className="admin-funnel-track" role="img" aria-label={`${item.stage}: ${money(item.value)}`}><span className={`stage-${item.stage.toLowerCase().replace(" ", "-")}`} style={{ width: `${item.value ? Math.max(8, Math.round((item.value / dashboard.maxPipelineValue) * 100)) : 0}%` }} /></div>
            <b>{money(item.value)}</b>
          </div>)}
        </div>
      </section>

      <section className="admin-panel admin-work-health">
        <div className="admin-panel-heading"><div><span className="admin-section-kicker">Delivery dashboard</span><h3>Work health</h3></div><button className="admin-text-button" onClick={() => onNavigate("Tasks")}>Open tasks <Icon name="arrow-up-right" size={13} /></button></div>
        <div className="admin-work-health-grid">{dashboard.taskStatuses.map((item) => <div className={item.tone} key={item.label}><span>{item.label}</span><strong>{item.value}</strong></div>)}</div>
        <div className="admin-metrics-callout"><span><Icon name="users" size={17} /></span><div><strong>{number(dashboard.totalLogins)} client portal logins</strong><small>{data.portalUsers.filter((user) => !user.disabled).length} {data.portalUsers.filter((user) => !user.disabled).length === 1 ? "active portal account" : "active portal accounts"}</small></div></div>
      </section>
    </div>

    <section className="admin-panel admin-client-scorecard">
      <div className="admin-panel-heading"><div><span className="admin-section-kicker">Client dashboard</span><h3>Client performance</h3></div><span className="admin-client-analytics-count">Last 30 days</span></div>
      {dashboard.clients.length ? <div className="admin-scorecard-table" aria-label="Client performance metrics">
        <div className="admin-scorecard-head" aria-hidden="true"><span>Client</span><span>Website</span><span>Work</span><span>Portal</span><span>Latest traffic</span></div>
        {dashboard.clients.map((client) => <button className="admin-scorecard-row" key={client.id} onClick={() => onNavigate("Clients")}>
          <span><strong>{client.name}</strong><small>{client.status}</small></span>
          <span><strong>{number(client.views)} views</strong><small>{number(client.visitors)} visitors</small></span>
          <span><strong>{client.openTasks} open</strong><small>{client.completedTasks} completed</small></span>
          <span><strong>{client.portalLogins} logins</strong><small>{client.portalLogins ? "Engaged" : "No activity yet"}</small></span>
          <span><strong>{client.lastSeenAt ? shortDate(client.lastSeenAt) : "Waiting"}</strong><small>{client.lastSeenAt ? "Tracker reporting" : "No tracked visit"}</small></span>
        </button>)}
      </div> : <div className="admin-empty-state compact"><strong>No client metrics yet</strong><p>Add a client to begin tracking performance.</p></div>}
    </section>

    <section className="admin-panel admin-metrics-activity">
      <div className="admin-panel-heading"><div><span className="admin-section-kicker">Project delivery</span><h3>Latest project updates</h3></div><span className="admin-client-analytics-count">{data.projectActivities.length} tracked</span></div>
      {data.projectActivities.length ? <div className="admin-activity-list">{data.projectActivities.slice(0, 6).map((activity) => <div className="admin-activity-row" key={activity.id}><span className="admin-activity-dot success" /><span><strong>{activity.project_name}</strong><small>{activity.summary || activity.action}</small></span><time>{shortDate(activity.occurred_at)}</time></div>)}</div> : <div className="admin-empty-state compact"><strong>No project updates recorded</strong><p>Connected GitHub activity will appear here automatically.</p></div>}
    </section>
  </div>;
}
