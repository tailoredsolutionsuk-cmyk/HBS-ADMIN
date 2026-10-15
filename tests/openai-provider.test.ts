import assert from "node:assert/strict";
import test from "node:test";
import { generateText, jsonSchema, stepCountIs, tool } from "ai";
import { getJarvisAI } from "../lib/ai/provider.ts";
import { classifyAIError } from "../lib/ai/errors.ts";

const env = { JARVIS_AI_PROVIDER: "openai", OPENAI_MODEL: "gpt-5.4-mini", OPENAI_API_KEY: "unit-test-key", AI_GATEWAY_API_KEY: "unit-gateway-key", OPENAI_BASE_URL: "https://ignored.invalid" };
function response(output: unknown[]) {
  return Response.json({ id: "resp_unit", created_at: 1, model: "gpt-5.4-mini", status: "completed", output,
    usage: { input_tokens: 20, output_tokens: 10, total_tokens: 30 } });
}
function message(text: string) {
  return { id: "msg_unit", type: "message", role: "assistant", status: "completed", content: [{ type: "output_text", text, annotations: [] }] };
}
test("direct OpenAI uses /responses, keeps keys server-side and disables response storage", async () => {
  const requests: Array<{ url: string; body: Record<string, unknown> }> = [];
  const ai = getJarvisAI(env, async (url, init) => {
    assert.equal(new Headers(init?.headers).get("authorization"), "Bearer unit-test-key");
    requests.push({ url: String(url), body: JSON.parse(String(init?.body)) });
    return response([message("Review today's overdue follow-ups.")]);
  });
  const result = await generateText({ model: ai.model, providerOptions: ai.providerOptions, prompt: "What should I prioritise today?", maxRetries: 0 });
  assert.equal(result.text, "Review today's overdue follow-ups.");
  assert.equal(requests[0].url, "https://api.openai.com/v1/responses");
  assert.equal(requests[0].body.store, false);
  assert.equal(requests[0].body.model, "gpt-5.4-mini");
});
test("the existing CRM tool loop works with direct OpenAI and optional filter schemas", async () => {
  let calls = 0, toolsExecuted = 0;
  const ai = getJarvisAI(env, async (_url, init) => {
    const body = JSON.parse(String(init?.body));
    calls++;
    if (calls === 1) {
      assert.equal(body.tools[0].strict, false);
      return response([{ id: "fc_unit", type: "function_call", call_id: "call_unit", name: "get_leads", arguments: "{}" }]);
    }
    assert.ok(body.input.some((item: { type: string }) => item.type === "function_call_output"));
    return response([message("Follow up the overdue automotive lead first.")]);
  });
  const result = await generateText({
    model: ai.model, providerOptions: ai.providerOptions, prompt: "Prioritise the CRM leads.", maxRetries: 0, stopWhen: stepCountIs(3),
    tools: { get_leads: tool({
      strict: false,
      description: "Read authorised CRM leads.",
      inputSchema: jsonSchema<{ limit?: number }>({ type: "object", additionalProperties: false, properties: { limit: { type: "integer" } } }),
      execute: async () => { toolsExecuted++; return { leads: [{ business_name: "Synthetic garage", overdue: true }] }; },
    }) },
  });
  assert.equal(calls, 2); assert.equal(toolsExecuted, 1);
  assert.equal(result.text, "Follow up the overdue automotive lead first.");
});
test("direct provider denial remains an access error without automatic Gateway fallback", async () => {
  let calls = 0;
  const ai = getJarvisAI(env, async url => {
    calls++; assert.equal(String(url), "https://api.openai.com/v1/responses");
    return Response.json({ error: { message: "Synthetic access rejection", code: "permission_denied" } }, { status: 403 });
  });
  await assert.rejects(
    generateText({ model: ai.model, providerOptions: ai.providerOptions, prompt: "Test", maxRetries: 0 }),
    error => { assert.equal(classifyAIError(error).code, "AI_ACCESS_DENIED"); return true; },
  );
  assert.equal(calls, 1);
});
test("unconfigured direct mode fails before any provider call", () => {
  assert.throws(() => getJarvisAI({ JARVIS_AI_PROVIDER: "openai", OPENAI_MODEL: "gpt-5.4-mini" }), /not configured/);
});
