const FALLBACK_AI_GATEWAY_MODEL = "openai/gpt-5.4-mini";

function configuredModel(value: string | undefined) {
  const model = value?.trim();
  return model && /^[a-z0-9][a-z0-9._-]*\/[a-z0-9][a-z0-9._-]*$/i.test(model) ? model : "";
}

/**
 * The current, server-only model setting for every HBS AI feature.
 * AI_MODEL remains as a temporary fallback so existing deployments keep working
 * while AI_GATEWAY_MODEL is rolled out to each Vercel environment.
 */
export function getAiGatewayModel() {
  return configuredModel(process.env.AI_GATEWAY_MODEL)
    || configuredModel(process.env.AI_MODEL)
    || FALLBACK_AI_GATEWAY_MODEL;
}

export { FALLBACK_AI_GATEWAY_MODEL };
