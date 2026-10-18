export type SalesLead = {
  id: string;
  business_name: string;
  status: string;
  source: string | null;
  estimated_value: number | null;
  probability: number | null;
  next_action: string | null;
  next_action_at: string | null;
  created_at: string;
};

export const salesStages = ["New", "Contacted", "Qualified", "Proposal", "Won", "Lost"] as const;
const openStages = new Set(["New", "Contacted", "Qualified", "Proposal"]);

export function summariseSales(leads: SalesLead[], now = new Date()) {
  const today = now.valueOf();
  const nextWeek = today + 7 * 24 * 60 * 60 * 1000;
  const thirtyDaysAgo = today - 30 * 24 * 60 * 60 * 1000;
  const amount = (lead: SalesLead) => Math.max(0, Number(lead.estimated_value) || 0);
  const stage = (lead: SalesLead) => salesStages.find((item) => item.toLowerCase() === lead.status.toLowerCase()) || "New";
  const open = leads.filter((lead) => openStages.has(stage(lead)));
  const won = leads.filter((lead) => stage(lead) === "Won");
  const lost = leads.filter((lead) => stage(lead) === "Lost");
  const stages = salesStages.map((name) => {
    const matching = leads.filter((lead) => stage(lead) === name);
    return { name, count: matching.length, value: matching.reduce((total, lead) => total + amount(lead), 0) };
  });
  const sources = new Map<string, { count: number; value: number }>();
  for (const lead of open) {
    const name = lead.source?.trim() || "Unspecified";
    const current = sources.get(name) || { count: 0, value: 0 };
    sources.set(name, { count: current.count + 1, value: current.value + amount(lead) });
  }
  const withDate = open.map((lead) => ({ lead, due: lead.next_action_at ? Date.parse(lead.next_action_at) : NaN }));
  const overdue = withDate.filter(({ due }) => Number.isFinite(due) && due < today).sort((a, b) => a.due - b.due);
  const upcoming = withDate.filter(({ due }) => Number.isFinite(due) && due >= today && due <= nextWeek).sort((a, b) => a.due - b.due);
  return {
    openCount: open.length,
    openValue: open.reduce((total, lead) => total + amount(lead), 0),
    weightedValue: open.reduce((total, lead) => total + amount(lead) * Math.max(0, Math.min(100, Number(lead.probability) || 0)) / 100, 0),
    wonValue: won.reduce((total, lead) => total + amount(lead), 0),
    wonCount: won.length,
    closedWinRate: won.length + lost.length ? Math.round(won.length / (won.length + lost.length) * 100) : null,
    newLeads30d: leads.filter((lead) => { const created = Date.parse(lead.created_at); return Number.isFinite(created) && created >= thirtyDaysAgo && created <= today; }).length,
    overdue: overdue.map(({ lead }) => lead),
    upcoming: upcoming.map(({ lead }) => lead),
    topOpportunities: [...open].sort((a, b) => amount(b) - amount(a)).slice(0, 5),
    stages,
    sources: [...sources].map(([name, values]) => ({ name, ...values })).sort((a, b) => b.count - a.count || b.value - a.value).slice(0, 5),
  };
}
