# HBS website studio: launch and operating guide

## What has been implemented

1. Four-page business website template; existing CRM retained.
2. Owner/admin-only studio and server-only provider integrations. Credentials must be supplied by the account owner.
3. Dedicated `BUILDER_AI_MODEL=openai/gpt-5.4-mini`; existing assistant `AI_MODEL` unchanged.
4. Private website drafts, immutable revision snapshots, uploads, release records, jobs and client links in Supabase. No duplicate Neon database required.
5. Restricted, escaped HTML templates; AI cannot generate executable code or choose repository paths.
6. Three-step brief wizard with optional CRM client selection.
7. Explicit AI consent, structured generation, persisted outputs and usage, bounded input/output, hourly and conservative daily allowance. Failed/uncertain AI calls are not automatically repeated.
8. Branding, images, fonts, section editing/order, undo/redo, history restoration, isolated responsive iframe.
9. SQL-backed job queue, leases, bounded retry, saved progress and failure history. Immediate Next.js background execution; daily recovery cron on the current Hobby plan.
10. Separate private repository and Vercel project per website. Preview builds never target production. Publishing promotes the exact reviewed revision/commit/deployment without rebuilding.
11. Domain attach/check with live DNS instructions, protected HBS domains, enquiry form into CRM New leads, client/site attribution, aggregate per-page counts.
12. Unit, typecheck, production-build and rollback-only live database tests. Live provider, browser and custom-domain acceptance must be recorded separately; code tests do not prove account permissions.

## Account owner: finish setup (no code required)

Open [HBS Admin environment settings](https://vercel.com/harleyjayy14-7124s-projects/hbs-admin/settings/environment-variables).

Add the settings below to **Production**. Do not give ordinary preview branches production database/provider secrets; use a separate test backend for preview testing. After changing settings, redeploy HBS Admin from Vercel → Deployments.

| Name | Value / where to find it |
| --- | --- |
| `GITHUB_TOKEN` | GitHub → Settings → Developer settings → Personal access tokens. Use a dedicated, expiring credential permitted to create private repositories in the intended owner and write their contents. A token restricted to HBS-ADMIN alone cannot create client repositories. Prefer a dedicated GitHub App/automation account for ongoing production use. Do not grant unrelated account permissions. |
| `GITHUB_OWNER` | `tailoredsolutionsuk-cmyk` |
| `GITHUB_ADMIN_REPO` | `HBS-ADMIN` (protected, never a client deployment target) |
| `VERCEL_TOKEN` | Vercel account → Settings → Tokens; scope to the HBS team. Existing value can be retained if valid. |
| `VERCEL_TEAM_ID` | `team_unJAySdwUfwBAEzE2dJ5lgPH` |
| `VERCEL_ADMIN_PROJECT_ID` | `prj_2jlYsvVapKcqzZEbtP9wZNNZ9fL4` (protected) |
| `SUPABASE_SERVICE_ROLE_KEY` | HBS Supabase → Project Settings → API Keys → server secret/service-role key. Use only on the server; not the public publishable key. |
| `AI_GATEWAY_API_KEY` | Vercel → AI Gateway → API Keys. Add credits/spend controls in the account. Vercel OIDC can alternatively authenticate supported deployments, but verify it actually works. A ChatGPT subscription is not API credit. |
| `BUILDER_AI_MODEL` | `openai/gpt-5.4-mini` |
| `BUILDER_AI_DAILY_BUDGET_USD` | `3` or lower. Conservative request allowance, not a guaranteed provider billing cap. Configure the provider's spend controls as well. |
| `BUILDER_PUBLIC_ORIGIN` | `https://www.hbsmarketing.online` |
| `CRON_SECRET` | A new random secret of at least 32 characters, generated with your password manager. |
| `BUILDER_FORM_SECRET` | Another, different random secret of at least 32 characters. |

Never send these secret values in chat or put them in a website brief. Never prefix secret names with `NEXT_PUBLIC_`. Public Supabase URL/publishable-key variables use **Config**, not Secret visibility.

The studio tells you which settings are missing. Presence does not prove a credential is valid; only a successful provider action does.

## First pilot website

1. Sign in at [HBS Admin](https://www.hbsmarketing.online/), choose **Websites → New website**.
2. Use clearly labelled test details initially. Select the matching client only if appropriate.
3. Fill in business, audience, services and public contact details; save the draft.
4. Edit colours, font, sections and assets. Switch all four page tabs and desktop/mobile views. Undo an edit and restore a saved version to check history.
5. Save before AI editing. Tick the consent box and ask for a small change. Confirm the new draft and AI history; inspect wording for invented facts.
6. Select **Build preview**. Wait for the background job to finish. A separate private GitHub repo and Vercel project should appear.
7. Open the hosted preview; inspect all pages and mobile layout. Public enquiry collection is intentionally disabled on preview URLs.
8. Tick the reviewed-preview checkbox and choose **Publish reviewed preview**. Confirm the job says Published and open the live site.
9. Send a labelled test enquiry from the live Contact page. Verify one New lead in Pipeline with the correct site/client. Retrying the same submission must not duplicate it.
10. Reload a live page, then reopen the website studio. Its page counts should increase; preview views should not. Counts are not unique visitors, may include bots, and honour Do Not Track.
11. Make an edit, build/review another preview, and publish. Restore an older version as a new draft, preview/review it, and publish to roll back safely.
12. Only after this works, enter a client-owned custom domain. Copy the displayed applicable DNS record to its registrar; preserve email/MX records. Recheck DNS, then open HTTPS in a browser. Never use the CRM/marketing domain or an unrelated existing domain.

## Limits and operational notes

- The current Vercel team reports Hobby. Scheduled recovery runs once daily; normal work starts immediately. Jobs interrupted beyond the execution window resume when the studio reopens or the daily cron runs. A paid plan/managed queue is needed for frequent unattended recovery and should be agreed before changing billing. Confirm plan suitability for commercial hosting with Vercel before client launch.
- No upgrade, domain purchase, DNS replacement, or client production launch is automatic.
- Uploads: PNG/JPEG/WebP/WOFF2 only, 750 KB each, 8 files, about 2 MB combined. Files stay in private snapshots until the website is published. No SVG/HTML/JS uploads.
- Enquiry spam controls: exact published-origin checks, signed time-limited challenge, honeypot, bounded fields, per-site and short-lived hashed-IP rate limits, submission UUID deduplication. Origin checks are not proof a request is human; add a managed challenge/WAF if abuse warrants it.
- Analytics keep only daily page counts. No analytics cookies or visitor profiles. Raw IPs are not stored; daily salted rate-limit hashes are removed by the authenticated cron after at most two days. Aggregate metrics are retained for one year when cron is running.
- Leads follow the CRM's retention/access rules. Before client launch, approve the privacy notice, lawful collection basis, retention period and appropriate business contact details. The generic form notice is not a compliance assessment.
- Multiple websites are managed in one CRM workspace; each has its own resources. Each admin sees only websites they own. Client self-service and cross-admin delegation are not enabled.
- Restoring a draft does not affect production until another preview is reviewed and published. A failed/uncertain promotion can still change provider routing; check the saved job and Vercel before retrying.
- Do not add a Vercel Git auto-deploy link to generated site projects; it would defeat the review gate, and isolation checks will reject such projects.

## Verification commands

Run `pnpm test`, `pnpm typecheck`, `pnpm build`. Run `tests/builder-database.sql` through Supabase SQL with the required administrator role; it rolls back all test data. Review job history and runtime errors after deployment. See `docs/builder-verification.md` for recorded results and remaining blockers.
