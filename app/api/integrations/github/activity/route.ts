import { NextResponse } from "next/server";
import { githubPush, validGithubSignature } from "../../../../../lib/activity/github";
import { portalService } from "../../../../../lib/portal/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: Request) {
  const rawBody = await request.text();
  if (rawBody.length > 1_000_000) return NextResponse.json({ error: "PAYLOAD_TOO_LARGE" }, { status: 413 });
  if (!validGithubSignature(rawBody, request.headers.get("x-hub-signature-256"))) return NextResponse.json({ error: "INVALID_SIGNATURE" }, { status: 401 });
  const event = request.headers.get("x-github-event");
  if (event === "ping") return NextResponse.json({ ok: true });
  if (event !== "push") return NextResponse.json({ ok: true, ignored: true });
  try {
    const push = githubPush(JSON.parse(rawBody));
    const db = portalService();
    const source = await db.from("project_activity_sources").select("project_name,client_id").eq("provider", "github").eq("external_key", push.fullName).eq("enabled", true).maybeSingle();
    if (source.error) throw new Error("SOURCE_LOOKUP_FAILED");
    if (!source.data) return NextResponse.json({ ok: true, ignored: true });
    const saved = await db.from("project_activity_events").upsert({
      source: "github",
      external_id: `push:${push.sha}`,
      project_name: source.data.project_name,
      client_id: source.data.client_id,
      action: "commit",
      summary: push.summary,
      event_url: push.url,
      commit_sha: push.sha,
      actor: push.actor,
      occurred_at: push.occurredAt,
      metadata: { repository: push.fullName },
    }, { onConflict: "source,external_id" });
    if (saved.error) throw new Error("ACTIVITY_SAVE_FAILED");
    return NextResponse.json({ ok: true }, { status: 202 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "GITHUB_ACTIVITY_FAILED";
    return NextResponse.json({ error: message }, { status: message.startsWith("INVALID_") ? 400 : 500 });
  }
}
