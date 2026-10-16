import test from "node:test";
import assert from "node:assert/strict";
import { parseMetaProposal, proposalReviewGaps, suggestedMetaProposal } from "../lib/onboarding/meta-proposal.ts";
import { EMPTY_BRIEF, type Project } from "../lib/onboarding/model.ts";

const project: Project = {
  id: "233ade54-4ae2-4e56-a9e3-e4a778536518", client_id: "client-a", name: "Website and ads", service: "Website and Meta Ads",
  target_date: null, status: "approved", revision: 4, review_note: null,
  brief: { ...EMPTY_BRIEF, goals: "Qualified enquiries", offer: "Winter check", audience: "Local drivers", targetGeography: "Leeds", budgetProposal: "£300 per month", content: "Client-supplied photography", assetRights: "Client owns photos" },
  created_at: "2026-10-16T09:00:00Z", updated_at: "2026-10-16T10:00:00Z",
};

test("Meta proposal starts with sourced fields and no invented copy or landing URL", () => {
  const draft = suggestedMetaProposal(project);
  assert.equal(draft.objective, "Qualified enquiries");
  assert.equal(draft.budgetProposal, "£300 per month");
  assert.equal(draft.primaryText, "");
  assert.equal(draft.landingPage, "");
  assert.match(draft.accessRequestDraft, /do not send passwords/i);
  assert.deepEqual(parseMetaProposal(draft), draft);
  assert.ok(proposalReviewGaps(draft).includes("landingPage"));
});

test("owner review requires an exact, complete proposal but does not treat budget as spending approval", () => {
  const draft = { ...suggestedMetaProposal(project), landingPage: "https://example.test/preview", conversionEvent: "Lead", primaryText: "Book a check", headline: "Winter check", creativeBrief: "Use client photo", assetRights: "Client owns photo" };
  assert.deepEqual(proposalReviewGaps(draft), []);
  assert.equal(parseMetaProposal(draft).budgetProposal, "£300 per month");
});

test("Meta proposal rejects unsafe links and non-text values", () => {
  const draft = suggestedMetaProposal(project);
  assert.throws(() => parseMetaProposal({ ...draft, landingPage: "javascript:alert(1)" }));
  assert.throws(() => parseMetaProposal({ ...draft, budgetProposal: 300 }));
  assert.throws(() => parseMetaProposal({ ...draft, primaryText: "x".repeat(2001) }));
});
