import assert from "node:assert/strict";
import test from "node:test";
import { getAiAssistantModel, getAiGatewayModel } from "../lib/ai/gateway.ts";

test("free assistant trial leaves the JARVIS model unchanged", () => {
  const previousGateway = process.env.AI_GATEWAY_MODEL;
  const previousAssistant = process.env.AI_ASSISTANT_MODEL;
  try {
    process.env.AI_GATEWAY_MODEL = "openai/gpt-5.4-mini";
    process.env.AI_ASSISTANT_MODEL = "nvidia/nemotron-3.5-lightning-free";
    assert.equal(getAiAssistantModel(), "nvidia/nemotron-3.5-lightning-free");
    assert.equal(getAiGatewayModel(), "openai/gpt-5.4-mini");

    process.env.AI_ASSISTANT_MODEL = "invalid model";
    assert.equal(getAiAssistantModel(), "openai/gpt-5.4-mini");
  } finally {
    if (previousGateway === undefined) delete process.env.AI_GATEWAY_MODEL;
    else process.env.AI_GATEWAY_MODEL = previousGateway;
    if (previousAssistant === undefined) delete process.env.AI_ASSISTANT_MODEL;
    else process.env.AI_ASSISTANT_MODEL = previousAssistant;
  }
});
