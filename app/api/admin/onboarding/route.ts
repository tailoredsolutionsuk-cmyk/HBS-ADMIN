import { onboardingAdmin, readMutation, databaseError, failure, response, PROJECT_COLUMNS, mutationLimit } from "../../../../lib/onboarding/server";
import { OnboardingError, parseProject, projectId, revision, text } from "../../../../lib/onboarding/model";

export async function GET() {
  try {
    const { role, db } = await onboardingAdmin();
    const [projects, clients, events] = await Promise.all([
      db.from("onboarding_projects").select(PROJECT_COLUMNS, { count: "exact" }).order("created_at", { ascending: false }).limit(200),
      db.from("clients").select("id,business_name,portal_enabled,portal_email", { count: "exact" }).eq("archived", false).order("business_name").limit(500),
      db.from("onboarding_events").select("id", { count: "exact", head: true }).eq("status", "pending"),
    ]);
    databaseError(projects.error); databaseError(clients.error); databaseError(events.error);
    return response({
      projects: projects.data, clients: clients.data,
      truncated: (projects.count ?? 0) > 200 || (clients.count ?? 0) > 500,
      permissions: { canCreate: ["owner","admin","editor"].includes(role), canReview: ["owner","admin"].includes(role) },
      automation: { enabled: false, pending: events.count ?? 0 },
    });
  } catch (error) { return failure(error); }
}
export async function POST(request: Request) {
  try {
    const { id: actor, role, db } = await onboardingAdmin();
    const body = await readMutation(request);
    const id = projectId(body.id);
    let payload; let expected: number | null = null;
    if (body.action === "create") {
      if (!["owner","admin","editor"].includes(role)) throw new OnboardingError("Read-only access.",403);
      payload = parseProject(body.project);
    } else if (body.action === "approve" || body.action === "request_changes") {
      if (!["owner","admin"].includes(role)) throw new OnboardingError("Owner or admin approval required.",403);
      expected = revision(body.revision);
      payload = { note: text(body.note ?? "", "Review note", 4000, body.action === "request_changes") };
    } else throw new OnboardingError("Unsupported action.");
    await mutationLimit(db, actor);
    const { data, error } = await db.rpc("onboarding_mutate", { p_action: body.action, p_id: id, p_actor: actor, p_payload: payload, p_revision: expected });
    databaseError(error);
    return response({ project: { id: data.id, revision: data.revision, status: data.status } });
  } catch (error) { return failure(error); }
}

