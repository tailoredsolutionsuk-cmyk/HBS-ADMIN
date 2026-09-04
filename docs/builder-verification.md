# Website builder verification — 4 September 2026

## Tested

- `node --experimental-strip-types --test tests/*.test.ts`: 15 tests passed, zero failures (including the pending-domain-verification regression test).
- `tsc --noEmit`: passed.
- `next build`: passed on Node 24 / Next.js 16.3.1.
- Supabase migration `builder_preview_jobs_domains_enquiries`: applied successfully to the existing HBS backend.
- `tests/builder-database.sql`: passed against HBS Supabase; all synthetic rows rolled back. Covers snapshots, CRM project protection, browser-role denial, owner-scoped job claims, lease exclusion/recovery, polling retry accounting, no automatic crashed AI re-call, per-site atomic metrics and rate limits.
- Vercel branch preview: `dpl_8yMxgaXa9mFDZ7Qsv2cpoHrry4ax`, READY, commit `ba44a62f490318ad952dde647e4a3d48073e0236`. Build completed in 10 seconds; errors-only build log returned no errors.
- Preview `/api/admin/builder` without an HBS session: 401 with `private, no-store`, no private website data.
- Existing production CRM: signed-in owner session works. Integration readiness displayed Supabase/Vercel configured, GitHub/AI Gateway missing required configuration. This is presence-only readiness, not a live provider credential test.

## Production check and remaining acceptance

- Production deployment `dpl_61RWbF1zXuHPqQVPb1vGCWnpqAH7`: READY, assigned to `www.hbsmarketing.online`, commit `ba44a62f490318ad952dde647e4a3d48073e0236`.
- Authenticated owner browser: Websites module renders the new studio. The first database boundary is blocked by the missing server/service-role key. No test website was created, and no authenticated save/generate/publish success is claimed.
- Follow-up patch makes missing settings visible before database calls, preserves ownership DNS instructions while verification is pending, and adds its regression test.
- Required runtime configuration: GitHub credential, AI Gateway authentication/credits, builder service-role key, CRON_SECRET and BUILDER_FORM_SECRET. Exact missing keys are displayed in the deployed studio.
- Real preview creation → review → promotion → live enquiry → pipeline → analytics is not yet verified. Unit/mocked-provider tests are not a substitute.
- No client custom domain selected, no DNS records changed, no domain purchase or plan upgrade performed.

## Security advisory baseline

The new builder tables have RLS enabled and browser grants revoked. Supabase reports RLS-with-no-policy INFO notices intentionally: these tables are server-only. Do not add broad browser policies to silence them.

Two existing project warnings remain outside this builder change:

- [pg_net in public schema](https://supabase.com/docs/guides/database/database-linter?lint=0014_extension_in_public)
- [Leaked-password protection disabled](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection)

Use [the launch guide](builder-launch-guide.md) for setup, pilot acceptance, privacy/retention review and operating limits.
