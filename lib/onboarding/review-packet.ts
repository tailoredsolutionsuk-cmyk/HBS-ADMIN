import { landingMatchesPreview } from "./meta-proposal.ts";

export type ReviewProject = { id: string; client_id: string; status: string; revision: number };
export type ReviewSite = { id: string; client_id: string | null; revision: number; preview_revision: number | null; preview_deployment: string | null; preview_url: string | null };
export type ReviewProposal = { project_id: string; source_brief_revision: number; revision: number; reviewed_revision: number | null; review_decision: string | null; draft: { landingPage?: unknown } };
export type ReviewPacket = { id: string; project_id: string; brief_revision: number; site_revision: number; preview_deployment: string; preview_url: string; proposal_revision: number };

export function reviewArtifactsReady(project: ReviewProject, site: ReviewSite | null, proposal: ReviewProposal | null): boolean {
  return project.status === "approved" && Boolean(site && proposal &&
    site.id === project.id && site.client_id === project.client_id &&
    site.preview_revision === site.revision && site.preview_deployment && site.preview_url &&
    proposal.project_id === project.id && proposal.source_brief_revision === project.revision &&
    proposal.reviewed_revision === proposal.revision && proposal.review_decision === "approved" &&
    typeof proposal.draft?.landingPage === "string" && landingMatchesPreview(proposal.draft.landingPage, site.preview_url));
}

export function packetStillCurrent(project: ReviewProject, site: ReviewSite | null, proposal: ReviewProposal | null, packet: ReviewPacket): boolean {
  return reviewArtifactsReady(project, site, proposal) &&
    packet.project_id === project.id && packet.brief_revision === project.revision &&
    packet.site_revision === site!.revision && packet.preview_deployment === site!.preview_deployment &&
    packet.preview_url === site!.preview_url && packet.proposal_revision === proposal!.revision;
}

export function clientApprovedCurrentPacket(project: ReviewProject, site: ReviewSite | null, proposal: ReviewProposal | null, packet: ReviewPacket | null, latestDecision: string | null): boolean {
  return Boolean(packet && latestDecision === "approved" && packetStillCurrent(project, site, proposal, packet));
}
