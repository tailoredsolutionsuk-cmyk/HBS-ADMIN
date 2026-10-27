export const adminViewSlugs = {
  Overview: "overview", Websites: "websites", Pipeline: "pipeline", "Lead Finder": "leads",
  "Outreach & Follow-up": "outreach", Clients: "clients", Sales: "sales", Tasks: "tasks",
  Calendar: "calendar", Metrics: "metrics", "JARVIS CEO": "jarvis", Integrations: "integrations",
} as const;

export type AdminView = keyof typeof adminViewSlugs;

export function adminViewFromSlug(slug: string | null): AdminView {
  return (Object.keys(adminViewSlugs) as AdminView[]).find((view) => adminViewSlugs[view] === slug) || "Overview";
}

export const adminViewHelp: Record<AdminView, string> = {
  Overview: "Your priorities and business at a glance.",
  Tasks: "Plan client work and tick off what is done.",
  Calendar: "Meetings, appointments and upcoming work.",
  "Outreach & Follow-up": "See who to contact and when to follow up.",
  "Lead Finder": "Find and review new business opportunities.",
  Clients: "Client details, portal access and website analytics.",
  Pipeline: "Move opportunities from first contact to won.",
  Sales: "Track sales, invoices and payments.",
  Metrics: "Review progress across your business.",
  Websites: "Build and manage your client websites.",
  "JARVIS CEO": "Ask your AI assistant for help with your work.",
  Integrations: "Manage connected services and workspace settings.",
};
