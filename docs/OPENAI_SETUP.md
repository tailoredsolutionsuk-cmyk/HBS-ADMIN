# Direct OpenAI setup for JARVIS

JARVIS can use the OpenAI Responses API directly through the official `@ai-sdk/openai` provider. Its existing CRM tools, conversation memory, authentication and owner/admin task approvals remain in the HBS admin app.

Provider selection is explicit. No automatic failover sends business data to another provider. Existing deployments with no `JARVIS_AI_PROVIDER` value keep the Vercel Gateway route.

## Configure a preview first

Set these server-side environment variables on the existing `hbs-admin` project, for the environment you intend to test:

| Variable | Value / handling |
|---|---|
| `JARVIS_AI_PROVIDER` | `openai` (Config) |
| `OPENAI_API_KEY` | OpenAI project API key (Secret; enter through the provider/hosting secret interface) |
| `OPENAI_MODEL` | Bare OpenAI model ID available in that project; current setup example: `gpt-5.4-mini` (Config) |
| `OPENAI_PROJECT_ID` | Optional OpenAI project ID matching the key (server-side Config) |

Use an OpenAI API project with billing and an owner-approved usage budget. Existing Vercel AI Gateway credit and its key do not fund or authenticate direct OpenAI requests. Do not paste a key in chat, source files or shell arguments.

For local development, copy `.env.example` to ignored `.env.local` and fill the OpenAI entries securely. The direct connection pins `https://api.openai.com/v1`; an unrelated `OPENAI_BASE_URL` cannot silently redirect credentials.

## Check configuration and model access

```sh
pnpm ai:check
```

This command reads `.env.local` and performs an authenticated model-metadata GET in direct mode. It prints only safe provider/model status and error classification. It does not generate text, read the CRM, execute tools or spend generation tokens. A metadata success does not prove inference/billing readiness.

Without a key or model, it reports the missing variable names and exits with code 2. No secret values are printed.

## Verify the complete preview flow

1. Build/deploy the reviewed change to a preview with the selected environment variables.
2. Sign in as an authorised HBS admin and check Integrations shows OpenAI API with the selected model.
3. Open JARVIS and ask "What should I prioritise today?"
4. Verify a real answer grounded in authorised CRM records and the saved conversation history.
5. Ask it to propose a task. Confirm it appears in pending approvals before any task is created.
6. Verify approval creates the intended task once, and rejection creates no task.
7. Check safe server diagnostics and the OpenAI project usage. Confirm the cost fits the owner's budget.

The existing route limits generation to 900 output tokens per model step, up to five steps, no automatic retries and a 45-second timeout. These are request bounds, not a guaranteed monetary spending cap. Model calls can include tool-result context and reasoning tokens. Use reviewed provider/project spend controls and application-level quotas as required.

Tests use mocked provider responses and synthetic CRM data. No live key or account access is needed to run them.

## Errors

| Error | Meaning |
|---|---|
| `AI_CONFIGURATION_REQUIRED` | Selected provider credentials/model are missing or invalid |
| `AI_AUTH_FAILED` | Credentials rejected |
| `AI_ACCESS_DENIED` | Provider returned forbidden access; check project/model permissions or account restrictions |
| `AI_BILLING_REQUIRED` | Provider explicitly requested account/billing verification |
| `AI_CREDITS_REQUIRED` | Provider reported insufficient funds or API billing quota |
| `AI_BUDGET_REACHED` | Provider explicitly reported an exhausted configured budget |
| `AI_PAYMENT_REQUIRED` | Other HTTP 402 payment issue; inspect provider billing |
| `AI_RATE_LIMITED` | Rate limit without a billing-quota error |
| `AI_MODEL_UNAVAILABLE` | Model missing or unavailable |

A 403 is not converted into a budget error just because its text mentions credit/quota. Server diagnostics contain only the application code, upstream HTTP status and recognised provider code; raw provider messages, prompts, response bodies and keys are excluded.

## Keep or restore Vercel Gateway

Set `JARVIS_AI_PROVIDER=vercel` and use the existing `AI_GATEWAY_MODEL` plus Gateway key or supported Vercel OIDC authentication. Its model ID uses the `openai/model-name` format. Direct OpenAI model IDs have no `openai/` prefix.

Changing the provider does not automatically resolve the previously observed Gateway 403. The two modes have separate credentials and billing. This selector applies to JARVIS; the website builder and GitHub activity summariser retain their existing Gateway configuration.

## Release requirements

Run `pnpm test`, `pnpm typecheck` and `pnpm build`. After a verified preview, obtain the owner's production-release approval, set production variables securely and deploy the exact reviewed commit. Verify production JARVIS behaviour and the intended model.

No database migration is required by this provider change. This implementation does not activate the separate `hbs-jarvis` objective orchestration runtime or add social posting adapters.

Official references: [OpenAI function calling](https://developers.openai.com/api/docs/guides/function-calling), [AI SDK OpenAI Responses provider](https://ai-sdk.dev/providers/ai-sdk-providers/openai), [Vercel AI Gateway authentication](https://vercel.com/docs/ai-gateway/authentication-and-byok).
