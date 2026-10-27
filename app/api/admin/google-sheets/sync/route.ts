import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { createClient } from "../../../../../lib/supabase/server";
import { googleSheetsAccessToken, googleSheetsConfig, googleSheetsConnection, googleSheetsOwner, type GoogleSheetsConnection } from "../../../../../lib/google-sheets/outreach";
import { portalService } from "../../../../../lib/portal/server";

export const dynamic = "force-dynamic";
const clean = (value: unknown, max = 1000) => typeof value === "string" ? value.trim().slice(0, max) : typeof value === "number" ? String(value) : "";
const normaliseName = (value: string) => value.toLocaleLowerCase("en-GB").replace(/[^a-z0-9]/g, "");
const normalisePhone = (value: string) => {
  const digits = value.replace(/\D/g, "");
  return digits.startsWith("44") ? `0${digits.slice(2)}` : digits;
};
const fingerprint = (name: string, phone: string) => createHash("sha256").update(`${normaliseName(name)}|${normalisePhone(phone)}`).digest("hex");
type SheetRow = { businessName: string; phone: string; location: string; services: string; reviews: string; fingerprint: string };

async function getRows(connection: GoogleSheetsConnection, accessToken: string): Promise<SheetRow[]> {
  const range = `${connection.sheet_name}!A1:F1000`;
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(connection.spreadsheet_id)}/values/${encodeURIComponent(range)}?majorDimension=ROWS`;
  const response = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` }, cache: "no-store", signal: AbortSignal.timeout(15000) });
  if (!response.ok) {
    const payload = await response.json().catch(() => null) as {
      error?: { message?: string; errors?: Array<{ reason?: string }> };
    } | null;
    const reason = payload?.error?.errors?.[0]?.reason || "unknown";
    // Preserve only Google's stable error reason; do not expose provider response
    // bodies, OAuth tokens, or spreadsheet contents to the browser.
    throw new Error(`GOOGLE_SHEETS_READ_${response.status}_${reason}`);
  }
  const payload = await response.json() as { values?: unknown[][] };
  const rows = payload.values || [];
  if (!rows.length) return [];
  const headers = (rows[0] || []).map((value) => clean(value).toLowerCase().replace(/[^a-z0-9]/g, ""));
  const columns = {
    businessName: headers.indexOf("businessname"), phone: headers.indexOf("mobilenumber"), location: headers.indexOf("location"),
    services: headers.indexOf("servicesoffered"), reviews: headers.indexOf("customerreviews"),
  };
  if (Object.values(columns).some((index) => index < 0)) throw new Error("GOOGLE_SHEETS_HEADERS_INVALID");
  const importedRows = rows.slice(1, 1000).flatMap((row) => {
    const businessName = clean(row[columns.businessName], 200);
    if (!businessName) return [];
    const phone = clean(row[columns.phone], 50);
    return [{ businessName, phone, location: clean(row[columns.location], 200), services: clean(row[columns.services], 1000), reviews: clean(row[columns.reviews], 1000), fingerprint: fingerprint(businessName, phone) }];
  });
  return [...new Map(importedRows.map((row) => [row.fingerprint, row])).values()];
}

