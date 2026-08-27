import { APICallError, generateText } from "ai";
import { NextResponse } from "next/server";
import { createClient } from "../../../../lib/supabase/server";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

function text(value: unknown, max = 2500) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
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

  try {
    const result = await generateText({
      model: process.env.AI_MODEL || "openai/gpt-5.6-sol",
      system: "You are the private HBS CRM business assistant. Help with sales strategy, follow-up drafts, priorities, proposals, marketing ideas, and next actions using only the information the admin deliberately supplies in the prompt. Be concise and commercially useful. Never claim that an email was sent, a record changed, or an external action completed. Never request credentials or hidden secrets.",
      prompt: message,
    });

    await supabase.from("crm_activities").insert({ entity_type: "task", entity_id: "ai-assistant", action: "ai_request", detail: `AI assistant used by ${admin.email}`, created_by: userId });
    return NextResponse.json({ text: result.text, usage: result.usage, model: process.env.AI_MODEL || "openai/gpt-5.6-sol" });
  } catch (error) {
    if (APICallError.isInstance(error)) {
      const status = error.statusCode === 402 || error.statusCode === 429 ? error.statusCode : 503;
      return NextResponse.json({ error: status === 402 ? "AI_BUDGET_REACHED" : status === 429 ? "AI_RATE_LIMITED" : "AI_UNAVAILABLE" }, { status });
    }
    return NextResponse.json({ error: "AI_UNAVAILABLE" }, { status: 503 });
  }
}

