# Website studio v1 (historical implementation notes)

The current release extends this implementation with preview-first publication, durable jobs, GPT-5.4 mini, client links, domains, enquiry forms and per-site analytics. Follow [the current launch guide](builder-launch-guide.md); the original direct-publish flow and limitations below describe the earlier version only.

Open HBS Admin → Websites → New website. Only signed-in, allowlisted owners/admins can use this module. Existing CRM modules and the separate marketing repository are unchanged.

## Workflow

1. Answer three short steps: business and niche; ideal customer, services and goal; style, differentiator and public contact details.
2. A deterministic four-page draft is saved immediately. The selected style changes the initial theme; the goal changes the primary call to action.
3. The server creates `hbs-site-<UUID>` as a **private GitHub repository** and a separate Vercel project. An interrupted or unauthorized setup leaves the draft available with an explicit retry action.
4. Edit branding, font, logo and page sections. Upload PNG/JPEG/WebP images or WOFF2 fonts (750 KB each, eight files, approximately 2 MB combined). Uploaded files are kept in private database draft/version records and published as static website assets only when you publish.
5. Switch between all four pages and desktop/mobile previews. The preview frame has an empty sandbox permission set, no scripts and disabled navigation; use the page tabs.
6. Save a draft or ask AI to edit page sections. AI receives public business details, page content, asset IDs and your instruction—not CRM data, credentials or uploaded file bytes. Generated output must validate against the same restricted document schema.
7. Publish the saved revision. It commits only generated HTML/assets to that site's private repository, then submits a production deployment to that site's project. These projects intentionally have **no Git auto-deploy link**, so committing a backup cannot bypass the Publish step. No CRM environment variables are copied to generated projects.
8. Deployment status is checked while the studio is open. Only READY is marked live. Reopen a site to resume status checks after navigating away. The last successful deployment URL remains available.
9. Restore any of the 50 most recent displayed versions as a **new draft**, review, then publish. Older snapshots remain retained in the database.

## Server-only configuration in HBS-ADMIN

Existing Supabase URL/publishable key, plus:

- `SUPABASE_SERVICE_ROLE_KEY`: the HBS Supabase project, server only.
- `GITHUB_TOKEN`: permission to create private repositories and write contents under `GITHUB_OWNER`. A token restricted to HBS-ADMIN alone cannot create new repositories; use a dedicated provisioning credential with the narrowest suitable account/organization permissions.
- `GITHUB_OWNER`: GitHub account/organization, currently `tailoredsolutionsuk-cmyk`.
- `GITHUB_ADMIN_REPO=HBS-ADMIN`: protected repository.
- `VERCEL_TOKEN`: permission to create and deploy projects in the selected team.
- `VERCEL_TEAM_ID=team_unJAySdwUfwBAEzE2dJ5lgPH`.
- `VERCEL_ADMIN_PROJECT_ID=prj_2jlYsvVapKcqzZEbtP9wZNNZ9fL4`: protected CRM project.
- `AI_GATEWAY_API_KEY` or Vercel's supported runtime gateway authentication; `AI_MODEL` selects an available gateway model.

Do not prefix any provider secret with `NEXT_PUBLIC_`. A builder readiness notice reports missing variable **names only**, never their values. Newly added environment values require redeployment.

Apply `db/builder.sql` and `db/builder-generations.sql` through Supabase migrations once. These were applied to the existing HBS Supabase project during implementation. All four tables are server-only: RLS enabled and browser role privileges revoked. API access additionally validates the signed-in admin and checks site ownership on every operation. Supabase's informational RLS-with-no-policy lint is intentional here: browser access remains denied, not opened. See [Supabase's explanation](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy).

## Isolation and failure handling

- Repository names are generated from validated UUIDs; callers cannot submit an owner, repository, project, file path, script or deployment command.
- Protected CRM **and marketing** names/IDs are denied in code; protected project IDs are also denied by a database constraint.
- Repository numeric ID, owner, private visibility and website marker are reverified before publishing. Project ID, name, team and absence of Git links are reverified too.
- Git writes replace only the generated repository's tree; no force pushes. Existing repo/project mismatches fail closed.
- Website locks and revision checks reject competing edits. Database triggers atomically save a snapshot with every new draft revision.
- Setup saves each acquired resource immediately; retries reuse it. Publish checkpoints commit/deployment IDs and can recover a previously accepted deployment response. Uncertain network outcomes may still create an extra deployment in the **same** isolated website project, never a CRM deployment.
- Rate limits: 5 creations/hour, 10 AI edits/hour, 10 publishes/hour and request-level limits per authenticated admin. Provider calls time out and report safe errors. No credentials or prompts are logged.
- AI generations get a UUID before invocation, retained output, model, usage, status and gateway-reported cost when available (null otherwise). Owner-authenticated retrieval: `/api/admin/builder?generation=<UUID>`.

## Deliberate v1 limits

Business information websites, not arbitrary application code. Contact uses real email/phone links; no fake form submission, booking engine, payment processing or ecommerce. No fabricated testimonials or metrics. AI can add a labelled placeholder until an actual customer quote is supplied. Custom domains, client self-service access and expanded media storage are future work. New hosting and AI use consume the account's provider quotas/billing.

## Checks

`pnpm test` covers page generation, goal/style selection, escaping, upload/path validation, target protection and mocked private provisioning/publication. `pnpm typecheck` and `pnpm build` validate the Next.js app. Database rollback checks cover snapshot creation, restoration, project protection and rate limiting without retaining test records. Real GitHub/Vercel permission and authenticated browser tests must also pass before claiming end-to-end provisioning is verified.
