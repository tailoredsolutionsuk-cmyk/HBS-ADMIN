import { NextResponse } from "next/server";
import { onboardingAdmin, databaseError, mutationLimit, readMutation } from "../../../../../lib/onboarding/server";
import { OnboardingError, includesMetaAds, projectId, revision, text } from "../../../../../lib/onboarding/model";
import { packetStillCurrent, reviewArtifactsReady, type ReviewPacket } from "../../../../../lib/onboarding/review-packet";

export const dynamic = "force-dynamic";
const json = (value: unknown, status = 200) => NextResponse.json(value, { status, headers: { "Cache-Control": "private, no-store" } });
const fail = (cause: unknown) => json({ error: cause instanceof OnboardingError ? cause.message : "Client review packet is temporarily unavailable." }, cause instanceof OnboardingError ? cause.status : 503);

async function state(db: Awaited<ReturnType<typeof onboardingAdmin>>["db"], id: string) {
  const [project, site, proposal, latest] = await Promise.all([
    db.from("onboarding_projects").select("id,client_id,status,revision,service").eq("id", id).maybeSingle(),
    db.from("builder_sites").select("id,client_id,revision,preview_revision,preview_deployment,preview_url").eq("id", id).maybeSingle(),
    db.from("onboarding_meta_proposals").select("project_id,source_brief_revision,revision,reviewed_revision,review_decision,draft").eq("project_id", id).maybeSingle(),
    db.from("onboarding_review_packets").select("id,project_id,brief_revision,site_revision,preview_deployment,preview_url,proposal_revision,released_at").eq("project_id", id).order("event_no", { ascending: false }).limit(1),
  ]);
  [project.error, site.error, proposal.error, latest.error].forEach(databaseError);
  if (!project.data) throw new OnboardingError("Onboarding project not found.", 404);
  if (!includesMetaAds(project.data.service)) throw new OnboardingError("This project does not include Meta Ads review.", 409);
  const packet = latest.data?.[0] || null;
  const current = packet ? packetStillCurrent(project.data, site.data, proposal.data, packet) : false;
  return { project: project.data, site: site.data, proposal: proposal.data, packet, current, ready: reviewArtifactsReady(project.data, site.data, proposal.data) };
}

export async function GET(request: Request) {
  try {
    const { db } = await onboardingAdmin();
    const id = projectId(new URL(request.url).searchParams.get("projectId"));
    const value = await state(db, id);
    const review = value.current && value.packet ? await db.from("onboarding_client_reviews")
      .select("decision,feedback,reviewed_at").eq("packet_id", value.packet.id).order("event_no", { ascending: false }).limit(1) : null;
    if (review) databaseError(review.error);
    return json({ ready: value.ready, packet: value.current ? value.packet : null, siteRevision: value.site?.revision ?? null,
      previewDeployment: value.site?.preview_deployment ?? null, previewUrl: value.site?.preview_url ?? null,
      proposalRevision: value.proposal?.revision ?? null, clientReview: review?.data?.[0] || null });
  } catch (cause) { return fail(cause); }
}

export async function POST(request: Request) {
  try {
    const { id: actor, role, db } = await onboardingAdmin();
    if (role !== "owner") throw new OnboardingError("Only the HBS owner can share client review material.", 403);
    const body = await readMutation(request);
    if (body.action !== "share" || body.confirmed !== true) throw new OnboardingError("Confirm the exact review packet before sharing it.");
    const id = projectId(body.projectId);
    const qaNote = text(body.qaNote ?? "", "QA note", 4000, true);
    const value = await state(db, id);
    if (!value.ready || !value.site || !value.proposal) throw new OnboardingError("Build the current website preview and approve its matching Meta proposal first.", 409);
    if (revision(body.siteRevision) !== value.site.revision || body.previewDeployment !== value.site.preview_deployment || revision(body.proposalRevision) !== value.proposal.revision) throw new OnboardingError("The preview or proposal changed. Reload before sharing.", 409);
    await mutationLimit(db, actor);
    const record = { project_id: id, brief_revision: value.project.revision, site_revision: value.site.revision,
      preview_deployment: value.site.preview_deployment!, preview_url: value.site.preview_url!, proposal_revision: value.proposal.revision,
      qa_note: qaNote, released_by: actor };
    const { data, error } = await db.from("onboarding_review_packets").insert(record).select("id,project_id,brief_revision,site_revision,preview_deployment,preview_url,proposal_revision,released_at").maybeSingle();
    if (error?.code === "23505") {
      const existing = await db.from("onboarding_review_packets").select("id,project_id,brief_revision,site_revision,preview_deployment,preview_url,proposal_revision,released_at")
        .eq("project_id", id).eq("site_revision", record.site_revision).eq("preview_deployment", record.preview_deployment).eq("proposal_revision", record.proposal_revision).maybeSingle();
      databaseError(existing.error);
      if (existing.data && packetStillCurrent(value.project, value.site, value.proposal, existing.data as ReviewPacket)) return json({ packet: existing.data, alreadyShared: true });
      throw new OnboardingError("The review packet changed. Reload it before sharing.", 409);
    }
    databaseError(error);
    return json({ packet: data, alreadyShared: false }, 201);
  } catch (cause) { return fail(cause); }
}
