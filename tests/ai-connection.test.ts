import assert from "node:assert/strict";
import test from "node:test";
import { getJarvisAIConnection } from "../lib/ai/connection.ts";
import { classifyAIError } from "../lib/ai/errors.ts";

test("existing environments keep the Gateway route until direct OpenAI is selected", () => {
  assert.deepEqual(getJarvisAIConnection({ AI_GATEWAY_API_KEY: "test-gateway-key" }), {
    provider: "vercel", model: "openai/gpt-5.4-mini", configured: true, missing: [],
  });
});
test("direct mode never treats a Gateway key as an OpenAI key", () => {
  const status = getJarvisAIConnection({ JARVIS_AI_PROVIDER: "openai", OPENAI_MODEL: "gpt-5.4-mini", AI_GATEWAY_API_KEY: "test-gateway-key" });
  assert.equal(status.configured, false);
  assert.deepEqual(status.missing, ["OPENAI_API_KEY"]);
});
test("direct mode reports safe metadata without exposing credentials", () => {
  const env = { JARVIS_AI_PROVIDER: "openai", OPENAI_MODEL: "gpt-5.4-mini", OPENAI_API_KEY: "private-test-value" };
  const status = getJarvisAIConnection(env);
  assert.equal(status.configured, true);
  assert.equal(status.model, "gpt-5.4-mini");
  assert.equal(JSON.stringify(status).includes(env.OPENAI_API_KEY), false);
});
test("invalid providers and prefixed direct model IDs fail closed", () => {
  assert.throws(() => getJarvisAIConnection({ JARVIS_AI_PROVIDER: "other" }));
  assert.equal(getJarvisAIConnection({ JARVIS_AI_PROVIDER: "openai", OPENAI_MODEL: "openai/gpt-5.4-mini", OPENAI_API_KEY: "test" }).configured, false);
});
test("Gateway mode respects configured model and OIDC", () => {
  const status = getJarvisAIConnection({ JARVIS_AI_PROVIDER: "vercel", AI_GATEWAY_MODEL: "openai/gpt-5.4-mini", VERCEL_OIDC_TOKEN: "test-token" });
  assert.equal(status.configured, true);
});
test("403 access failures cannot become a budget error because a message mentions credits", () => {
  const error = Object.assign(new Error("quota credit budget"), { statusCode: 403 });
  assert.equal(classifyAIError(error).code, "AI_ACCESS_DENIED");
});
test("API credit exhaustion and configured budget limits have different codes", () => {
  const insufficient = { statusCode: 429, responseBody: JSON.stringify({ error: { code: "insufficient_quota" } }) };
  assert.equal(classifyAIError(insufficient).code, "AI_CREDITS_REQUIRED");
  assert.equal(classifyAIError({ statusCode: 402, error: { type: "quota_for_entity_exceeded" } }).code, "AI_BUDGET_REACHED");
  assert.equal(classifyAIError({ statusCode: 402 }).code, "AI_PAYMENT_REQUIRED");
  assert.equal(classifyAIError({ statusCode: 429 }).code, "AI_RATE_LIMITED");
});
test("wrapped provider errors preserve safe status classification", () => {
  const error = { cause: { statusCode: 403, responseBody: JSON.stringify({ error: { code: "customer_verification_required" } }) } };
  assert.equal(classifyAIError(error).code, "AI_BILLING_REQUIRED");
  const diagnostic = JSON.stringify(classifyAIError({ statusCode: 403, responseBody: "secret-value", message: "private prompt" }));
  assert.equal(diagnostic.includes("secret-value"), false);
  assert.equal(diagnostic.includes("private prompt"), false);
});
test("authentication and missing model errors are not reported as exhausted budgets", () => {
  assert.equal(classifyAIError({ statusCode: 401 }).code, "AI_AUTH_FAILED");
  assert.equal(classifyAIError({ statusCode: 404 }).code, "AI_MODEL_UNAVAILABLE");
  assert.equal(classifyAIError({ cause: null, responseBody: "not-json" }).code, "JARVIS_UNAVAILABLE");
});
