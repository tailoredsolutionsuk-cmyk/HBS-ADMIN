import assert from "node:assert/strict";
import test from "node:test";
import { leadDisplayName, outreachBucket, whatsAppLink } from "../lib/crm/outreach-worklist.ts";
import type { OutreachLead, OutreachLeadStats } from "../lib/crm/outreach.ts";
const lead: OutreachLead = { id:"lead", business_name:"Example", email:null, phone:null, main_location:null, status:"New", source:null, notes:null, next_action:null, next_action_at:null };
const record: OutreachLeadStats = { leadId:"lead", attempts:1, meetingBooked:false, lastOutreachAt:"2026-11-01T10:00:00Z", firstOutreachAt:"2026-11-01T10:00:00Z", bookingId:null, meetingAt:null, canUndoBooking:false, history:[] };
test("work queues distinguish real replies, bookings, due work and closed sequences", () => {
  const now = new Date("2026-11-04T10:00:00Z");
  assert.equal(outreachBucket(lead, undefined, now), "new");
  assert.equal(outreachBucket(lead, record, now), "due");
  assert.equal(outreachBucket(lead, {...record, sequenceStatus:"response_received"}, now), "replied");
  assert.equal(outreachBucket(lead, {...record, sequenceStatus:"sequence_stopped"}, now), "closed");
  assert.equal(outreachBucket(lead, {...record, meetingBooked:true}, now), "booked");
  assert.equal(outreachBucket(lead, record, new Date("2026-11-01T11:00:00Z")), "waiting");
  assert.equal(outreachBucket(lead, record, new Date("2026-11-20T10:00:00Z")), "closed");
});
test("WhatsApp links normalise UK and explicit international numbers without guessing", () => {
  assert.equal(whatsAppLink("07700 900123"), "https://wa.me/447700900123");
  assert.equal(whatsAppLink("+44 (0)7700 900123"), "https://wa.me/447700900123");
  assert.equal(whatsAppLink("0044 7700 900123"), "https://wa.me/447700900123");
  assert.equal(whatsAppLink("+1 (202) 555-0123", "Hi & hello"), "https://wa.me/12025550123?text=Hi%20%26%20hello");
  for (const phone of [null,"Mobile Number","07700 123 / 07800 456","1234567890","javascript:alert(1)","0000"]) assert.equal(whatsAppLink(phone), null);
});
test("display cleanup removes scraped UI instructions while preserving the stored business name", () => {
  const stored = "Example GarageClick to open side panel for more information";
  assert.equal(leadDisplayName(stored), "Example Garage");
  assert.equal(stored, "Example GarageClick to open side panel for more information");
});

