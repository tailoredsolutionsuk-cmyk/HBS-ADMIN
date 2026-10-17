import { NextResponse } from "next/server";
import { portalAccount } from "../../../../../lib/portal/server";
import { databaseError, mutationLimit, readMutation } from "../../../../../lib/onboarding/server";
import { OnboardingError, projectId, text } from "../../../../../lib/onboarding/model";
import { packetStillCurrent } from "../../../../../lib/onboarding/review-packet";
import { PAGE_KEYS, parseDocument, renderPage, type PageKey } from "../../../../../lib/builder/model";

export const dynamic = "force-dynamic";
const json = (value: unknown, status = 200) => NextResponse.json(value, { status, headers: { "Cache-Control": "private, no-store" } });
const fail = (cause: unknown) => json({ error: cause instanceof OnboardingError ? cause.message : "Client review is temporarily unavailable." }, cause instanceof OnboardingError ? cause.status : 503);

async function currentPacket(account: NonNullable<Awaited<ReturnType<typeof portalAccount>>>, id: string) {
  const { db, client } = account;
  const project = await db.from("onboarding_projects").select("id,client_id,status,revision").eq("id", id).eq("client_id", client.id).maybeSingle();
  databaseError(project.error);
  if (!project.data) throw new OnboardingError("Project not found.", 404);
  const [site, proposal, packets] = await Promise.all([
    db.from("builder_sites").select("id,client_id,revision,preview_revision,preview_deployment,preview_url,draft").eq("id", id).eq("client_id", client.id).maybeSingle(),
    db.from("onboarding_meta_proposals").select("project_id,source_brief_revision,revision,reviewed_revision,review_decision,draft").eq("project_id", id).maybeSingle(),
    db.from("onboarding_review_packets").select("id,project_id,brief_revision,site_revision,preview_deployment,preview_url,proposal_revision,released_at").eq("project_id", id).order("event_no", { ascending: false }).limit(1),
  ]);
  [site.error, proposal.error, packets.error].forEach(databaseError);
  const packet = packets.data?.[0] || null;
  if (!packet || !packetStillCurrent(project.data, site.data, proposal.data, packet)) return null;
  return { packet, site: site.data!, proposal: proposal.data! };
}

export async function GET(request: Request) {
  try {
    const account = await portalAccount();
    if (!account) throw new OnboardingError("Please sign in with an enabled client account.", 401);
    const url = new URL(request.url), id = projectId(url.searchParams.get("projectId"));
    const value = await currentPacket(account, id);
    if (!value) return json({ packet: null });
    const page = url.searchParams.get("page") || "home";
    if (!PAGE_KEYS.includes(page as PageKey)) throw new OnboardingError("Choose a valid preview page.");
    const review = await account.db.from("onboarding_client_reviews").select("decision,feedback,reviewed_at")
      .eq("packet_id", value.packet.id).order("event_no", { ascending: false }).limit(1);
    databaseError(review.error);
    const document = parseDocument(value.site.draft);
    return json({ packet: value.packet, proposal: value.proposal.draft, previewHtml: renderPage(document, page as PageKey, true),
      page, review: review.data?.[0] || null });
  } catch (cause) { return fail(cause); }
}

export async function POST(request: Request) {
  try {
    const account = await portalAccount();
    if (!account) throw new OnboardingError("Please sign in with an enabled client account.", 401);
    const body = await readMutation(request);
    if (body.action !== "review") throw new OnboardingError("Unsupported client review action.");
    const id = projectId(body.projectId), packetId = projectId(body.packetId);
    const decision = body.decision;
    if (decision !== "approved" && decision !== "changes_requested") throw new OnboardingError("Choose a review decision.");
    const feedback = text(body.feedback ?? "", "Feedback", 4000, decision === "changes_requested");
    const value = await currentPacket(account, id);
    if (!value || value.packet.id !== packetId) throw new OnboardingError("The review packet changed. Reload before responding.", 409);
    await mutationLimit(account.db, account.user.id);
    const { data, error } = await account.db.from("onboarding_client_reviews")
      .insert({ packet_id: packetId, decision, feedback, reviewed_by: account.user.id })
      .select("id,decision,feedback,reviewed_at").single();
    databaseError(error);
    return json({ review: data }, 201);
  } catch (cause) { return fail(cause); }
}
