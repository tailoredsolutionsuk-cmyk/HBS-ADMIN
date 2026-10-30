import assert from "node:assert/strict";
import test from "node:test";
import { canEditOutreach, canUndoOutreach, outreachSince, parseOutreachEntry } from "../lib/crm/outreach.ts";
const entry = { id: "ab4182c3-8768-42b5-bdba-572773329afb", leadId: "70cc6fd7-f28a-4240-aa1a-e87481e3e158", kind: "outreach", method: "call", notes: " Called the business " };

test("outreach needs a valid lead, event ID and recorded method", () => {
  assert.equal(parseOutreachEntry(entry)?.notes, "Called the business");
  for (const patch of [{ id: "bad" }, { leadId: "bad" }, { method: null }, { method: "sms" }, { kind: "send_email" }, { notes: "x".repeat(2001) }]) assert.equal(parseOutreachEntry({ ...entry, ...patch }), null);
  assert.equal(parseOutreachEntry(null), null);
});
test("meeting bookings are a distinct event and can have an optional date", () => {
  const meeting = parseOutreachEntry({ ...entry, kind: "meeting_booked", method: null, meetingAt: "2026-11-02T10:30:00Z" });
  assert.equal(meeting?.kind, "meeting_booked");
  assert.equal(meeting?.meetingAt, "2026-11-02T10:30:00.000Z");
  assert.equal(parseOutreachEntry({ ...entry, meetingAt: "2026-11-02T10:30:00Z" }), null);
  assert.equal(parseOutreachEntry({ ...entry, kind: "meeting_booked", meetingAt: "invalid" }), null);
  assert.equal(parseOutreachEntry({ ...entry, kind: "meeting_booked", meetingAt: 0 }), null);
});
test("UK reporting days respect BST and clock-change boundaries", () => {
  assert.equal(outreachSince("today", new Date("2026-07-02T00:15:00Z")), "2026-07-01T23:00:00.000Z");
  assert.equal(outreachSince("today", new Date("2026-10-25T12:00:00Z")), "2026-10-24T23:00:00.000Z");
  assert.equal(outreachSince("today", new Date("2026-10-26T12:00:00Z")), "2026-10-26T00:00:00.000Z");
  assert.equal(outreachSince("7d", new Date("2026-10-29T12:00:00Z")), "2026-10-22T23:00:00.000Z");
  assert.equal(outreachSince("30d", new Date("2026-10-29T12:00:00Z")), "2026-09-29T23:00:00.000Z");
  assert.equal(outreachSince("all"), null);
});
test("read-only staff cannot record activity; editors undo only their own entries", () => {
  assert.equal(canEditOutreach("viewer"), false);
  assert.equal(canEditOutreach("editor"), true);
  assert.equal(canUndoOutreach("editor", "one", "two"), false);
  assert.equal(canUndoOutreach("editor", "one", "one"), true);
  assert.equal(canUndoOutreach("admin", "one", "two"), true);
  assert.equal(canUndoOutreach("viewer", "one", "one"), false);
});
