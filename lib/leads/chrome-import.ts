import { publicWebsite, websiteHost } from "./ideal-customer.ts";

export type CsvTable = { headers: string[]; rows: string[][] };
export type ColumnMap = { name: number; website: number; email: number; phone: number; location: number; sector: number };
export type WebsiteResearchResult = { title: string; website: string; snippet: string; alreadyInCrm?: boolean };

const maxCsvBytes = 1_000_000;
const maxRows = 500;
const maxColumns = 40;
const headerKey = (value: string) => value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
const blockedHosts = ["google.com", "google.co.uk", "googleapis.com", "googleusercontent.com", "goo.gl", "facebook.com", "instagram.com", "linkedin.com", "serpapi.com", "youtube.com"];
const directoryHosts = ["yell.com", "tripadvisor.com", "tripadvisor.co.uk", "checkatrade.com", "trustpilot.com"];

export function isBlockedSource(value: string): boolean {
  const host = websiteHost(value);
  return !host || /(^|\.)google\.[a-z.]+$/.test(host) || blockedHosts.some((blocked) => host === blocked || host.endsWith(`.${blocked}`));
}

export function parseLeadCsv(input: string): CsvTable {
  if (input.length > maxCsvBytes) throw new Error("CSV_TOO_LARGE");
  const content = input.replace(/^\uFEFF/, "");
  const records: string[][] = [];
  let record: string[] = [];
  let cell = "";
  let quoted = false;
  for (let index = 0; index < content.length; index++) {
    const char = content[index];
    if (quoted) {
      if (char === '"' && content[index + 1] === '"') { cell += '"'; index++; }
      else if (char === '"') quoted = false;
      else cell += char;
    } else if (char === '"' && !cell) quoted = true;
    else if (char === ",") { record.push(cell.trim()); cell = ""; }
    else if (char === "\n" || char === "\r") {
      if (char === "\r" && content[index + 1] === "\n") index++;
      record.push(cell.trim());
      if (record.some(Boolean)) records.push(record);
      record = []; cell = "";
      if (records.length > maxRows + 1) throw new Error("CSV_TOO_MANY_ROWS");
    } else cell += char;
    if (cell.length > 5000 || record.length > maxColumns) throw new Error("CSV_INVALID");
  }
  if (quoted) throw new Error("CSV_INVALID");
  record.push(cell.trim());
  if (record.some(Boolean)) records.push(record);
  if (records.length > maxRows + 1) throw new Error("CSV_TOO_MANY_ROWS");
  const headers = records.shift() || [];
  if (!headers.length || headers.length > maxColumns || !records.length) throw new Error("CSV_INVALID");
  if (records.some((row) => row.length > maxColumns)) throw new Error("CSV_INVALID");
  return { headers, rows: records.slice(0, maxRows) };
}

export function guessColumns(headers: string[]): ColumnMap {
  const values = headers.map(headerKey);
  const find = (patterns: RegExp[]) => values.findIndex((value) => patterns.some((pattern) => pattern.test(value)));
  return {
    name: find([/^business name$/, /^company name$/, /^business$/, /^company$/, /^name$/, /^title$/]),
    website: find([/^website$/, /^website url$/, /^site$/, /^domain$/, /^web address$/]),
    email: find([/^email$/, /^email address$/, /^business email$/]),
    phone: find([/^phone$/, /^phone number$/, /^telephone$/, /^tel$/]),
    location: find([/^location$/, /^town$/, /^city$/, /^address$/, /^area$/]),
    sector: find([/^sector$/, /^industry$/, /^category$/, /^business type$/]),
  };
}

export function importedBusiness(row: string[], columns: ColumnMap, sourceUrl: string) {
  const value = (index: number, max: number) => index < 0 ? "" : (row[index] || "").trim().slice(0, max);
  return {
    name: value(columns.name, 200),
    website: isBlockedSource(value(columns.website, 500)) ? "" : publicWebsite(value(columns.website, 500)),
    email: value(columns.email, 320),
    phone: value(columns.phone, 50),
    location: value(columns.location, 100),
    sector: value(columns.sector, 100),
    sourceUrl: publicWebsite(sourceUrl),
  };
}

export function normaliseWebsiteResults(raw: unknown): WebsiteResearchResult[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  return raw.slice(0, 30).flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const result = item as Record<string, unknown>;
    const website = publicWebsite(result.link);
    const host = websiteHost(website);
    if (!host || isBlockedSource(website) || directoryHosts.some((blocked) => host === blocked || host.endsWith(`.${blocked}`)) || seen.has(host)) return [];
    seen.add(host);
    return [{ title: typeof result.title === "string" ? result.title.slice(0, 160) : host, website, snippet: typeof result.snippet === "string" ? result.snippet.slice(0, 300) : "" }];
  }).slice(0, 10);
}
