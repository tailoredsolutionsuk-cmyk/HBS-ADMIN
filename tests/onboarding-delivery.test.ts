import test from "node:test";
import assert from "node:assert/strict";
import { deliveryPacket } from "../lib/onboarding/delivery.ts";
import { EMPTY_BRIEF, type Project } from "../lib/onboarding/model.ts";

const project: Project = {
  id: "233ade54-4ae2-4e56-a9e3-e4a778536518", client_id: "client-a", name: "New site and ads", service: "Website and Meta Ads",
  target_date: null, status: "approved", revision: 6, review_note: null,
  brief: { ...EMPTY_BRIEF, business: "Mobile vehicle servicing", audience: "Local vehicle owners", goals: "Qualified enquiries", pages: "Home, services, contact" },
  created_at: "2026-10-16T09:00:00Z", updated_at: "2026-10-16T10:00:00Z",
};

test("approved client brief produces separate website and Meta handoffs without inventing money or an account", () => {
  const packet = deliveryPacket(project, "Example Motors");
  assert.equal(packet.projectId, project.id);
  assert.equal(packet.briefRevision, 6);
  assert.equal(packet.preparedFromApprovedBrief, true);
  assert.equal(packet.website.clientName, "Example Motors");
  assert.equal(packet.website.audienceSource, "Local vehicle owners");
  assert.equal(packet.metaAds.objectiveSource, "Qualified enquiries");
  assert.equal(packet.metaAds.budgetGbp, null);
  assert.equal(packet.metaAds.accountId, null);
  assert.ok(packet.metaAds.missing.some(item => item.includes("budget")));
  assert.ok(packet.website.steps.at(-1)?.ownerApproval);
  assert.ok(packet.metaAds.steps.some(item => item.title.includes("access request") && item.ownerApproval));
  assert.ok(packet.metaAds.steps.some(item => item.title.includes("proposal") && item.ownerApproval));
  assert.ok(packet.metaAds.steps.every(item => !item.title.toLowerCase().includes("launch")));
});

test("unapproved or incomplete brief cannot be described as approved or ready for ad spending", () => {
  const packet = deliveryPacket({ ...project, status: "submitted", brief: EMPTY_BRIEF }, "Example Motors");
  assert.equal(packet.preparedFromApprovedBrief, false);
  assert.ok(packet.website.missing.some(item => item.includes("services")));
  assert.ok(packet.metaAds.missing.some(item => item.includes("owner approval")));
});
