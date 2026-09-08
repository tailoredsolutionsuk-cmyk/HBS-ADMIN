import { APICallError, generateText } from "ai";
import { NextResponse } from "next/server";
import { createClient } from "../../../../lib/supabase/server";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

function text(value: unknown, max = 2500) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

const DEFAULT_AI_MODEL = "openai/gpt-5.6-sol";

function aiErrorCode(error: unknown) {
  if (APICallError.isInstance(error)) {
    if (error.statusCode === 401 || error.statusCode === 403) return "AI_AUTH_FAILED";
    if (error.statusCode === 402) return "AI_BUDGET_REACHED";
    if (error.statusCode === 404) return "AI_MODEL_UNAVAILABLE";
    if (error.statusCode === 429) return "AI_RATE_LIMITED";
  }

  if (error instanceof Error && error.name === "GatewayError") return "AI_AUTH_FAILED";
  return "AI_UNAVAILABLE";
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const userId = data?.claims?.sub;
  if (!userId) return NextResponse.json({ error: "AUTH_REQUIRED" }, { status: 401 });

  const { data: admin } = await supabase.from("admin_users").select("email,role").eq("user_id", userId).maybeSingle();
  if (!admin || !["owner", "admin"].includes(admin.role)) return NextResponse.json({ error: "AI_SCOPE_REQUIRED" }, { status: 403 });

  const body = await request.json().catch(() => ({}));
  const message = text(body.message);
  if (!message) return NextResponse.json({ error: "MESSAGE_REQUIRED" }, { status: 400 });

  const model = process.env.AI_MODEL || DEFAULT_AI_MODEL;

  try {
    const result = await generateText({
      model,
      system: "You are the private HBS CRM business assistant. Help with sales strategy, follow-up drafts, priorities, proposals, marketing ideas, and next actions using only the information the admin deliberately supplies in the prompt. Be concise and commercially useful. Never claim that an email was sent, a record changed, or an external action completed. Never request credentials or hidden secrets.",
      prompt: message,
    });

    await supabase.from("crm_activities").insert({ entity_type: "task", entity_id: "ai-assistant", action: "ai_request", detail: `AI assistant used by ${admin.email}`, created_by: userId });
    return NextResponse.json({ text: result.text, usage: result.usage, model });
  } catch (error) {
    const code = aiErrorCode(error);
    const status = code === "AI_BUDGET_REACHED" ? 402 : code === "AI_RATE_LIMITED" ? 429 : 503;

    console.error("[api/admin/ai] AI Gateway request failed", {
      code,
      model,
      upstreamStatus: APICallError.isInstance(error) ? error.statusCode : undefined,
      errorType: error instanceof Error ? error.name : typeof error,
    });

    return NextResponse.json({ error: code }, { status });
  }
}

