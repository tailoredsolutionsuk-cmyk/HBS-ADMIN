import "server-only";
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { createClient } from "../supabase/server";
import { portalService } from "../portal/server";

export const outreachSpreadsheetId = "19aUammc33fC8cCdPZOFd95rot-NwnxOL0wW38zdfMs4";
export const outreachSheetName = "Sheet1";
export const outreachScopes = "openid email https://www.googleapis.com/auth/spreadsheets.readonly";

export function googleSheetsConfig() {
  const clientId = process.env.GOOGLE_SHEETS_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_SHEETS_CLIENT_SECRET;
  const redirectUri = process.env.GOOGLE_SHEETS_REDIRECT_URI;
  const rawKey = process.env.GOOGLE_SHEETS_TOKEN_ENCRYPTION_KEY;
  if (!clientId || !clientSecret || !redirectUri || !rawKey || !/^[a-f0-9]{64}$/i.test(rawKey)) return null;
  let redirect: URL;
  try { redirect = new URL(redirectUri); } catch { return null; }
  if (redirect.pathname !== "/api/admin/google-sheets/callback" || (redirect.protocol !== "https:" && redirect.hostname !== "localhost")) return null;
  return { clientId, clientSecret, redirectUri, key: Buffer.from(rawKey, "hex") };
}

export async function googleSheetsOwner() {
  const auth = await createClient();
  const { data } = await auth.auth.getClaims();
  const userId = data?.claims?.sub;
  if (!userId) return null;
  const { data: admin } = await auth.from("admin_users").select("role,email").eq("user_id", userId).maybeSingle();
  return admin && ["owner", "admin"].includes(admin.role) ? { userId, email: admin.email || "" } : null;
}

export function encryptGoogleToken(value: string, key: Buffer) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  return `${iv.toString("base64url")}.${cipher.getAuthTag().toString("base64url")}.${encrypted.toString("base64url")}`;
}

function decryptGoogleToken(value: string, key: Buffer) {
  const [iv, tag, encrypted] = value.split(".");
  if (!iv || !tag || !encrypted) throw new Error("GOOGLE_SHEETS_TOKEN_INVALID");
  const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(iv, "base64url"));
  decipher.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([decipher.update(Buffer.from(encrypted, "base64url")), decipher.final()]).toString("utf8");
}

type GoogleTokens = { access_token: string; refresh_token?: string; expires_in: number };
export async function exchangeGoogleToken(config: NonNullable<ReturnType<typeof googleSheetsConfig>>, fields: Record<string, string>): Promise<GoogleTokens> {
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: config.clientId, client_secret: config.clientSecret, ...fields }), cache: "no-store",
  });
  if (!response.ok) throw new Error(`GOOGLE_SHEETS_TOKEN_${response.status}`);
  const tokens = await response.json() as GoogleTokens;
  if (!tokens.access_token || !tokens.expires_in) throw new Error("GOOGLE_SHEETS_TOKEN_INVALID");
  return tokens;
}

export type GoogleSheetsConnection = { user_id: string; email: string; access_token: string; refresh_token: string; expires_at: string; spreadsheet_id: string; sheet_name: string; last_synced_at: string | null };
export async function googleSheetsConnection(userId: string): Promise<GoogleSheetsConnection | null> {
  const { data, error } = await portalService().from("google_sheets_connections")
    .select("user_id,email,access_token,refresh_token,expires_at,spreadsheet_id,sheet_name,last_synced_at").eq("user_id", userId).maybeSingle();
  if (error) throw new Error("GOOGLE_SHEETS_STORAGE_UNAVAILABLE");
  return data as GoogleSheetsConnection | null;
}

export async function googleSheetsAccessToken(userId: string, connection: GoogleSheetsConnection, config: NonNullable<ReturnType<typeof googleSheetsConfig>>) {
  if (new Date(connection.expires_at).valueOf() > Date.now() + 120_000) return decryptGoogleToken(connection.access_token, config.key);
  const currentRefreshToken = decryptGoogleToken(connection.refresh_token, config.key);
  const tokens = await exchangeGoogleToken(config, { grant_type: "refresh_token", refresh_token: currentRefreshToken });
  const update = await portalService().from("google_sheets_connections").update({
    access_token: encryptGoogleToken(tokens.access_token, config.key),
    refresh_token: encryptGoogleToken(tokens.refresh_token || currentRefreshToken, config.key),
    expires_at: new Date(Date.now() + tokens.expires_in * 1000).toISOString(), updated_at: new Date().toISOString(),
  }).eq("user_id", userId).eq("refresh_token", connection.refresh_token);
  if (update.error) throw new Error("GOOGLE_SHEETS_STORAGE_UNAVAILABLE");
  return tokens.access_token;
}
