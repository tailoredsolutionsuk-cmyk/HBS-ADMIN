type ErrorNode = { statusCode?: unknown; status?: unknown; code?: unknown; type?: unknown; cause?: unknown; error?: unknown; lastError?: unknown; responseBody?: unknown };
const knownCodes = new Set(["customer_verification_required", "insufficient_funds", "insufficient_quota", "quota_for_entity_exceeded", "model_not_found", "invalid_api_key", "permission_denied"]);

export function classifyAIError(error: unknown) {
  const queue: unknown[] = [error];
  const seen = new Set<unknown>();
  let upstreamStatus: number | undefined;
  const codes: string[] = [];
  for (let count = 0; queue.length && count < 20; count++) {
    const value = queue.shift();
    if (!value || typeof value !== "object" || seen.has(value)) continue;
    seen.add(value);
    const node = value as ErrorNode;
    const status = Number(node.statusCode ?? node.status);
    if (upstreamStatus === undefined && Number.isInteger(status) && status >= 400 && status <= 599) upstreamStatus = status;
    for (const candidate of [node.code, node.type]) {
      if (typeof candidate === "string" && knownCodes.has(candidate)) codes.push(candidate);
    }
    queue.push(node.cause, node.error, node.lastError);
    if (typeof node.responseBody === "string" && node.responseBody.length <= 16_384) {
      try { queue.push(JSON.parse(node.responseBody)); } catch { /* Unstructured provider text is not an error classification. */ }
    }
  }
  let code = "JARVIS_UNAVAILABLE";
  let status = 503;
  if (error && typeof error === "object" && (error as { code?: unknown }).code === "AI_CONFIGURATION_REQUIRED") code = "AI_CONFIGURATION_REQUIRED";
  else if (codes.includes("customer_verification_required")) { code = "AI_BILLING_REQUIRED"; status = 402; }
  else if (upstreamStatus === 401 || codes.includes("invalid_api_key")) code = "AI_AUTH_FAILED";
  else if (upstreamStatus === 403 || codes.includes("permission_denied")) code = "AI_ACCESS_DENIED";
  else if (codes.includes("quota_for_entity_exceeded")) { code = "AI_BUDGET_REACHED"; status = 402; }
  else if (codes.includes("insufficient_funds") || codes.includes("insufficient_quota")) { code = "AI_CREDITS_REQUIRED"; status = 402; }
  else if (upstreamStatus === 402) { code = "AI_PAYMENT_REQUIRED"; status = 402; }
  else if (upstreamStatus === 429) { code = "AI_RATE_LIMITED"; status = 429; }
  else if (upstreamStatus === 404 || codes.includes("model_not_found")) code = "AI_MODEL_UNAVAILABLE";
  // Diagnostics deliberately exclude messages, response bodies, prompts and credentials.
  return { code, status, diagnostic: { upstreamStatus, providerErrorCode: codes[0] } };
}
