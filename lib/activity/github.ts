import { createHmac, timingSafeEqual } from "node:crypto";

export type GithubFileChange = { path: string; status: "added" | "modified" | "removed" };

export type GithubPush = {
  fullName: string;
  sha: string;
  summary: string;
  url: string | null;
  actor: string | null;
  occurredAt: string;
  branch: string | null;
  commitCount: number;
  commitMessages: string[];
  files: GithubFileChange[];
};

export function validGithubSignature(rawBody: string, signature: string | null, secret = process.env.CRON_SECRET) {
  if (!secret || !signature?.startsWith("sha256=")) return false;
  const expected = `sha256=${createHmac("sha256", secret).update(rawBody).digest("hex")}`;
  const left = Buffer.from(signature);
  const right = Buffer.from(expected);
  return left.length === right.length && timingSafeEqual(left, right);
}

function cleanText(value: unknown, max: number) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function fileNames(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value.map((item) => cleanText(item, 200)).filter(Boolean).slice(0, 50);
}

export function githubPush(payload: unknown): GithubPush {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) throw new Error("INVALID_GITHUB_PAYLOAD");
  const body = payload as Record<string, unknown>;
  const repository = body.repository as Record<string, unknown> | undefined;
  const commit = body.head_commit as Record<string, unknown> | undefined;
  const sender = body.sender as Record<string, unknown> | undefined;
  const fullName = typeof repository?.full_name === "string" ? repository.full_name.toLowerCase().slice(0, 240) : "";
  const sha = typeof body.after === "string" && /^[0-9a-f]{40}$/i.test(body.after) ? body.after : "";
  const summary = cleanText(commit?.message, 1000).split("\n")[0];
  const url = typeof commit?.url === "string" && commit.url.startsWith("https://") ? commit.url.slice(0, 2000) : null;
  const actor = typeof sender?.login === "string" ? sender.login.slice(0, 320) : null;
  const occurredAt = typeof commit?.timestamp === "string" && !Number.isNaN(new Date(commit.timestamp).valueOf()) ? new Date(commit.timestamp).toISOString() : new Date().toISOString();
  if (!fullName || !sha || !summary) throw new Error("INVALID_GITHUB_PAYLOAD");
  const branch = typeof body.ref === "string" && body.ref.startsWith("refs/heads/") ? body.ref.slice(11, 251) : null;
  const commits = Array.isArray(body.commits) ? body.commits.slice(0, 20) : [];
  const commitMessages = commits.map((item) => cleanText((item as Record<string, unknown>)?.message, 500).split("\n")[0]).filter(Boolean);
  const changed = new Map<string, GithubFileChange["status"]>();
  for (const item of commits) {
    const candidate = item as Record<string, unknown>;
    for (const path of fileNames(candidate.added)) changed.set(path, "added");
    for (const path of fileNames(candidate.modified)) changed.set(path, "modified");
    for (const path of fileNames(candidate.removed)) changed.set(path, "removed");
  }
  const files = Array.from(changed, ([path, status]) => ({ path, status })).slice(0, 50);
  return { fullName, sha, summary, url, actor, occurredAt, branch, commitCount: commits.length || 1, commitMessages: commitMessages.length ? commitMessages : [summary], files };
}

export function githubFallbackSummary(push: GithubPush) {
  if (!push.files.length) return push.summary;
  const counts = push.files.reduce((total, file) => ({ ...total, [file.status]: total[file.status] + 1 }), { added: 0, modified: 0, removed: 0 });
  const parts = (["added", "modified", "removed"] as const).filter((status) => counts[status]).map((status) => `${counts[status]} ${status}`);
  return `${push.summary}. ${push.commitCount} commit${push.commitCount === 1 ? "" : "s"} changed ${push.files.length} file${push.files.length === 1 ? "" : "s"} (${parts.join(", ")}).`.slice(0, 1000);
}
