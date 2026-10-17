import type { Project } from "./model";
import { MetaProposalError, parseMetaProposal, type MetaProposal } from "./meta-proposal.ts";

export type MetaCopy = { primaryText: string; headline: string; creativeBrief: string };
export const metaCopySchema = {
  type: "object" as const, additionalProperties: false,
  required: ["primaryText", "headline", "creativeBrief"],
  properties: {
    primaryText: { type: "string" as const, maxLength: 2000 },
    headline: { type: "string" as const, maxLength: 300 },
    creativeBrief: { type: "string" as const, maxLength: 2000 },
  },
};

export function metaCopyInput(project: Pick<Project, "brief" | "revision">, draft: MetaProposal): string {
  const value = JSON.stringify({
    approvedBriefRevision: project.revision,
    source: {
      business: project.brief.business, audience: project.brief.audience, goals: project.brief.goals,
      brand: project.brief.brand, content: project.brief.content, industry: project.brief.industry,
      services: project.brief.services, location: project.brief.location, offer: project.brief.offer,
      targetGeography: project.brief.targetGeography, assetRights: project.brief.assetRights,
    },
    proposal: {
      objective: draft.objective, offer: draft.offer, audience: draft.audience,
      geography: draft.geography, landingPage: draft.landingPage,
      conversionEvent: draft.conversionEvent, budgetProposal: draft.budgetProposal,
      assetRights: draft.assetRights, existingPrimaryText: draft.primaryText,
      existingHeadline: draft.headline, existingCreativeBrief: draft.creativeBrief,
    },
  });
  if (value.length > 24_000) throw new MetaProposalError("The approved brief is too long for one AI copy draft. Shorten the source text first.");
  return value;
}

export function applyMetaCopy(draft: MetaProposal, value: MetaCopy): MetaProposal {
  return parseMetaProposal({ ...draft, primaryText: value.primaryText, headline: value.headline, creativeBrief: value.creativeBrief });
}
