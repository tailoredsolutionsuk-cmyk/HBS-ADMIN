export class OnboardingError extends Error {
  status: number;
  constructor(message: string, status = 400) { super(message); this.status = status; }
}
export const BRIEF_FIELDS = [
  ["business", "Business and services"],
  ["audience", "Who should the website reach?"],
  ["goals", "What should the website achieve?"],
  ["pages", "Pages and features"],
  ["brand", "Colours, style and brand guidance"],
  ["content", "Content and reference websites"],
  ["domain", "Domain and access arrangements (no passwords)"],
  ["industry", "Industry or niche"],
  ["services", "Services to feature on the website"],
  ["location", "Business location and service area"],
  ["publicEmail", "Public contact email"],
  ["publicPhone", "Public contact phone"],
  ["offer", "Offer to promote in ads"],
  ["targetGeography", "Ad target geography"],
  ["budgetProposal", "Proposed ad budget (subject to owner approval)"],
  ["assetRights", "Who owns and may use the supplied brand and ad assets?"],
] as const;
export type Brief = Record<(typeof BRIEF_FIELDS)[number][0], string>;
export const EMPTY_BRIEF: Brief = { business: "", audience: "", goals: "", pages: "", brand: "", content: "", domain: "", industry: "", services: "", location: "", publicEmail: "", publicPhone: "", offer: "", targetGeography: "", budgetProposal: "", assetRights: "" };
export type ProjectStatus = "collecting" | "submitted" | "changes_requested" | "approved";
export type Project = {
  id: string; client_id: string; name: string; service: string; target_date: string | null;
  status: ProjectStatus; brief: Brief; revision: number; review_note: string | null;
  created_at: string; updated_at: string;
};
export const STATUS_LABELS: Record<ProjectStatus, string> = {
  collecting: "Waiting for client brief", submitted: "Ready for review",
  changes_requested: "Changes requested", approved: "Brief approved",
};
export function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new OnboardingError("Invalid request.");
  return value as Record<string, unknown>;
}
export function text(value: unknown, label: string, max: number, required = false): string {
  if (typeof value !== "string" || value.length > max) throw new OnboardingError(`${label} must be text under ${max + 1} characters.`);
  const result = value.trim();
  if (required && !result) throw new OnboardingError(`${label} is required.`);
  return result;
}
export function projectId(value: unknown) {
  if (typeof value !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)) throw new OnboardingError("Invalid project ID.");
  return value.toLowerCase();
}
export function revision(value: unknown) {
  if (!Number.isSafeInteger(value) || Number(value) < 0) throw new OnboardingError("Reload the project before saving.");
  return value as number;
}
export function parseProject(value: unknown) {
  const input = record(value);
  const date = input.target_date === "" || input.target_date == null ? null : text(input.target_date, "Target date", 10);
  if (date && (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(Date.parse(date)) || new Date(date).toISOString().slice(0, 10) !== date)) throw new OnboardingError("Choose a valid target date.");
  return {
    client_id: text(input.client_id, "Client", 200, true),
    name: text(input.name, "Project name", 160, true),
    service: text(input.service, "Service", 100, true), target_date: date,
  };
}
export function parseBrief(value: unknown, submit = false): Brief {
  const input = record(value);
  const brief = Object.fromEntries(BRIEF_FIELDS.map(([key, label]) => [key, text(input[key] ?? "", label, 4000, submit && ["business", "audience", "goals", "pages"].includes(key))])) as Brief;
  if (brief.publicEmail && (brief.publicEmail.length > 300 || !/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(brief.publicEmail))) throw new OnboardingError("Enter a valid public contact email.");
  if (brief.publicPhone && (brief.publicPhone.length > 40 || !/^[+\d ()-]{5,40}$/.test(brief.publicPhone))) throw new OnboardingError("Enter a valid public contact phone number.");
  return brief;
}
export function editableBrief(status: ProjectStatus) { return status === "collecting" || status === "changes_requested"; }

