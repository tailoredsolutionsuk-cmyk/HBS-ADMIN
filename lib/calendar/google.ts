import "server-only";
import { createClient } from "../supabase/server";
import { portalService } from "../portal/server";
import { calendarKey, openCalendarValue, sealCalendarValue } from "./google-core";

export function googleCalendarConfig() {
  // Reuse the existing Google OAuth app, but keep calendar tokens in separate storage.
  const explicitClient = Boolean(process.env.GOOGLE_CALENDAR_CLIENT_ID || process.env.GOOGLE_CALENDAR_CLIENT_SECRET);
  const clientId = explicitClient ? process.env.GOOGLE_CALENDAR_CLIENT_ID : process.env.GOOGLE_SHEETS_CLIENT_ID;
  const clientSecret = explicitClient ? process.env.GOOGLE_CALENDAR_CLIENT_SECRET : process.env.GOOGLE_SHEETS_CLIENT_SECRET;
  const redirectUri = process.env.GOOGLE_CALENDAR_REDIRECT_URI || "https://www.hbsmarketing.online/api/admin/calendar/google/callback";
  const rawKey = process.env.GOOGLE_CALENDAR_TOKEN_ENCRYPTION_KEY || process.env.GOOGLE_SHEETS_TOKEN_ENCRYPTION_KEY;
  const accountEmail = (process.env.GOOGLE_CALENDAR_ACCOUNT_EMAIL || "tailoredsolutionsuk@gmail.com").trim().toLowerCase();
  if (!clientId || !clientSecret || !rawKey || !/^[a-f0-9]{64}$/i.test(rawKey)) return null;
  try {
    const url = new URL(redirectUri);
    if (url.pathname !== "/api/admin/calendar/google/callback" || url.search || url.hash || url.username || url.password || (url.protocol !== "https:" && !(url.protocol === "http:" && url.hostname === "localhost"))) return null;
    return { clientId, clientSecret, redirectUri, accountEmail, key: calendarKey(rawKey) };
  } catch { return null; }
}

export async function googleCalendarOwner() {
  const auth = await createClient();
  const { data } = await auth.auth.getClaims();
  const userId = data?.claims?.sub;
  if (!userId) return null;
  const { data: admin } = await auth.from("admin_users").select("role").eq("user_id", userId).maybeSingle();
  return admin?.role === "owner" ? userId : null;
}

export type CalendarConfig = NonNullable<ReturnType<typeof googleCalendarConfig>>;
export type CalendarTokens = { access_token: string; refresh_token?: string; expires_in: number; scope?: string };
export type CalendarConnection = { user_id: string; email: string; access_token: string; refresh_token: string; expires_at: string };

export async function exchangeCalendarToken(config: CalendarConfig, fields: Record<string, string>): Promise<CalendarTokens> {
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: config.clientId, client_secret: config.clientSecret, ...fields }),
    cache: "no-store", signal: AbortSignal.timeout(15000),
  });
  if (!response.ok) throw new Error(`GOOGLE_CALENDAR_TOKEN_${response.status}`);
  const tokens = await response.json() as CalendarTokens;
  if (!tokens.access_token || !Number.isFinite(tokens.expires_in) || tokens.expires_in <= 0) throw new Error("GOOGLE_CALENDAR_TOKEN_INVALID");
  return tokens;
}

export async function googleCalendarConnection(userId: string): Promise<CalendarConnection | null> {
  const { data, error } = await portalService().from("google_calendar_connections").select("user_id,email,access_token,refresh_token,expires_at").eq("user_id", userId).maybeSingle();
  if (error) throw new Error("GOOGLE_CALENDAR_STORAGE_UNAVAILABLE");
  return data as CalendarConnection | null;
}

export async function calendarAccessToken(connection: CalendarConnection, config: CalendarConfig) {
  if (Date.parse(connection.expires_at) > Date.now() + 120000) return openCalendarValue(connection.access_token, config.key);
  const refresh = openCalendarValue(connection.refresh_token, config.key);
  const tokens = await exchangeCalendarToken(config, { grant_type: "refresh_token", refresh_token: refresh });
  const { data, error } = await portalService().from("google_calendar_connections").update({
    access_token: sealCalendarValue(tokens.access_token, config.key), refresh_token: sealCalendarValue(tokens.refresh_token || refresh, config.key),
    expires_at: new Date(Date.now() + tokens.expires_in * 1000).toISOString(), updated_at: new Date().toISOString(),
  }).eq("user_id", connection.user_id).eq("refresh_token", connection.refresh_token).select("user_id");
  if (error) throw new Error("GOOGLE_CALENDAR_STORAGE_UNAVAILABLE");
  if (!data?.length) throw new Error("GOOGLE_CALENDAR_CONNECTION_CHANGED");
  return tokens.access_token;
}
