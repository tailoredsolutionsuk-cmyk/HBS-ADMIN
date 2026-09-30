import { after, NextResponse } from "next/server";
import { githubFallbackSummary, githubPush, validGithubSignature } from "../../../../../lib/activity/github";
import { generateGithubActivitySummary } from "../../../../../lib/activity/github-summary";
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
    const metadata = { repository: push.fullName, branch: push.branch, commitCount: push.commitCount, files: push.files, summaryType: "automatic" };
    const saved = await db.from("project_activity_events").upsert({
      source: "github",
      external_id: `push:${push.sha}`,
      project_name: source.data.project_name,
      client_id: source.data.client_id,
      action: "commit",
      summary: githubFallbackSummary(push),
      event_url: push.url,
      commit_sha: push.sha,
      actor: push.actor,
      occurred_at: push.occurredAt,
      metadata,
    }, { onConflict: "source,external_id" });
    if (saved.error) throw new Error("ACTIVITY_SAVE_FAILED");
    if (process.env.GITHUB_ACTIVITY_AI_SUMMARIES === "true") after(async () => {
      try {
        const summary = await generateGithubActivitySummary(push);
        const update = await portalService().from("project_activity_events").update({ summary, metadata: { ...metadata, summaryType: "ai" } }).eq("source", "github").eq("external_id", `push:${push.sha}`);
        if (update.error) console.error("[github/activity] CRM summary update failed", { repository: push.fullName, reason: update.error.message });
      } catch (error) {
        console.error("[github/activity] AI summary unavailable; commit summary retained", { repository: push.fullName, reason: error instanceof Error ? error.message : "UNKNOWN" });
      }
    });
    return NextResponse.json({ ok: true }, { status: 202 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "GITHUB_ACTIVITY_FAILED";
    return NextResponse.json({ error: message }, { status: message.startsWith("INVALID_") ? 400 : 500 });
  }
}
