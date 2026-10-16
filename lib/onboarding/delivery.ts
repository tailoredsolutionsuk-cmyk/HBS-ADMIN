import type { Project } from "./model";

export type DeliveryStep = {
  title: string;
  outcome: string;
  evidence: string;
  ownerApproval: boolean;
};

export type DeliveryPacket = {
  projectId: string;
  briefRevision: number;
  preparedFromApprovedBrief: boolean;
  website: {
    clientName: string;
    businessSource: string;
    audienceSource: string;
    goalsSource: string;
    pagesSource: string;
    brandSource: string;
    contentSource: string;
    domainSource: string;
    missing: string[];
    steps: DeliveryStep[];
  };
  metaAds: {
    platform: "Meta Ads";
    objectiveSource: string;
    audienceSource: string;
    creativeSource: string;
    budgetGbp: null;
    accountId: null;
    missing: string[];
    steps: DeliveryStep[];
  };
};

const step = (title: string, outcome: string, evidence: string, ownerApproval = false): DeliveryStep =>
  ({ title, outcome, evidence, ownerApproval });

/** An on-screen handoff, never an instruction to provision or spend. */
export function deliveryPacket(project: Project, clientName: string): DeliveryPacket {
  const brief = project.brief;
  const approved = project.status === "approved";
  const websiteMissing = [
    "Confirm the exact services, industry and location for Website Studio.",
    "Confirm a public contact email or phone number.",
    ...(!brief.brand ? ["Collect brand guidance and approved assets."] : []),
    ...(!brief.content ? ["Collect content, references and asset usage rights."] : []),
    ...(!brief.domain ? ["Confirm domain ownership and access arrangements."] : []),
  ];
  const metaMissing = [
    "Request access to the client's Meta Business Portfolio, ad account and Page; record the billing owner.",
    "Agree the offer, target location, campaign objective and conversion event.",
    "Confirm the budget and obtain owner approval before spending.",
    "Approve ad copy, creative assets, audience and landing page.",
    "Verify the landing page, conversion tracking and privacy requirements.",
  ];
  return {
    projectId: project.id,
    briefRevision: project.revision,
    preparedFromApprovedBrief: approved,
    website: {
      clientName,
      businessSource: brief.business,
      audienceSource: brief.audience,
      goalsSource: brief.goals,
      pagesSource: brief.pages,
      brandSource: brief.brand,
      contentSource: brief.content,
      domainSource: brief.domain,
      missing: websiteMissing,
      steps: [
        step("Prepare Website Studio brief", "A scoped sitemap and content draft tied to this approved brief revision.", "Reviewed page plan and source references."),
        step("Create private website draft", "One client-linked draft in Website Studio.", "Builder site ID and saved draft revision."),
        step("Build and test preview", "A working preview with content, forms, accessibility and mobile checks.", "Preview URL and QA results."),
        step("Review preview", "The client and HBS owner can approve a specific preview revision or request changes.", "Preview URL, client feedback and recorded decision; production release is a later approval gate.", true),
      ],
    },
    metaAds: {
      platform: "Meta Ads",
      objectiveSource: brief.goals,
      audienceSource: brief.audience,
      creativeSource: brief.content,
      budgetGbp: null,
      accountId: null,
      missing: metaMissing,
      steps: [
        step("Plan Meta access request", "The client has clear instructions to grant HBS the needed Business Portfolio, ad account and Page access.", "Requested assets, recipient, client response and verified access status; sending the request requires approval.", true),
        step("Draft campaign proposal", "A reviewable campaign structure, ad copy and creative brief aligned with the website goal.", "Proposal revision, claim sources, asset rights and proposed budget for approval."),
        step("Plan destination and measurement", "The proposal names the preview landing page and agreed conversion event.", "Preview URL, tracking plan and privacy review; live tracking is a later gate."),
        step("Review proposal", "The client and HBS owner can approve the exact proposal or request changes.", "Recorded decision for account, audience, creative, schedule and budget; no Meta campaign is created in this phase.", true),
      ],
    },
  };
}
