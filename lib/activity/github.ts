import { createHmac, timingSafeEqual } from "node:crypto";

export function validGithubSignature(rawBody: string, signature: string | null, secret = process.env.CRON_SECRET) {
  if (!secret || !signature?.startsWith("sha256=")) return false;
  const expected = `sha256=${createHmac("sha256", secret).update(rawBody).digest("hex")}`;
  const left = Buffer.from(signature);
  const right = Buffer.from(expected);
  return left.length === right.length && timingSafeEqual(left, right);
}

export function githubPush(payload: unknown) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) throw new Error("INVALID_GITHUB_PAYLOAD");
  const body = payload as Record<string, unknown>;
  const repository = body.repository as Record<string, unknown> | undefined;
  const commit = body.head_commit as Record<string, unknown> | undefined;
  const sender = body.sender as Record<string, unknown> | undefined;
  const fullName = typeof repository?.full_name === "string" ? repository.full_name.toLowerCase().slice(0, 240) : "";
  const sha = typeof body.after === "string" && /^[0-9a-f]{40}$/i.test(body.after) ? body.after : "";
  const summary = typeof commit?.message === "string" ? commit.message.trim().split("\n")[0].slice(0, 1000) : "";
  const url = typeof commit?.url === "string" && commit.url.startsWith("https://") ? commit.url.slice(0, 2000) : null;
  const actor = typeof sender?.login === "string" ? sender.login.slice(0, 320) : null;
  const occurredAt = typeof commit?.timestamp === "string" && !Number.isNaN(new Date(commit.timestamp).valueOf()) ? new Date(commit.timestamp).toISOString() : new Date().toISOString();
  if (!fullName || !sha || !summary) throw new Error("INVALID_GITHUB_PAYLOAD");
  return { fullName, sha, summary, url, actor, occurredAt };
}
