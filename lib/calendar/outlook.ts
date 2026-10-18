import "server-only";
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { createClient } from "../supabase/server";
import { portalService } from "../portal/server";

export const outlookScopes = "offline_access User.Read Calendars.Read";
const authority = "https://login.microsoftonline.com/common/oauth2/v2.0";

export function outlookConfig() {
  const clientId = process.env.OUTLOOK_CLIENT_ID;
  const clientSecret = process.env.OUTLOOK_CLIENT_SECRET;
  const redirectUri = process.env.OUTLOOK_REDIRECT_URI;
  const key = process.env.OUTLOOK_TOKEN_ENCRYPTION_KEY;
  if (!clientId || !clientSecret || !redirectUri || !key || !/^[a-f0-9]{64}$/i.test(key)) return null;
  let url: URL;
  try { url = new URL(redirectUri); } catch { return null; }
  if (url.pathname !== "/api/admin/calendar/callback" || (url.protocol !== "https:" && url.hostname !== "localhost")) return null;
  return { clientId, clientSecret, redirectUri, key: Buffer.from(key, "hex") };
}

export async function calendarOwner() {
  const auth = await createClient();
  const { data } = await auth.auth.getClaims();
  if (!data?.claims?.sub) return null;
  const { data: admin } = await auth.from("admin_users").select("role").eq("user_id", data.claims.sub).maybeSingle();
  return admin?.role === "owner" ? data.claims.sub : null;
}

export function encryptToken(value: string, key: Buffer) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  return `${iv.toString("base64url")}.${cipher.getAuthTag().toString("base64url")}.${encrypted.toString("base64url")}`;
}

export function decryptToken(value: string, key: Buffer) {
  const [iv, tag, encrypted] = value.split(".");
  if (!iv || !tag || !encrypted) throw new Error("OUTLOOK_TOKEN_INVALID");
  const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(iv, "base64url"));
  decipher.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([decipher.update(Buffer.from(encrypted, "base64url")), decipher.final()]).toString("utf8");
}

export type OutlookTokens = { access_token: string; refresh_token?: string; expires_in: number };

export async function exchangeOutlookToken(config: NonNullable<ReturnType<typeof outlookConfig>>, fields: Record<string, string>): Promise<OutlookTokens> {
  const response = await fetch(`${authority}/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: config.clientId, client_secret: config.clientSecret, ...fields }),
    cache: "no-store",
  });
  if (!response.ok) throw new Error(`OUTLOOK_TOKEN_${response.status}`);
  const tokens = await response.json() as OutlookTokens;
  if (!tokens.access_token || !tokens.expires_in) throw new Error("OUTLOOK_TOKEN_INVALID");
  return tokens;
}

type Connection = { user_id: string; email: string; access_token: string; refresh_token: string; expires_at: string };

export async function outlookConnection(userId: string): Promise<Connection | null> {
  const { data, error } = await portalService().from("outlook_calendar_connections")
    .select("user_id,email,access_token,refresh_token,expires_at").eq("user_id", userId).maybeSingle();
  if (error) throw new Error("OUTLOOK_STORAGE_UNAVAILABLE");
  return data as Connection | null;
}

export async function outlookAccessToken(userId: string, connection: Connection, config: NonNullable<ReturnType<typeof outlookConfig>>) {
  if (new Date(connection.expires_at).valueOf() > Date.now() + 120_000) return decryptToken(connection.access_token, config.key);
  const tokens = await exchangeOutlookToken(config, {
    grant_type: "refresh_token",
    refresh_token: decryptToken(connection.refresh_token, config.key),
    scope: outlookScopes,
  });
  const update = await portalService().from("outlook_calendar_connections").update({
    access_token: encryptToken(tokens.access_token, config.key),
    refresh_token: encryptToken(tokens.refresh_token || decryptToken(connection.refresh_token, config.key), config.key),
    expires_at: new Date(Date.now() + tokens.expires_in * 1000).toISOString(),
    updated_at: new Date().toISOString(),
  }).eq("user_id", userId).eq("refresh_token", connection.refresh_token);
  if (update.error) throw new Error("OUTLOOK_STORAGE_UNAVAILABLE");
  return tokens.access_token;
}
