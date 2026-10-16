import { NextResponse } from "next/server";
import { builderDB } from "../../../../../lib/builder/server";
import { createDocument, DocumentError, parseBrief } from "../../../../../lib/builder/model";
import { BuilderError, resourceName } from "../../../../../lib/builder/providers";
import { onboardingAdmin, databaseError, mutationLimit, readMutation } from "../../../../../lib/onboarding/server";
import { OnboardingError, projectId, revision } from "../../../../../lib/onboarding/model";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const { id: actor, role, db } = await onboardingAdmin();
    if (role !== "owner") throw new OnboardingError("The HBS owner must create the first website draft.", 403);
    const body = await readMutation(request);
    const id = projectId(body.projectId);
    try { resourceName(id); } catch (cause) { if (cause instanceof BuilderError) throw new OnboardingError("This project ID cannot be used for Website Studio. Contact HBS support.", 409); throw cause; }
    const approvedRevision = revision(body.briefRevision);
    const { data: project, error } = await db.from("onboarding_projects")
      .select("id,client_id,status,revision").eq("id", id).maybeSingle();
    databaseError(error);
    if (!project) throw new OnboardingError("Onboarding project not found.", 404);
    if (project.status !== "approved" || project.revision !== approvedRevision) throw new OnboardingError("The approved brief changed. Reload the project before creating a draft.", 409);
    const { data: client, error: clientError } = await db.from("clients")
      .select("id").eq("id", project.client_id).eq("archived", false).maybeSingle();
    databaseError(clientError);
    if (!client) throw new OnboardingError("This client is unavailable.", 404);
    let draft;
    try { draft = createDocument(parseBrief(body.builderBrief)); }
    catch (cause) { if (cause instanceof DocumentError) throw new OnboardingError(cause.message); throw cause; }
    await mutationLimit(db, actor);
    const sites = builderDB();
    // The onboarding UUID is the stable site UUID. The primary key makes retries safe.
    const { error: insertError } = await sites.from("builder_sites").insert({
      id, owner_id: actor, client_id: project.client_id, name: draft.brief.businessName, draft,
    });
    if (insertError && insertError.code !== "23505") throw new OnboardingError("Could not save the private website draft. Check Website Studio setup.", 503);
    const { data: site, error: siteError } = await sites.from("builder_sites")
      .select("id,owner_id,client_id,revision,published_revision").eq("id", id).maybeSingle();
    if (siteError || !site) throw new OnboardingError("Could not verify the saved website draft.", 503);
    if (site.owner_id !== actor || site.client_id !== project.client_id) throw new OnboardingError("A website with this project ID belongs to a different workspace. Contact the HBS owner.", 409);
    return NextResponse.json({ siteId: site.id, revision: site.revision, alreadyExisted: Boolean(insertError), published: site.published_revision !== null }, { headers: { "Cache-Control": "no-store" } });
  } catch (cause) {
    return NextResponse.json({ error: cause instanceof OnboardingError ? cause.message : "Website draft is temporarily unavailable." }, { status: cause instanceof OnboardingError ? cause.status : 503, headers: { "Cache-Control": "no-store" } });
  }
}
