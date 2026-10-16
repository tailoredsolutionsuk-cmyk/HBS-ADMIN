# New-client website and Meta Ads automation

The existing CRM onboarding project is the source of truth. A client submits a project brief in the portal; an HBS owner or admin reviews it. The approved project revision then produces a website and Meta Ads preparation packet in the admin view. This packet is read-only and does not provision hosting, create ads or spend money.

## Workflow and required outcomes

| Stage | Outcome | Evidence before moving on |
| --- | --- | --- |
| Client intake | One client-scoped project and completed brief | Project ID, client ID, submitted revision and approval |
| Website preparation | Builder-ready services, niche, location, contact and content | Reviewed field mapping, asset rights and missing-input decisions |
| Website draft | One private site linked to the onboarding project | Stable site ID, saved revision and no duplicate on retry |
| Preview and QA | Working pages, enquiry form, mobile/accessibility checks | Preview URL, checklist results and client feedback |
| Website release | Approved revision on the intended domain | Client sign-off, HBS release approval and exact live deployment |
| Meta campaign preparation | Objective, audience, offer, copy and creative tied to landing page | Reviewable campaign draft and claim/asset sources |
| Meta account and tracking | Correct account, pixel/conversion event and landing URL | Access grant, test conversion and privacy review |
| Meta launch | Exact campaign activated within approved budget | Owner approval for account, targeting, creative, schedule and spend; provider receipt |
| Performance review | Spend and conversions compared with the agreed goal | Dated results, feedback and next action |

## Next implementation slices

1. Add structured intake fields for industry, services, location, public contact, offer, target geography, budget proposal and asset rights. Keep old briefs readable; require review of missing fields before creating provider resources.
2. Bind each approved onboarding project to one Website Studio site with a database uniqueness constraint and transactional, retry-safe creation. Generate a private draft, then keep preview, client review and production launch as separate steps.
3. Add a versioned Meta campaign proposal record and preview. Prepare copy and creative within the client's verified account scope. Do not infer a budget or promise results from the brief.
4. Connect the client's Meta Business account with least-privilege access. Record account, page, pixel and ad-account IDs in server-side configuration. Create or update provider drafts only after exact owner approval; require a separate approval before activation or spend.
5. Connect conversion reporting to the CRM and review outcomes. Reconcile provider receipts, errors, retries and costs in the audit trail.

The current Website Studio AI editor still uses Vercel AI Gateway (`BUILDER_AI_MODEL`); JARVIS chat's direct OpenAI setting does not switch it. Verify or migrate builder AI access before relying on automated content generation. Meta account integration, campaign drafting in Meta, spend controls and provider launch are not connected yet.

For the first client, use a test project and reviewed assets. Record the intended Meta account and owner-approved spending limit before any provider write. Keep client data, API credentials and ad-account tokens out of this repository.
