export type AnalyticsValue = { label: string; value: number };

export type ClientPageView = {
  client_id: string | null;
  path: string | null;
  timestamp: string;
  visitor_hash: string | null;
  referrer: string | null;
  device: string | null;
  browser: string | null;
};

export type ClientAnalyticsSummary = {
  clientId: string;
  views: number;
  visitors: number;
  trackedPages: number;
  lastSeenAt: string | null;
  daily: AnalyticsValue[];
  pages: AnalyticsValue[];
  referrers: AnalyticsValue[];
  devices: AnalyticsValue[];
  browsers: AnalyticsValue[];
};

type Accumulator = {
  views: number;
  visitors: Set<string>;
  lastSeenAt: string | null;
  daily: Map<string, number>;
  pages: Map<string, number>;
  referrers: Map<string, number>;
  devices: Map<string, number>;
  browsers: Map<string, number>;
};

function addValue(counts: Map<string, number>, value: string | null, fallback: string) {
  const label = value?.trim() || fallback;
  counts.set(label, (counts.get(label) ?? 0) + 1);
}

function rankedValues(counts: Map<string, number>, limit: number) {
  return [...counts.entries()]
    .sort(([leftLabel, leftValue], [rightLabel, rightValue]) => rightValue - leftValue || leftLabel.localeCompare(rightLabel))
    .slice(0, limit)
    .map(([label, value]) => ({ label, value }));
}

export function summarizeClientAnalytics(
  clientIds: string[],
  pageViews: ClientPageView[],
  now = new Date(),
): ClientAnalyticsSummary[] {
  const dayKeys = Array.from({ length: 30 }, (_, index) => {
    const date = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    date.setUTCDate(date.getUTCDate() - (29 - index));
    return date.toISOString().slice(0, 10);
  });
  const firstDay = dayKeys[0];
  const lastDay = dayKeys[dayKeys.length - 1];
  const byClient = new Map<string, Accumulator>();

  for (const clientId of clientIds) {
    byClient.set(clientId, {
      views: 0,
      visitors: new Set(),
      lastSeenAt: null,
      daily: new Map(dayKeys.map((date) => [date, 0])),
      pages: new Map(),
      referrers: new Map(),
      devices: new Map(),
      browsers: new Map(),
    });
  }

  for (const view of pageViews) {
    if (!view.client_id) continue;
    const summary = byClient.get(view.client_id);
    const day = view.timestamp.slice(0, 10);
    if (!summary || day < firstDay || day > lastDay || Number.isNaN(Date.parse(view.timestamp))) continue;

    summary.views += 1;
    if (view.visitor_hash) summary.visitors.add(view.visitor_hash);
    if (!summary.lastSeenAt || view.timestamp > summary.lastSeenAt) summary.lastSeenAt = view.timestamp;
    summary.daily.set(day, (summary.daily.get(day) ?? 0) + 1);
    addValue(summary.pages, view.path, "/");
    addValue(summary.referrers, view.referrer, "Direct / unknown");
    addValue(summary.devices, view.device, "Unknown device");
    addValue(summary.browsers, view.browser, "Unknown browser");
  }

  return clientIds.map((clientId) => {
    const summary = byClient.get(clientId)!;
    return {
      clientId,
      views: summary.views,
      visitors: summary.visitors.size,
      trackedPages: summary.pages.size,
      lastSeenAt: summary.lastSeenAt,
      daily: dayKeys.map((date) => ({ label: date, value: summary.daily.get(date) ?? 0 })),
      pages: rankedValues(summary.pages, 5),
      referrers: rankedValues(summary.referrers, 3),
      devices: rankedValues(summary.devices, 3),
      browsers: rankedValues(summary.browsers, 3),
    };
  });
}
