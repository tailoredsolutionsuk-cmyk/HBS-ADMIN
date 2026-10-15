import { getJarvisAIConnection } from "../lib/ai/connection.ts";
import { classifyAIError } from "../lib/ai/errors.ts";

async function main() {
  const connection = getJarvisAIConnection();
  if (!connection.configured) {
    console.log(JSON.stringify({ ...connection, modelAccessVerified: false }, null, 2));
    process.exitCode = 2;
    return;
  }
  if (connection.provider !== "openai") {
    console.log(JSON.stringify({ ...connection, modelAccessVerified: false, note: "Gateway configuration is present. Use the selected deployment's AI Gateway Logs to verify a model request." }, null, 2));
    return;
  }
  const headers: Record<string, string> = { Authorization: "Bearer " + process.env.OPENAI_API_KEY!.trim() };
  if (process.env.OPENAI_PROJECT_ID?.trim()) headers["OpenAI-Project"] = process.env.OPENAI_PROJECT_ID.trim();
  // Model metadata lookup only. This does not generate text or spend tokens.
  const result = await fetch("https://api.openai.com/v1/models/" + encodeURIComponent(connection.model), { headers, signal: AbortSignal.timeout(15_000) });
  if (!result.ok) {
    const failure = classifyAIError({ statusCode: result.status, responseBody: await result.text() });
    console.log(JSON.stringify({ provider: connection.provider, model: connection.model, modelAccessVerified: false, error: failure.code, ...failure.diagnostic }, null, 2));
    process.exitCode = 1;
    return;
  }
  console.log(JSON.stringify({ provider: connection.provider, model: connection.model, modelAccessVerified: true, inferenceVerified: false, note: "Authentication/model metadata check passed. No generation or CRM action was executed." }, null, 2));
}
main().catch(error => {
  const failure = classifyAIError(error);
  console.log(JSON.stringify({ modelAccessVerified: false, error: failure.code, ...failure.diagnostic }, null, 2));
  process.exitCode = 1;
});
