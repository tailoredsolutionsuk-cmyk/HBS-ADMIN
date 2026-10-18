import assert from "node:assert/strict";
import test from "node:test";
import { summariseSales, type SalesLead } from "../lib/crm/sales-dashboard.ts";

const now = new Date("2026-10-18T12:00:00Z");
const lead = (overrides: Partial<SalesLead>): SalesLead => ({
  id: "a", business_name: "Example", status: "New", source: "Website", estimated_value: 1000,
  probability: 20, next_action: null, next_action_at: null, created_at: "2026-10-17T12:00:00Z", ...overrides,
});

test("sales summary separates open forecast from estimated wins and losses", () => {
  const summary = summariseSales([
    lead({ id: "open", probability: 50 }),
    lead({ id: "won", status: "Won", estimated_value: 3000 }),
    lead({ id: "lost", status: "Lost", estimated_value: 9000 }),
  ], now);
  assert.equal(summary.openCount, 1);
  assert.equal(summary.openValue, 1000);
  assert.equal(summary.weightedValue, 500);
  assert.equal(summary.wonValue, 3000);
  assert.equal(summary.closedWinRate, 50);
  assert.equal(summary.newLeads30d, 3);
});

test("sales summary sorts overdue follow-ups and counts seven-day work", () => {
  const summary = summariseSales([
    lead({ id: "later", next_action_at: "2026-10-18T11:00:00Z" }),
    lead({ id: "earlier", next_action_at: "2026-10-15T11:00:00Z" }),
    lead({ id: "upcoming", next_action_at: "2026-10-22T11:00:00Z" }),
    lead({ id: "closed", status: "Won", next_action_at: "2026-10-15T11:00:00Z" }),
  ], now);
  assert.deepEqual(summary.overdue.map((item) => item.id), ["earlier", "later"]);
  assert.deepEqual(summary.upcoming.map((item) => item.id), ["upcoming"]);
});

test("sales summary handles no closed deals without implying a win rate", () => {
  const summary = summariseSales([lead({ source: null, probability: 0 })], now);
  assert.equal(summary.closedWinRate, null);
  assert.equal(summary.sources[0].name, "Unspecified");
  assert.equal(summary.weightedValue, 0);
});
