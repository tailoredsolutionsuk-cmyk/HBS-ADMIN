# Client onboarding implementation plan

## Outcome
Harley starts a project for an existing client. The client signs in to the existing OTP portal, completes a project-specific brief, and Harley reviews it before any website is provisioned or published. Multiple projects may belong to one client.

## Delivery sequence
1. **Project foundation (this release):** additive project records, role checks, separate project IDs, revision checks and transactional creation.
2. **Admin workflow (this release):** Onboarding navigation, client selection, project creation, status list and brief review.
3. **Client brief (this release):** account-scoped portal questionnaires, save draft, submit, request changes and approval.
4. **Checklist and audit (this release):** one checklist per project, automatic brief-task updates, CRM activity and a durable event outbox. Retries must not duplicate work.
5. **Email connection (next):** configure a dedicated Make webhook, validate timestamped HMAC signatures before processing, deduplicate event IDs, connect Outlook sender contact@hbsmarketing.co.uk. Send a welcome link only after portal access is explicitly enabled. Configure delivery retries and visible failures. No emails are sent by this release.
6. **Private assets:** authenticated uploads, file-size/type limits, malware checks, private storage and short-lived download links; never accept passwords or provider secrets in briefs.
7. **Reminder scheduling:** 2/5/7-day reminders using project state, business timezone and a deduplicated ledger; cancel on submission, archive or revoked portal access.
8. **AI draft:** explicit approval to share the brief, draft sitemap/content/SEO, stored generation and cost metadata. Human approval remains required.
9. **Builder handoff:** connect approved project to one stable builder site ID; reuse existing private GitHub/Vercel preview workflow. Retry-safe provisioning, no duplicate repos.
10. **Client review:** portal preview link, feedback, explicit approval tied to a specific website revision; changes invalidate approval.
11. **Launch:** owner/admin manual launch after approved revision, domain and analytics checks. Never publish solely because a brief was submitted.
12. **Operational hardening:** reminder/delivery dashboard, integration failures, permissions, mobile/keyboard tests, preview acceptance and production promotion.

## Phase-one implementation
- New public.onboarding_projects and public.onboarding_events tables: RLS enabled, no browser grants.
- New nullable checklist_items.onboarding_project_id, indexed. Existing task contracts retained.
- Service-role-only transactional RPC checks the acting admin or portal membership again before writing.
- Admin GET/POST /api/admin/onboarding; client GET/POST /api/portal/onboarding. Client ID comes from verified portal session, not request input.
- Project creation uses a stable UUID per form attempt; reuse with different data is rejected.
- Edits use expected revision; concurrent edits produce a conflict instead of silent overwrite.
- Create/submit/review operations write checklist changes and outbox records in one transaction.
- Outbox is a durable record only, not an activated Make delivery worker. The UI must say automation is not connected.
- Existing portal access is never granted, replaced or widened automatically. Use Clients → portal access controls first.

## Verification / rollout
1. Unit tests for input limits, required fields, IDs, dates and status transitions.
2. Database transaction rolled back after duplicate-create, revision, cross-client and permission checks.
3. Typecheck, test suite and production build.
4. Apply additive db/client-onboarding.sql to HBS project only; inspect security advisors.
5. Deploy a Vercel preview, sign in as admin and separately as a client; confirm save/submit/review and no cross-client access.
6. Do not promote until authenticated end-to-end acceptance passes.
7. Test email and provider provisioning separately in later phases before enabling them.

## Acceptance for first release
Create project → exactly one checklist → client saves and submits brief → admin requests changes or approves → matching task/activity updates. Unconfigured email is explicit, not reported as sent. No domain, provider resource, live website, portal permission or customer email changes happen automatically.

## Verification record — 29 September 2026
- HBS database migrations applied: client_onboarding_foundation and onboarding_verified_session_email.
- 29 automated tests passed; TypeScript and Next.js production build passed.
- tests/onboarding.integration.sql passed under the actual service_role, with all fixtures rolled back: repeat creation, conflicting retries, viewer rejection, cross-client rejection, incomplete briefs, stale revisions, submission, requested changes, revoked access and approval locking.
- Rate limiter verified under service_role; zero retained test clients.
- Security advisor: new tables intentionally have RLS with no browser policies and revoked anon/authenticated grants. Access is exclusively through authenticated server routes. Existing leaked-password protection warning is outside this migration.
- Authenticated preview acceptance remains required before production promotion.

