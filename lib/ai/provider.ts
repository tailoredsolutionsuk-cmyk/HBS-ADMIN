import { createOpenAI } from "@ai-sdk/openai";
import { getJarvisAIConnection, AIConfigurationError, type AIEnvironment } from "./connection.ts";

export function getJarvisAI(env: AIEnvironment = process.env, fetchImplementation?: typeof globalThis.fetch) {
  if (typeof window !== "undefined") throw new Error("JARVIS AI must run on the server.");
  const connection = getJarvisAIConnection(env);
  if (!connection.configured) throw new AIConfigurationError();
  if (connection.provider === "vercel") {
    // Preserve the existing AI SDK Gateway/OIDC path; no automatic provider switch.
    return { ...connection, model: connection.model, providerOptions: undefined };
  }
  const openai = createOpenAI({
    apiKey: env.OPENAI_API_KEY!.trim(),
    baseURL: "https://api.openai.com/v1",
    project: env.OPENAI_PROJECT_ID?.trim() || undefined,
    fetch: fetchImplementation,
  });
  return {
    ...connection,
    model: openai.responses(connection.model),
    // Current CRM tool schemas use optional filters. Their server-side SDK
    // validation stays enabled; OpenAI's all-fields-required strict mode is off.
    providerOptions: { openai: { store: false, strictJsonSchema: false } },
  };
}
