import test from "node:test";
import assert from "node:assert/strict";
import { packetStillCurrent, reviewArtifactsReady, type ReviewPacket, type ReviewProject, type ReviewProposal, type ReviewSite } from "../lib/onboarding/review-packet.ts";

const project: ReviewProject = { id:"233ade54-4ae2-4e56-a9e3-e4a778536518",client_id:"client-a",status:"approved",revision:5 };
const site: ReviewSite = { id:project.id,client_id:project.client_id,revision:2,preview_revision:2,preview_deployment:"dpl_preview",preview_url:"https://client-preview.example.test" };
const proposal: ReviewProposal = { project_id:project.id,source_brief_revision:5,revision:3,reviewed_revision:3,review_decision:"approved",draft:{landingPage:"https://client-preview.example.test/contact"} };
const packet: ReviewPacket = { id:"d94e5795-c47c-44fd-9eeb-aedc3773d85f",project_id:project.id,brief_revision:5,site_revision:2,preview_deployment:"dpl_preview",preview_url:site.preview_url!,proposal_revision:3 };

test("owner can share only a ready client-linked preview and exact approved proposal", () => {
  assert.equal(reviewArtifactsReady(project,site,proposal),true);
  assert.equal(packetStillCurrent(project,site,proposal,packet),true);
  assert.equal(reviewArtifactsReady(project,{...site,client_id:"other-client"},proposal),false);
  assert.equal(reviewArtifactsReady(project,site,{...proposal,reviewed_revision:2}),false);
});

test("a changed website, deployment, brief or proposal makes client review stale", () => {
  assert.equal(packetStillCurrent(project,{...site,revision:3},proposal,packet),false);
  assert.equal(packetStillCurrent(project,{...site,preview_deployment:"dpl_other"},proposal,packet),false);
  assert.equal(packetStillCurrent({...project,revision:6},site,proposal,packet),false);
  assert.equal(packetStillCurrent(project,site,{...proposal,revision:4},packet),false);
});
