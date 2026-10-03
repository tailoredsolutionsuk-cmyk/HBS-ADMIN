export type IdealCustomerProfile = {
  sector: string;
  location: string;
  goal: "website" | "enquiries" | "visibility" | "automation";
  websitePreference: "any" | "missing" | "present";
};

export type Prospect = {
  name: string;
  sector: string;
  location: string;
  country: string;
  website: string;
  email: string;
  phone: string;
  sourceUrl: string;
  source: "Brave Place Search" | "Manual review" | "Chrome CSV import";
  score: number;
  reasons: string[];
  duplicate: boolean;
};

type PlaceResult = {
  title?: unknown;
  url?: unknown;
  provider_url?: unknown;
  categories?: unknown;
  description?: unknown;
  postal_address?: { addressLocality?: unknown; displayAddress?: unknown; country?: unknown };
  contact?: { email?: unknown; telephone?: unknown };
};

export const defaultProfile: IdealCustomerProfile = {
  sector: "Local service business",
  location: "",
  goal: "enquiries",
  websitePreference: "any",
};

const goals = new Set<IdealCustomerProfile["goal"]>(["website", "enquiries", "visibility", "automation"]);
const websitePreferences = new Set<IdealCustomerProfile["websitePreference"]>(["any", "missing", "present"]);
const text = (value: unknown, max: number) => typeof value === "string" ? value.trim().slice(0, max) : "";
const key = (value: string) => value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
const listingHosts = new Set(["facebook.com", "instagram.com", "linkedin.com", "yell.com", "tripadvisor.co.uk", "tripadvisor.com"]);

export function parseProfile(value: unknown): IdealCustomerProfile | null {
  if (!value || typeof value !== "object") return null;
  const input = value as Record<string, unknown>;
  const sector = text(input.sector, 80);
  const location = text(input.location, 100);
  const goal = text(input.goal, 30) as IdealCustomerProfile["goal"];
  const websitePreference = text(input.websitePreference, 20) as IdealCustomerProfile["websitePreference"];
  if (!sector || !goals.has(goal) || !websitePreferences.has(websitePreference)) return null;
  return { sector, location, goal, websitePreference };
}

export function publicWebsite(value: unknown): string {
  const raw = text(value, 500);
  if (!raw) return "";
  try {
    const url = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`);
    const host = url.hostname.toLowerCase();
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || !host.includes('.') || host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local') || /^(?:\d{1,3}\.){3}\d{1,3}$/.test(host) || host.includes(':')) return "";
    return `${url.protocol}//${host}${url.port ? `:${url.port}` : ""}${url.pathname === "/" ? "" : url.pathname}`;
  } catch {
    return "";
  }
}

export function websiteHost(value: string): string {
  const website = publicWebsite(value);
  if (!website) return "";
  return new URL(website).hostname.replace(/^www\./, "");
}

export function scoreProspect(input: Omit<Prospect, "score" | "reasons" | "duplicate">, profile: IdealCustomerProfile) {
  let score = 20;
  const reasons: string[] = [];
  const location = key(input.location);
  const targetLocation = key(profile.location);
  if (input.country === "GB" || input.country === "UK" || input.country === "United Kingdom") {
    score += 20;
    reasons.push("UK business listing");
  }
  if (targetLocation && (location.includes(targetLocation) || targetLocation.includes(location) && location.length > 2)) {
    score += 25;
    reasons.push(`Listed in ${profile.location}`);
  }
  const sector = key(profile.sector);
  const listedSector = key(input.sector);
  if (sector && (listedSector.includes(sector) || sector.includes(listedSector) && listedSector.length > 2)) {
    score += 20;
    reasons.push(`Sector matches ${profile.sector}`);
  }
  if (profile.websitePreference === "missing" && !input.website) {
    score += 10;
    reasons.push("No website listed; verify before outreach");
  } else if (profile.websitePreference === "present" && input.website) {
    score += 10;
    reasons.push("Business website listed");
  } else if (profile.websitePreference === "any" && input.website) {
    score += 5;
    reasons.push("Business website available for review");
  }
  if (input.email || input.phone) {
    score += 5;
    reasons.push("Public business contact listed");
  }
  return { score: Math.min(score, 100), reasons };
}

export function normaliseProspect(raw: PlaceResult, profile: IdealCustomerProfile, source: Prospect["source"]): Prospect | null {
  if (!raw || typeof raw !== "object") return null;
  const name = text(raw.title, 200);
  if (name.length < 2) return null;
  const country = text(raw.postal_address?.country, 40);
  if (source === "Brave Place Search" && country && !["GB", "UK", "United Kingdom"].includes(country)) return null;
  const location = text(raw.postal_address?.addressLocality, 100) || text(raw.postal_address?.displayAddress, 100) || profile.location;
  const categories = Array.isArray(raw.categories) ? raw.categories.filter((value): value is string => typeof value === "string") : [];
  const sector = categories.slice(0, 2).join(", ").slice(0, 100) || text(raw.description, 100) || profile.sector;
  const listedWebsite = publicWebsite(raw.url);
  const website = [...listingHosts].some((host) => websiteHost(listedWebsite) === host || websiteHost(listedWebsite).endsWith(`.${host}`)) ? "" : listedWebsite;
  const email = text(raw.contact?.email, 320);
  const phone = text(raw.contact?.telephone, 50);
  const sourceUrl = publicWebsite(raw.provider_url) || website;
  const candidate = { name, sector, location, country, website, email: /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : "", phone, sourceUrl, source };
  return { ...candidate, ...scoreProspect(candidate, profile), duplicate: false };
}

export function isDuplicateProspect(prospect: Prospect, leads: Array<{ business_name: string; website_url?: string | null; main_location?: string | null }>, clients: Array<{ business_name: string; domain?: string | null; website?: string | null }>): boolean {
  const name = key(prospect.name);
  const location = key(prospect.location);
  const host = websiteHost(prospect.website);
  if (leads.some((lead) => {
    if (host && websiteHost(lead.website_url || "") === host) return true;
    return key(lead.business_name) === name && (!location || !lead.main_location || key(lead.main_location) === location);
  })) return true;
  return clients.some((client) => {
    if (host && (websiteHost(client.domain || "") === host || websiteHost(client.website || "") === host)) return true;
    return key(client.business_name) === name;
  });
}