export async function POST(request: Request) {
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin) return NextResponse.json({ error: "INVALID_ORIGIN" }, { status: 403 });
  const owner = await googleSheetsOwner();
  if (!owner) return NextResponse.json({ error: "ADMIN_ACCESS_REQUIRED" }, { status: 403 });
  const config = googleSheetsConfig();
  if (!config) return NextResponse.json({ error: "GOOGLE_SHEETS_NOT_CONFIGURED" }, { status: 503 });

  try {
    const connection = await googleSheetsConnection(owner.userId);
    if (!connection) return NextResponse.json({ error: "GOOGLE_SHEETS_NOT_CONNECTED" }, { status: 409 });
    const accessToken = await googleSheetsAccessToken(owner.userId, connection, config);
    const sheetRows = await getRows(connection, accessToken);
    const auth = await createClient();
    const { data: admin } = await auth.from("admin_users").select("email").eq("user_id", owner.userId).maybeSingle();
    const db = portalService();

    const fingerprints = [...new Set(sheetRows.map((row) => row.fingerprint))];
    const [importsResult, leadsResult, clientsResult] = await Promise.all([
      fingerprints.length ? db.from("google_sheets_outreach_imports").select("source_fingerprint").eq("spreadsheet_id", connection.spreadsheet_id).in("source_fingerprint", fingerprints) : Promise.resolve({ data: [], error: null }),
      db.from("leads").select("id,business_name,phone").limit(5000),
      db.from("clients").select("id,business_name,phone").eq("archived", false).limit(5000),
    ]);
    if (importsResult.error || leadsResult.error || clientsResult.error) return NextResponse.json({ error: "GOOGLE_SHEETS_DEDUP_CHECK_FAILED" }, { status: 503 });
    const importedFingerprints = new Set((importsResult.data || []).map((row) => row.source_fingerprint));
    const leadNames = new Set((leadsResult.data || []).map((row) => normaliseName(row.business_name || "")).filter(Boolean));
    const leadPhones = new Set((leadsResult.data || []).map((row) => normalisePhone(row.phone || "")).filter(Boolean));
    const clientNames = new Set((clientsResult.data || []).map((row) => normaliseName(row.business_name || "")).filter(Boolean));
    const clientPhones = new Set((clientsResult.data || []).map((row) => normalisePhone(row.phone || "")).filter(Boolean));

    const unseen = sheetRows.filter((row) => !importedFingerprints.has(row.fingerprint));
    const matchedExisting = unseen.filter((row) => leadNames.has(normaliseName(row.businessName)) || clientNames.has(normaliseName(row.businessName)) || (normalisePhone(row.phone) && (leadPhones.has(normalisePhone(row.phone)) || clientPhones.has(normalisePhone(row.phone)))));
    const toImport = unseen.filter((row) => !matchedExisting.includes(row));
    const now = new Date().toISOString();
    const newLeads = toImport.map((row) => ({
      id: crypto.randomUUID(), business_name: row.businessName, name: row.businessName, email: "", phone: row.phone,
      help_needed: "Prospect imported from the HBS outreach spreadsheet.", website_url: null, has_website: false,
      industry: null, main_location: row.location, source: "Google Sheets: Leads For Outreach",
      notes: [`Services listed: ${row.services || "Not provided"}`, `Customer reviews listed: ${row.reviews || "Not provided"}`].join("\n"),
      status: "New", probability: 10, next_action: "Review prospect and decide whether to contact", assigned_to: admin?.email || "",
      updated_at: now,
    }));
    if (newLeads.length) {
      const inserted = await auth.from("leads").insert(newLeads).select("id,business_name");
      if (inserted.error) return NextResponse.json({ error: "GOOGLE_SHEETS_LEAD_IMPORT_FAILED" }, { status: 500 });
      const importRows = [
        ...toImport.map((row, index) => ({ spreadsheet_id: connection.spreadsheet_id, sheet_name: connection.sheet_name, source_fingerprint: row.fingerprint, business_name: row.businessName, lead_id: newLeads[index].id, disposition: "imported", synced_at: now })),
        ...matchedExisting.map((row) => ({ spreadsheet_id: connection.spreadsheet_id, sheet_name: connection.sheet_name, source_fingerprint: row.fingerprint, business_name: row.businessName, lead_id: null, disposition: "already_in_crm", synced_at: now })),
      ];
      const importedLog = await db.from("google_sheets_outreach_imports").upsert(importRows, { onConflict: "spreadsheet_id,source_fingerprint", ignoreDuplicates: true });
      if (importedLog.error) return NextResponse.json({ error: "GOOGLE_SHEETS_IMPORT_LOG_FAILED" }, { status: 503 });
      const activities = newLeads.map((lead) => ({ entity_type: "lead", entity_id: lead.id, action: "lead_created", detail: `Imported ${lead.business_name} from the Leads For Outreach spreadsheet`, created_by: owner.userId }));
      if (activities.length) await auth.from("crm_activities").insert(activities);
    } else if (matchedExisting.length) {
      const importRows = matchedExisting.map((row) => ({ spreadsheet_id: connection.spreadsheet_id, sheet_name: connection.sheet_name, source_fingerprint: row.fingerprint, business_name: row.businessName, lead_id: null, disposition: "already_in_crm", synced_at: now }));
      const importedLog = await db.from("google_sheets_outreach_imports").upsert(importRows, { onConflict: "spreadsheet_id,source_fingerprint", ignoreDuplicates: true });
      if (importedLog.error) return NextResponse.json({ error: "GOOGLE_SHEETS_IMPORT_LOG_FAILED" }, { status: 503 });
    }

    const syncUpdate = await db.from("google_sheets_connections").update({ last_synced_at: now, updated_at: now }).eq("user_id", owner.userId);
    if (syncUpdate.error) return NextResponse.json({ error: "GOOGLE_SHEETS_SYNC_STATUS_FAILED" }, { status: 503 });
    return NextResponse.json({ imported: toImport.length, alreadyInCrm: matchedExisting.length, alreadySynced: sheetRows.length - unseen.length, totalRows: sheetRows.length, lastSyncedAt: now });
  } catch (error) {
    const code = error instanceof Error ? error.message : "GOOGLE_SHEETS_SYNC_FAILED";
    const mapped = code === "GOOGLE_SHEETS_HEADERS_INVALID" ? "GOOGLE_SHEETS_HEADERS_INVALID"
      : code.includes("_403_accessNotConfigured") ? "GOOGLE_SHEETS_API_DISABLED"
      : code.includes("_403_insufficientPermissions") || code.includes("_403_forbidden") || code.includes("_403_appNotAuthorizedToFile") ? "GOOGLE_SHEETS_FILE_ACCESS_DENIED"
      : code.startsWith("GOOGLE_SHEETS_READ_403_") ? `GOOGLE_SHEETS_API_ERROR_${code.split("_").pop()?.toUpperCase() || "UNKNOWN"}`
      : code.startsWith("GOOGLE_SHEETS_READ_404") ? "GOOGLE_SHEETS_NOT_FOUND"
      : code.startsWith("GOOGLE_SHEETS_READ_") ? "GOOGLE_SHEETS_READ_FAILED"
      : "GOOGLE_SHEETS_SYNC_FAILED";
    return NextResponse.json({ error: mapped }, { status: 502 });
  }
}

