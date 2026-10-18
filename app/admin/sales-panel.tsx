"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Icon, MetricCard } from "./admin-ui";
import { salesStages, summariseSales, type SalesLead } from "../../lib/crm/sales-dashboard";

const money = (value: number) => new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP", maximumFractionDigits: 0 }).format(value);
const dateTime = (value: string) => new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeStyle: "short", timeZone: "Europe/London" }).format(new Date(value));

export default function SalesPanel({ onOpenPipeline, onAddLead }: { onOpenPipeline: () => void; onAddLead: () => void }) {
  const [leads, setLeads] = useState<SalesLead[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [refreshSignal, setRefreshSignal] = useState(0);
  const refresh = useCallback(() => setRefreshSignal((value) => value + 1), []);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError("");
    fetch("/api/admin/crm", { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) throw new Error("Sales data could not be loaded.");
        const data = await response.json() as { leads?: SalesLead[] };
        if (!Array.isArray(data.leads)) throw new Error("Sales data is incomplete.");
        if (active) setLeads(data.leads);
      })
      .catch((reason) => { if (active) setError(reason instanceof Error ? reason.message : "Sales data could not be loaded."); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [refreshSignal]);

  const sales = useMemo(() => summariseSales(leads || []), [leads]);
  const maxStageValue = Math.max(1, ...sales.stages.map((stage) => stage.value));

  return <div className="admin-sales-page">
    <section className="admin-welcome admin-sales-welcome"><div><span className="admin-kicker">CRM intelligence</span><h2>Sales dashboard</h2><p>Track opportunities, forecast value, wins and the conversations that need attention.</p></div><div className="admin-welcome-actions"><button className="admin-outline-button" onClick={refresh} disabled={loading}>Refresh</button><button className="admin-primary-button" onClick={onAddLead}><Icon name="plus" size={15} />Add lead</button></div></section>
    {error ? <div className="admin-sales-error" role="alert">{error} {leads ? "Showing the last loaded figures." : ""}<button className="admin-text-button" onClick={refresh}>Try again</button></div> : null}
    {loading && !leads ? <div className="admin-dashboard-skeleton" aria-busy="true" aria-label="Loading sales dashboard"><span /><span /><span /><span /></div> : !leads ? null : <>
      <section className="admin-stats" aria-label="Sales key figures">
        <MetricCard icon="activity" tone="mint" label="Open pipeline" value={money(sales.openValue)} detail={`${sales.openCount} active opportunities · estimated`} />
        <MetricCard icon="briefcase" tone="blue" label="Weighted forecast" value={money(sales.weightedValue)} detail="Estimated value × win probability" />
        <MetricCard icon="chart" tone="peach" label="Won deal value" value={money(sales.wonValue)} detail={`${sales.wonCount} won · estimated, not invoiced revenue`} />
        <MetricCard icon="users" tone="lavender" label="Closed win rate" value={sales.closedWinRate === null ? "—" : `${sales.closedWinRate}%`} detail={sales.closedWinRate === null ? "No closed opportunities yet" : "Won ÷ all won and lost deals"} />
      </section>
      <div className="admin-sales-highlights"><span><strong>{sales.newLeads30d}</strong> new leads in 30 days</span><span className={sales.overdue.length ? "attention" : ""}><strong>{sales.overdue.length}</strong> overdue follow-ups</span><span><strong>{sales.upcoming.length}</strong> follow-ups in the next 7 days</span></div>
      <div className="admin-sales-grid">
        <section className="admin-panel"><div className="admin-panel-heading"><div><span className="admin-section-kicker">Opportunity flow</span><h3>Pipeline by stage</h3></div><button className="admin-text-button" onClick={onOpenPipeline}>Open pipeline <Icon name="arrow-up-right" size={13} /></button></div><div className="admin-sales-stage-list">{salesStages.map((name) => { const stage = sales.stages.find((item) => item.name === name)!; return <div className="admin-sales-stage" key={name}><span><strong>{name}</strong><small>{stage.count} {stage.count === 1 ? "lead" : "leads"}</small></span><div className="admin-funnel-track" role="img" aria-label={`${name}: ${money(stage.value)}`}><span className={`stage-${name.toLowerCase()}`} style={{ width: `${stage.value ? Math.max(7, stage.value / maxStageValue * 100) : 0}%` }} /></div><b>{money(stage.value)}</b></div>; })}</div><p className="admin-sales-note">Values are lead estimates; they are not confirmed revenue.</p></section>
        <section className="admin-panel"><div className="admin-panel-heading"><div><span className="admin-section-kicker">Next actions</span><h3>Follow-ups</h3></div><button className="admin-text-button" onClick={onOpenPipeline}>View all <Icon name="arrow-up-right" size={13} /></button></div>{sales.overdue.length || sales.upcoming.length ? <div className="admin-sales-followups">{[...sales.overdue.slice(0, 4).map((lead) => ({ lead, overdue: true })), ...sales.upcoming.slice(0, 4).map((lead) => ({ lead, overdue: false }))].map(({ lead, overdue }) => <button key={lead.id} onClick={onOpenPipeline}><span className={overdue ? "late" : "soon"}>{overdue ? "Overdue" : "Upcoming"}</span><span><strong>{lead.business_name}</strong><small>{lead.next_action || "Follow up"}</small></span><time>{lead.next_action_at ? dateTime(lead.next_action_at) : ""}</time></button>)}</div> : <div className="admin-empty-state compact"><strong>No scheduled follow-ups</strong><p>Add a next-action date to a lead to see it here.</p></div>}</section>
      </div>
      <div className="admin-sales-grid">
        <section className="admin-panel"><div className="admin-panel-heading"><div><span className="admin-section-kicker">Highest-value opportunities</span><h3>Top open deals</h3></div></div>{sales.topOpportunities.length ? <div className="admin-sales-rows">{sales.topOpportunities.map((lead) => <button key={lead.id} onClick={onOpenPipeline}><span><strong>{lead.business_name}</strong><small>{lead.status} · {lead.probability ?? 0}% probability</small></span><b>{money(Math.max(0, Number(lead.estimated_value) || 0))}</b></button>)}</div> : <div className="admin-empty-state compact"><strong>No open opportunities</strong><p>Add a lead to start your sales pipeline.</p></div>}</section>
        <section className="admin-panel"><div className="admin-panel-heading"><div><span className="admin-section-kicker">Lead acquisition</span><h3>Sources of open leads</h3></div></div>{sales.sources.length ? <div className="admin-sales-rows">{sales.sources.map((source) => <div key={source.name}><span><strong>{source.name}</strong><small>{source.count} {source.count === 1 ? "lead" : "leads"}</small></span><b>{money(source.value)}</b></div>)}</div> : <div className="admin-empty-state compact"><strong>No sources yet</strong><p>Lead sources will appear as opportunities are added.</p></div>}</section>
      </div>
    </>}
  </div>;
}
