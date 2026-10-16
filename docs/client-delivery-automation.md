# New-client website and Meta Ads automation

The existing CRM onboarding project is the source of truth. A client submits a project brief in the portal; an HBS owner or admin reviews it. The approved project revision then produces a website and Meta Ads preparation packet in the admin view. The first automation target is a private website preview and a Meta campaign proposal for review. Plan an access request for the client's Meta Business Portfolio, ad account and Page. This packet is read-only and does not provision hosting, create ads or spend money.

## Workflow and required outcomes

| Stage | Outcome | Evidence before moving on |
| --- | --- | --- |
| Client intake | One client-scoped project and completed brief | Project ID, client ID, submitted revision and approval |
| Website preparation | Builder-ready services, niche, location, contact and content | Reviewed field mapping, asset rights and missing-input decisions |
| Website draft | Owner reviews the mapped brief, then saves one private site linked to the approved onboarding project | Project ID is the stable site ID, saved revision and no duplicate on retry |
| Preview and QA | Working pages, enquiry form, mobile/accessibility checks | Preview URL, checklist results and client feedback |
| Website preview review | Client and HBS review one private revision | Preview URL, QA results, feedback and recorded decision |
| Meta campaign preparation | Objective, audience, offer, copy and creative tied to landing page | Reviewable campaign draft and claim/asset sources |
| Meta access request | Client receives approved instructions for granting needed account and Page access | Owner-approved request and verified access status |
| Meta proposal review | Client and HBS review one proposal revision | Proposal, proposed budget, tracking plan, feedback and recorded decision |

Website production release, provider campaign creation, Meta launch and performance reporting are later phases. Each requires its own implementation and approval gate. The first workflow stops at reviewable preview and proposal artifacts.

## Next implementation slices

1. Structured client intake now includes industry, services, location, public contact, offer, target geography, budget proposal and asset rights. These fields are optional for older projects and do not constitute spending or asset-use approval. Review missing values before creating provider resources.
2. The HBS owner can now review a mapped Website Studio brief and create one private draft for an approved project. The project UUID is reused as the builder site primary key, so retries return the same site. It does not set up hosting or build the preview. Next, automate preview generation and client review while keeping production launch as a separate approval step.
3. The CRM now saves versioned Meta campaign proposals and an unsent access-request draft. Apply `db/client-meta-proposals.sql` to the intended Supabase environment before enabling this route. Review copy, audience, offer, target geography, landing page, conversion event and proposed budget. No budget is inferred or approved by saving. The next step is a client and owner review decision tied to an exact proposal revision.
4. After the preview and proposal workflow works, connect the client's Meta Business account with least-privilege access. Record account, page, pixel and ad-account IDs in server-side configuration. Create or update provider drafts only after exact owner approval; require a separate approval before activation or spend.
5. Connect conversion reporting to the CRM and review outcomes. Reconcile provider receipts, errors, retries and costs in the audit trail.

The current Website Studio AI editor still uses Vercel AI Gateway (`BUILDER_AI_MODEL`); JARVIS chat's direct OpenAI setting does not switch it. Verify or migrate builder AI access before relying on automated content generation. Meta account integration, campaign drafting in Meta, spend controls and provider launch are not connected yet.

For the first client, use a test project and reviewed assets. Record the intended Meta account and owner-approved spending limit before any provider write. Keep client data, API credentials and ad-account tokens out of this repository.
