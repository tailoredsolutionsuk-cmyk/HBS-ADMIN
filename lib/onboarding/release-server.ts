import "server-only";
import { builderDB, type BuilderSite } from "../builder/server";
import { BuilderError } from "../builder/providers";
import { clientApprovedCurrentPacket, packetStillCurrent } from "./review-packet";
import { includesMetaAds } from "./model";

/** Existing standalone sites are unaffected; onboarding-linked sites require exact client and owner gates. */
export async function assertOnboardingReleaseReady(site: BuilderSite, actor: string) {
  const db = builderDB();
  const { data: project, error: projectError } = await db.from("onboarding_projects")
    .select("id,client_id,status,revision,service").eq("id", site.id).maybeSingle();
  if (projectError) throw new BuilderError("Could not check client release approval. Keep this site in preview.", 503);
  if (!project || !includesMetaAds(project.service)) return;
  const [admin, proposal, packets] = await Promise.all([
    db.from("admin_users").select("role").eq("user_id", actor).maybeSingle(),
    db.from("onboarding_meta_proposals").select("project_id,source_brief_revision,revision,reviewed_revision,review_decision,draft").eq("project_id", site.id).maybeSingle(),
    db.from("onboarding_review_packets").select("id,project_id,brief_revision,site_revision,preview_deployment,preview_url,proposal_revision").eq("project_id", site.id).order("event_no", { ascending: false }).limit(1),
  ]);
  if (admin.error || proposal.error || packets.error) throw new BuilderError("Client release approval data is unavailable. Keep this site in preview.", 503);
  if (admin.data?.role !== "owner") throw new BuilderError("The HBS owner must approve production release for an onboarded client site.", 403);
  const packet = packets.data?.[0];
  if (!packet || !packetStillCurrent(project, site, proposal.data, packet)) throw new BuilderError("Share the current preview and Meta proposal with the client before publishing.", 409);
  const reviews = await db.from("onboarding_client_reviews").select("decision").eq("packet_id", packet.id).order("event_no", { ascending: false }).limit(1);
  if (reviews.error) throw new BuilderError("Could not check the client's decision. Keep this site in preview.", 503);
  if (!clientApprovedCurrentPacket(project, site, proposal.data, packet, reviews.data?.[0]?.decision || null)) throw new BuilderError("The client must approve the current preview and proposal before production release.", 409);
}
