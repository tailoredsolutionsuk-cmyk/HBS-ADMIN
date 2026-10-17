import test from "node:test";
import assert from "node:assert/strict";
import { applyMetaCopy, metaCopyInput } from "../lib/onboarding/meta-ai.ts";
import { suggestedMetaProposal } from "../lib/onboarding/meta-proposal.ts";
import { EMPTY_BRIEF, type Project } from "../lib/onboarding/model.ts";

const project: Project = {
  id:"233ade54-4ae2-4e56-a9e3-e4a778536518",client_id:"client-a",name:"Campaign",service:"Website and Meta Ads",target_date:null,
  status:"approved",revision:3,review_note:null,
  brief:{...EMPTY_BRIEF,business:"Example Motors services cars in Leeds",audience:"Local drivers",goals:"Enquiries",offer:"Winter check",budgetProposal:"£300 monthly"},
  created_at:"2026-10-17T09:00:00Z",updated_at:"2026-10-17T10:00:00Z",
};

test("AI copy input contains approved business context but no unrelated CRM fields", () => {
  const draft = suggestedMetaProposal(project);
  const input = metaCopyInput(project,draft);
  assert.match(input,/Example Motors/);
  assert.match(input,/approvedBriefRevision/);
  assert.ok(!input.includes(project.client_id));
  assert.ok(!input.includes(project.id));
});

test("AI copy can change only draft copy fields, never budget or destination", () => {
  const draft = {...suggestedMetaProposal(project),landingPage:"https://preview.example.test"};
  const result = applyMetaCopy(draft,{primaryText:"Book a winter check",headline:"Winter check",creativeBrief:"Use approved vehicle photo"});
  assert.equal(result.primaryText,"Book a winter check");
  assert.equal(result.budgetProposal,draft.budgetProposal);
  assert.equal(result.landingPage,draft.landingPage);
  assert.equal(result.accessRequestDraft,draft.accessRequestDraft);
  assert.throws(() => applyMetaCopy(draft,{primaryText:"x".repeat(2001),headline:"Title",creativeBrief:"Photo"}));
});
