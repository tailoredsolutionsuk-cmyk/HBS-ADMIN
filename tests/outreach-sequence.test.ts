import assert from "node:assert/strict";
import test from "node:test";
import { followUpDraft, followUpSequence, parseOutreachEntry, type OutreachLeadStats } from "../lib/crm/outreach.ts";
const start = "2026-10-01T10:00:00Z";
const record: OutreachLeadStats = { leadId: "70cc6fd7-f28a-4240-aa1a-e87481e3e158", attempts: 1, meetingBooked: false, lastOutreachAt: start, firstOutreachAt: start, firstMethod: "email", sequenceSteps: [], bookingId: null, meetingAt: null, canUndoBooking: true, history: [] };
const day = (n: number) => new Date(Date.parse(start) + n * 86400000);
test("sequence starts only after a real first outreach; day 1 is due after 24 hours", () => {
  assert.equal(followUpSequence(undefined, "New", day(2)).status, "not_started");
  assert.equal(followUpSequence(record, "Contacted", day(0)).status, "scheduled");
  assert.equal(followUpSequence(record, "Contacted", day(1)).status, "due");
  assert.equal(followUpSequence(record, "Contacted", day(1)).step, 1);
});
test("days 3 and 7 are anchored to initial outreach rather than the last follow-up", () => {
  assert.equal(followUpSequence({ ...record, sequenceSteps: [1] }, "Contacted", day(2)).status, "scheduled");
  assert.equal(followUpSequence({ ...record, sequenceSteps: [1] }, "Contacted", day(3)).step, 3);
  assert.equal(followUpSequence({ ...record, sequenceSteps: [1,3] }, "Contacted", day(7)).step, 7);
  assert.equal(followUpSequence(record, "Contacted", day(8)).step, 1); // Never skip unlogged steps.
});
test("after final follow-up wait seven days; at day 14 close with no fourth message", () => {
  const done = { ...record, sequenceSteps: [1,3,7] };
  assert.equal(followUpSequence(done, "Contacted", day(13)).status, "waiting");
  assert.equal(followUpSequence(done, "Contacted", day(14)).status, "ended");
  assert.equal(followUpSequence(record, "Contacted", day(14)).step, null);
});
test("response, manual stop, a booked meeting and closed leads suppress follow-ups", () => {
  assert.equal(followUpSequence({ ...record, sequenceStatus: "response_received" }, "Contacted", day(3)).status, "stopped");
  assert.equal(followUpSequence({ ...record, sequenceStatus: "sequence_stopped" }, "Contacted", day(3)).status, "stopped");
  assert.equal(followUpSequence({ ...record, meetingBooked: true }, "Contacted", day(3)).status, "stopped");
  for (const status of ["Won", "Lost"]) assert.equal(followUpSequence(record, status, day(3)).status, "stopped");
});
test("a late final follow-up still gets a full seven-day waiting period", () => {
  const late = { ...record, sequenceSteps: [1,3,7], finalFollowUpAt: day(10).toISOString() };
  assert.equal(followUpSequence(late, "Contacted", day(14)).status, "waiting");
  assert.equal(followUpSequence(late, "Contacted", day(17)).status, "ended");
  assert.equal(followUpSequence(late, "Contacted", day(14)).dueAt, day(17).toISOString());
});
test("follow-up metadata cannot masquerade as another activity or skip schedule steps", () => {
  const entry = { id: "ab4182c3-8768-42b5-bdba-572773329afb", leadId: record.leadId, kind: "outreach", method: "email", sequenceStep: 1 };
  assert.equal(parseOutreachEntry(entry)?.sequenceStep, 1);
  for (const patch of [{ sequenceStep: 2 }, { sequenceStep: "1" }, { kind: "response_received" }, { kind: "meeting_booked" }]) assert.equal(parseOutreachEntry({ ...entry, ...patch }), null);
  assert.equal(parseOutreachEntry({ ...entry, kind: "response_received", method: null, sequenceStep: null })?.kind, "response_received");
});
test("drafts identify HBS and do not fabricate website findings", () => {
  for (const step of [1,3,7]) { const draft = followUpDraft("Example Business", step); assert.match(draft, /Example Business team/); assert.match(draft, /Harley\nHBS Marketing/); }
  assert.match(followUpDraft("Example", 7), /leave it here/);
});

