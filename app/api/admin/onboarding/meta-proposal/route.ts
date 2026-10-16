import { NextResponse } from "next/server";
import { onboardingAdmin, databaseError, mutationLimit, readMutation } from "../../../../../lib/onboarding/server";
import { OnboardingError, projectId, revision, text } from "../../../../../lib/onboarding/model";
import { MetaProposalError, parseMetaProposal, proposalReviewGaps } from "../../../../../lib/onboarding/meta-proposal";

export const dynamic = "force-dynamic";
const json = (value: unknown, status = 200) => NextResponse.json(value, { status, headers: { "Cache-Control": "private, no-store" } });
const fail = (cause: unknown) => json({ error: cause instanceof OnboardingError || cause instanceof MetaProposalError ? cause.message : "Meta proposal is temporarily unavailable." }, cause instanceof OnboardingError ? cause.status : cause instanceof MetaProposalError ? 400 : 503);

async function approvedProject(db: Awaited<ReturnType<typeof onboardingAdmin>>["db"], id: string) {
  const { data, error } = await db.from("onboarding_projects").select("id,status,revision").eq("id", id).maybeSingle();
  databaseError(error);
  if (!data) throw new OnboardingError("Onboarding project not found.", 404);
  if (data.status !== "approved") throw new OnboardingError("Approve the client brief before preparing Meta Ads.", 409);
  return data;
}

export async function GET(request: Request) {
  try {
    const { db } = await onboardingAdmin();
    const id = projectId(new URL(request.url).searchParams.get("projectId"));
    const project = await approvedProject(db, id);
    const { data, error } = await db.from("onboarding_meta_proposals")
      .select("project_id,source_brief_revision,revision,draft,updated_at,reviewed_revision,review_decision,review_note,reviewed_at").eq("project_id", id).maybeSingle();
    databaseError(error);
    return json({ proposal: data, briefRevision: project.revision });
  } catch (cause) { return fail(cause); }
}

export async function POST(request: Request) {
  try {
    const { id: actor, role, db } = await onboardingAdmin();
    if (!["owner", "admin"].includes(role)) throw new OnboardingError("Owner or admin access required to save a Meta proposal.", 403);
    const body = await readMutation(request);
    const id = projectId(body.projectId);
    const sourceRevision = revision(body.briefRevision);
    const project = await approvedProject(db, id);
    if (project.revision !== sourceRevision) throw new OnboardingError("The approved brief changed. Reload before saving the proposal.", 409);
    await mutationLimit(db, actor);
    if (body.action === "review") {
      if (role !== "owner") throw new OnboardingError("Only the HBS owner can review a Meta proposal.", 403);
      const expected = revision(body.expectedRevision);
      const decision = body.decision;
      if (decision !== "approved" && decision !== "changes_requested") throw new OnboardingError("Choose a review decision.");
      const note = text(body.note ?? "", "Review note", 4000, decision === "changes_requested");
      const { data: current, error: readError } = await db.from("onboarding_meta_proposals")
        .select("draft,revision").eq("project_id", id).eq("revision", expected).eq("source_brief_revision", sourceRevision).maybeSingle();
      databaseError(readError);
      if (!current) throw new OnboardingError("This proposal changed. Reload before reviewing.", 409);
      const draft = parseMetaProposal(current.draft);
      if (decision === "approved" && proposalReviewGaps(draft).length) throw new OnboardingError("Complete the proposal and preview landing page before approval.");
      const { data, error } = await db.from("onboarding_meta_proposals")
        .update({ reviewed_revision: expected, review_decision: decision, review_note: note, reviewed_by: actor, reviewed_at: new Date().toISOString() })
        .eq("project_id", id).eq("revision", expected).eq("source_brief_revision", sourceRevision).select("project_id").maybeSingle();
      databaseError(error);
      if (!data) throw new OnboardingError("This proposal changed. Reload before reviewing.", 409);
    } else if (body.action === "save") {
      const draft = parseMetaProposal(body.draft);
    if (body.expectedRevision === null) {
      const { error } = await db.from("onboarding_meta_proposals")
        .insert({ project_id: id, source_brief_revision: sourceRevision, draft, created_by: actor, updated_by: actor });
      if (error?.code === "23505") throw new OnboardingError("A proposal already exists. Reload before editing it.", 409);
      databaseError(error);
    } else {
      const expected = revision(body.expectedRevision);
      const { data, error } = await db.from("onboarding_meta_proposals")
        .update({ draft, revision: expected + 1, updated_by: actor, updated_at: new Date().toISOString() })
        .eq("project_id", id).eq("revision", expected).eq("source_brief_revision", sourceRevision)
        .select("project_id").maybeSingle();
      databaseError(error);
      if (!data) throw new OnboardingError("This proposal changed. Reload before saving again.", 409);
    }
    } else throw new OnboardingError("Unsupported proposal action.");
    const { data, error } = await db.from("onboarding_meta_proposals")
      .select("project_id,source_brief_revision,revision,draft,updated_at,reviewed_revision,review_decision,review_note,reviewed_at").eq("project_id", id).single();
    databaseError(error);
    return json({ proposal: data });
  } catch (cause) { return fail(cause); }
}
