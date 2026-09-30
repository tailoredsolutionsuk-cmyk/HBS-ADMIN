import "server-only";
import { timingSafeEqual } from "node:crypto";
import { portalService } from "../portal/server";
import type { ActivityInput } from "./model";

export function validActivitySecret(header: string | null) {
  const expected = process.env.HBS_ACTIVITY_WEBHOOK_SECRET;
  if (!expected || !header?.startsWith("Bearer ")) return false;
  const supplied = header.slice(7);
  const left = Buffer.from(supplied);
  const right = Buffer.from(expected);
  return left.length === right.length && timingSafeEqual(left, right);
}

export async function saveActivity(input: ActivityInput) {
  const db = portalService();
  if (input.clientId) {
    const client = await db.from("clients").select("id").eq("id", input.clientId).eq("archived", false).maybeSingle();
    if (client.error) throw new Error("ACTIVITY_CLIENT_LOOKUP_FAILED");
    if (!client.data) throw new Error("ACTIVITY_CLIENT_NOT_FOUND");
  }
  const result = await db.from("project_activity_events").upsert({
    source: input.source,
    external_id: input.externalId,
    project_name: input.projectName,
    client_id: input.clientId,
    action: input.action,
    summary: input.summary,
    event_url: input.url,
    commit_sha: input.commitSha,
    actor: input.actor,
    occurred_at: input.occurredAt,
    metadata: input.metadata,
  }, { onConflict: "source,external_id" }).select("id").single();
  if (result.error) throw new Error("ACTIVITY_SAVE_FAILED");
  return result.data;
}
