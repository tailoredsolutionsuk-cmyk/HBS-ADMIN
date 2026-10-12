"use client";

import { Analytics } from "@vercel/analytics/next";
import { SpeedInsights } from "@vercel/speed-insights/next";

// CRM URLs can contain client IDs, query parameters, or login tokens.
// Aggregate all telemetry under a fixed route rather than sending those URLs.
function redactUrl(url: string): string {
  return `${new URL(url).origin}/crm`;
}

export function PerformanceTracking() {
  return <>
    <Analytics beforeSend={(event) => ({ ...event, url: redactUrl(event.url) })} />
    <SpeedInsights beforeSend={(event) => ({ ...event, route: "/crm", url: redactUrl(event.url) })} />
  </>;
}
