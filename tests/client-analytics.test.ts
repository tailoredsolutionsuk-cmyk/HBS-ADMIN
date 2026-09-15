import assert from "node:assert/strict";
import test from "node:test";
import { summarizeClientAnalytics, type ClientPageView } from "../lib/crm/client-analytics.ts";

const view = (overrides: Partial<ClientPageView>): ClientPageView => ({
  client_id: "client-a",
  path: "/",
  timestamp: "2026-09-15T09:00:00.000Z",
  visitor_hash: "visitor-1",
  referrer: null,
  device: "desktop",
  browser: "Chrome",
  ...overrides,
});

test("returns a 30-day analytics record for every client", () => {
  const result = summarizeClientAnalytics(["client-a", "client-b"], [view({})], new Date("2026-09-15T12:00:00.000Z"));

  assert.equal(result.length, 2);
  assert.equal(result[0].views, 1);
  assert.equal(result[0].visitors, 1);
  assert.equal(result[0].daily.length, 30);
  assert.deepEqual(result[1], {
    clientId: "client-b",
    views: 0,
    visitors: 0,
    trackedPages: 0,
    lastSeenAt: null,
    daily: result[1].daily,
    pages: [],
    referrers: [],
    devices: [],
    browsers: [],
  });
  assert.ok(result[1].daily.every((day) => day.value === 0));
});

test("keeps traffic scoped to its client and excludes dates outside the window", () => {
  const result = summarizeClientAnalytics(
    ["client-a", "client-b"],
    [
      view({ path: "/services", visitor_hash: "visitor-1" }),
      view({ path: "/services", visitor_hash: "visitor-1", timestamp: "2026-09-14T09:00:00.000Z" }),
      view({ client_id: "client-b", path: "/contact", visitor_hash: "visitor-2" }),
      view({ timestamp: "2026-08-01T09:00:00.000Z" }),
      view({ client_id: "not-a-client" }),
    ],
    new Date("2026-09-15T12:00:00.000Z"),
  );

  assert.equal(result[0].views, 2);
  assert.equal(result[0].visitors, 1);
  assert.deepEqual(result[0].pages, [{ label: "/services", value: 2 }]);
  assert.equal(result[1].views, 1);
  assert.equal(result[1].pages[0].label, "/contact");
});
