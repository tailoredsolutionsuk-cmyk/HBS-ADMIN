import { portalAccount } from "../../../../lib/portal/server";
import { readMutation, databaseError, failure, response, PROJECT_COLUMNS, mutationLimit } from "../../../../lib/onboarding/server";
import { OnboardingError, parseBrief, projectId, revision } from "../../../../lib/onboarding/model";

export async function GET() {
  try {
    const account = await portalAccount();
    if (!account) throw new OnboardingError("Please sign in with an enabled client account.", 401);
    const projects = await account.db.from("onboarding_projects").select(PROJECT_COLUMNS, { count: "exact" }).eq("client_id",account.client.id).order("created_at", { ascending: false }).limit(100);
    databaseError(projects.error);
    return response({ projects: projects.data, truncated: (projects.count ?? 0) > 100 });
  } catch (error) { return failure(error); }
}
export async function POST(request: Request) {
  try {
    const account = await portalAccount();
    if (!account) throw new OnboardingError("Please sign in with an enabled client account.",401);
    const body = await readMutation(request);
    if (body.action !== "save" && body.action !== "submit") throw new OnboardingError("Unsupported action.");
    const id = projectId(body.id);
    // Scope before mutation; the transaction independently rechecks the live membership.
    const project = await account.db.from("onboarding_projects").select("id").eq("id",id).eq("client_id",account.client.id).maybeSingle();
    databaseError(project.error);
    if (!project.data) throw new OnboardingError("Project not found.",404);
    await mutationLimit(account.db, account.user.id);
    const { data, error } = await account.db.rpc("onboarding_mutate", {
      p_action: body.action, p_id: id, p_actor: account.user.id,
      p_payload: { brief: parseBrief(body.brief,body.action === "submit"), authenticated_email: account.user.email }, p_revision: revision(body.revision),
    });
    databaseError(error);
    return response({ project: { id: data.id, revision: data.revision, status: data.status } });
  } catch (error) { return failure(error); }
}

