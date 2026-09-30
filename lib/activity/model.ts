export const activitySources = ["codex", "chatgpt", "github", "vercel", "portal", "builder", "manual"] as const;
export type ActivitySource = typeof activitySources[number];

export type ActivityInput = {
  source: ActivitySource;
  externalId: string;
  projectName: string;
  clientId: string | null;
  action: string;
  summary: string;
  url: string | null;
  commitSha: string | null;
  actor: string | null;
  occurredAt: string;
  metadata: Record<string, string | number | boolean | null>;
};

function text(value: unknown, max: number) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function optionalHttpsUrl(value: unknown) {
  const candidate = text(value, 2000);
  if (!candidate) return null;
  try {
    const url = new URL(candidate);
    return url.protocol === "https:" ? url.toString() : null;
  } catch {
    return null;
  }
}

function safeMetadata(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const safe: Record<string, string | number | boolean | null> = {};
  for (const [key, item] of Object.entries(value).slice(0, 20)) {
    const safeKey = text(key, 60);
    if (!safeKey || !["string", "number", "boolean"].includes(typeof item) && item !== null) continue;
    safe[safeKey] = typeof item === "string" ? item.slice(0, 500) : item as number | boolean | null;
  }
  return JSON.stringify(safe).length <= 16000 ? safe : {};
}

export function parseActivityInput(value: unknown): ActivityInput {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("INVALID_ACTIVITY");
  const body = value as Record<string, unknown>;
  const source = text(body.source, 20) as ActivitySource;
  const externalId = text(body.externalId, 240);
  const projectName = text(body.projectName, 160);
  const clientId = text(body.clientId, 200) || null;
  const action = text(body.action, 80);
  const summary = text(body.summary, 1000);
  const commitSha = text(body.commitSha, 64) || null;
  const actor = text(body.actor, 320) || null;
  const suppliedDate = text(body.occurredAt, 50);
  const occurred = suppliedDate ? new Date(suppliedDate) : new Date();
  if (!activitySources.includes(source) || !externalId || !projectName || !action || !summary || Number.isNaN(occurred.valueOf())) throw new Error("INVALID_ACTIVITY");
  if (body.url && !optionalHttpsUrl(body.url)) throw new Error("INVALID_ACTIVITY_URL");
  if (commitSha && !/^[0-9a-f]{7,64}$/i.test(commitSha)) throw new Error("INVALID_COMMIT_SHA");
  return { source, externalId, projectName, clientId, action, summary, url: optionalHttpsUrl(body.url), commitSha, actor, occurredAt: occurred.toISOString(), metadata: safeMetadata(body.metadata) };
}
