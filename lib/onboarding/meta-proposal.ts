import type { Project } from "./model";

export type MetaProposal = {
  objective: string;
  offer: string;
  audience: string;
  geography: string;
  landingPage: string;
  conversionEvent: string;
  budgetProposal: string;
  primaryText: string;
  headline: string;
  creativeBrief: string;
  assetRights: string;
  accessRequestDraft: string;
};

export class MetaProposalError extends Error {}

const limits: Record<keyof MetaProposal, number> = {
  objective: 500, offer: 1000, audience: 1000, geography: 500, landingPage: 500,
  conversionEvent: 500, budgetProposal: 500, primaryText: 2000, headline: 300,
  creativeBrief: 2000, assetRights: 1000, accessRequestDraft: 2000,
};

export function parseMetaProposal(value: unknown): MetaProposal {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new MetaProposalError("Invalid Meta proposal.");
  const input = value as Record<string, unknown>;
  const result = {} as MetaProposal;
  for (const key of Object.keys(limits) as (keyof MetaProposal)[]) {
    const field = input[key];
    if (typeof field !== "string" || field.length > limits[key]) throw new MetaProposalError(`${key} must be text under ${limits[key] + 1} characters.`);
    result[key] = field.trim();
  }
  if (result.landingPage && !/^https:\/\/[^\s/?#]+(?:[^\s]*)$/i.test(result.landingPage)) throw new MetaProposalError("Use an HTTPS landing page URL.");
  return result;
}

export function proposalReviewGaps(draft: MetaProposal): (keyof MetaProposal)[] {
  const required: (keyof MetaProposal)[] = ["objective", "offer", "audience", "geography", "landingPage", "conversionEvent", "budgetProposal", "primaryText", "headline", "creativeBrief", "assetRights"];
  return required.filter(key => !draft[key]);
}

const fit = (value: string | undefined, max: number) => value?.trim().length && value.trim().length <= max ? value.trim() : "";

export function suggestedMetaProposal(project: Project): MetaProposal {
  return {
    objective: fit(project.brief.goals, 500), offer: fit(project.brief.offer, 1000),
    audience: fit(project.brief.audience, 1000), geography: fit(project.brief.targetGeography, 500),
    landingPage: "", conversionEvent: "", budgetProposal: fit(project.brief.budgetProposal, 500),
    primaryText: "", headline: "", creativeBrief: fit(project.brief.content, 2000),
    assetRights: fit(project.brief.assetRights, 1000),
    accessRequestDraft: "Please grant Hub Brand Scaling partner access to the Meta Business Portfolio, ad account and Facebook Page for this project. Confirm the correct account and Page names. Please do not send passwords.",
  };
}
