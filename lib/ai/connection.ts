import { getAiGatewayModel } from "./gateway.ts";

export type JarvisAIProvider = "openai" | "vercel";
export type AIEnvironment = Record<string, string | undefined>;
export type JarvisAIConnection = {
  provider: JarvisAIProvider;
  model: string;
  configured: boolean;
  missing: string[];
};

export class AIConfigurationError extends Error {
  code = "AI_CONFIGURATION_REQUIRED";
  constructor() {
    super("The selected JARVIS AI provider is not configured.");
    this.name = "AIConfigurationError";
  }
}

export function getJarvisAIConnection(env: AIEnvironment = process.env): JarvisAIConnection {
  const provider = env.JARVIS_AI_PROVIDER?.trim() || "vercel";
  if (provider !== "openai" && provider !== "vercel") throw new AIConfigurationError();
  if (provider === "openai") {
    const model = env.OPENAI_MODEL?.trim() || "";
    const missing = [
      ...(!env.OPENAI_API_KEY?.trim() ? ["OPENAI_API_KEY"] : []),
      ...(!/^[a-z0-9][a-z0-9._-]*$/i.test(model) ? ["OPENAI_MODEL"] : []),
    ];
    return { provider, model: missing.includes("OPENAI_MODEL") ? "" : model, configured: missing.length === 0, missing };
  }
  const model = getAiGatewayModel(env);
  const missing = env.AI_GATEWAY_API_KEY?.trim() || env.VERCEL_OIDC_TOKEN?.trim() ? [] : ["AI_GATEWAY_API_KEY or VERCEL_OIDC_TOKEN"];
  return { provider, model, configured: missing.length === 0, missing };
}
