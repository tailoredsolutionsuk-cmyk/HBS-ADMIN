import assert from "node:assert/strict";
import test from "node:test";
import { calendarAccountMatches, calendarKey, calendarRange, openCalendarValue, sameState, sealCalendarValue } from "../lib/calendar/google-core.ts";
import { calendarEvent, eventDays } from "../lib/calendar/calendar-events.ts";

test("calendar credentials are authenticated and separated from the source encryption key", () => {
  const hex = "17".repeat(32);
  const key = calendarKey(hex);
  assert.notDeepEqual(key, Buffer.from(hex, "hex"));
  const sealed = sealCalendarValue("private-refresh-token", key);
  assert.equal(openCalendarValue(sealed, key), "private-refresh-token");
  assert.notEqual(sealed, sealCalendarValue("private-refresh-token", key));
  const [iv, tag, ciphertext] = sealed.split(".");
  const changed = Buffer.from(ciphertext, "base64url"); changed[0] ^= 1;
  assert.throws(() => openCalendarValue(`${iv}.${tag}.${changed.toString("base64url")}`, key));
  assert.throws(() => openCalendarValue(sealed, calendarKey("18".repeat(32))));
  assert.throws(() => openCalendarValue("invalid", key));
  assert.throws(() => calendarKey("not-a-key"));
});

test("OAuth state requires an exact nonempty match", () => {
  assert.equal(sameState("fresh-random-state", "fresh-random-state"), true);
  assert.equal(sameState("fresh-random-State", "fresh-random-state"), false);
  assert.equal(sameState(null, "fresh-random-state"), false);
  assert.equal(sameState("", ""), false);
  assert.equal(sameState("truncated", "fresh-random-state"), false);
});

test("calendar consent must belong to the selected verified Google account", () => {
  assert.equal(calendarAccountMatches({ email: "tailoredsolutionsuk@gmail.com", email_verified: true }, "tailoredsolutionsuk@gmail.com"), true);
  assert.equal(calendarAccountMatches({ email: "harleyjayy14@gmail.com", email_verified: true }, "tailoredsolutionsuk@gmail.com"), false);
  assert.equal(calendarAccountMatches({ email: "tailoredsolutionsuk@gmail.com", email_verified: false }, "tailoredsolutionsuk@gmail.com"), false);
  assert.equal(calendarAccountMatches({ email: "tailoredsolutionsuk@gmail.com" }, "tailoredsolutionsuk@gmail.com"), false);
});

test("date queries reject impossible dates and oversized ranges, and cover UK BST boundaries", () => {
  assert.equal(calendarRange("2026-02-30", "2026-03-02"), null);
  assert.equal(calendarRange("2026-02-01", "2026-01-01"), null);
  assert.equal(calendarRange("2026-01-01", "2026-04-01"), null);
  assert.equal(calendarRange(null, "2026-04-01"), null);
  assert.equal(calendarRange("2026-03-29", "2026-03-29"), null);
  assert.deepEqual(calendarRange("2026-03-29", "2026-04-01"), { start: "2026-03-29", end: "2026-04-01", timeMin: "2026-03-28T00:00:00.000Z", timeMax: "2026-04-02T00:00:00.000Z" });
});

test("all-day spans use an exclusive end and preserve every visible day", () => {
  const event = calendarEvent({ id: "holiday", start: { date: "2026-11-19" }, end: { date: "2026-11-22" } });
  assert.ok(event);
  assert.equal(event.allDay, true);
  assert.deepEqual(eventDays(event, ["2026-11-18", "2026-11-19", "2026-11-20", "2026-11-21", "2026-11-22"]), ["2026-11-19", "2026-11-20", "2026-11-21"]);
});

test("UK date mapping accounts for BST, overnight appointments and midnight endings", () => {
  const event = calendarEvent({ id: "overnight", start: { dateTime: "2026-07-12T23:30:00Z" }, end: { dateTime: "2026-07-14T00:00:00+01:00" } });
  assert.ok(event);
  assert.deepEqual(eventDays(event, ["2026-07-12", "2026-07-13", "2026-07-14"]), ["2026-07-13"]);
  const winter = calendarEvent({ id: "winter", start: { dateTime: "2026-11-18T23:30:00Z" }, end: { dateTime: "2026-11-19T01:00:00Z" } });
  assert.ok(winter);
  assert.deepEqual(eventDays(winter, ["2026-11-18", "2026-11-19"]), ["2026-11-18", "2026-11-19"]);
});

test("event mapping omits cancelled or malformed events and unsafe external links", () => {
  assert.equal(calendarEvent({ id: "cancelled", status: "cancelled" }), null);
  assert.equal(calendarEvent({ id: "malformed", start: { dateTime: "bad" }, end: { dateTime: "bad" } }), null);
  const source = { id: "meeting", summary: "Client review", start: { dateTime: "2026-11-18T10:00:00Z" }, end: { dateTime: "2026-11-18T11:00:00Z" } };
  assert.equal(calendarEvent({ ...source, htmlLink: "javascript:alert(1)" })?.url, undefined);
  assert.equal(calendarEvent({ ...source, htmlLink: "https://calendar.google.com.attacker.example/event" })?.url, undefined);
  assert.equal(calendarEvent({ ...source, htmlLink: "https://calendar.google.com/calendar/event?eid=example" })?.url, "https://calendar.google.com/calendar/event?eid=example");
});
