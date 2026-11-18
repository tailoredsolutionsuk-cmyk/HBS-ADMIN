import { createCipheriv, createDecipheriv, hkdfSync, randomBytes, timingSafeEqual } from "node:crypto";

export const googleCalendarScope = "https://www.googleapis.com/auth/calendar.events.readonly";
export const googleCalendarScopes = `openid email ${googleCalendarScope}`;
const context = "hbs-google-calendar-v1";

export function calendarKey(hex: string) {
  if (!/^[a-f0-9]{64}$/i.test(hex)) throw new Error("GOOGLE_CALENDAR_KEY_INVALID");
  return Buffer.from(hkdfSync("sha256", Buffer.from(hex, "hex"), Buffer.alloc(0), context, 32));
}

export function sealCalendarValue(value: string, key: Buffer) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  cipher.setAAD(Buffer.from(context));
  const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  return `${iv.toString("base64url")}.${cipher.getAuthTag().toString("base64url")}.${encrypted.toString("base64url")}`;
}

export function openCalendarValue(value: string, key: Buffer) {
  const parts = value.split(".");
  if (parts.length !== 3) throw new Error("GOOGLE_CALENDAR_TOKEN_INVALID");
  const [iv, tag, encrypted] = parts.map((part) => Buffer.from(part, "base64url"));
  if (iv.length !== 12 || tag.length !== 16) throw new Error("GOOGLE_CALENDAR_TOKEN_INVALID");
  const decipher = createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAAD(Buffer.from(context));
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString("utf8");
}

export function sameState(actual: string | null, expected: string) {
  if (!actual || !expected) return false;
  const a = Buffer.from(actual);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

export function calendarAccountMatches(profile: { email?: string; email_verified?: boolean }, expected: string) {
  return profile.email_verified === true && profile.email?.trim().toLowerCase() === expected.trim().toLowerCase();
}

export function calendarRange(start: string | null, end: string | null) {
  const isDate = (value: string | null): value is string => Boolean(value && /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value);
  if (!isDate(start) || !isDate(end)) return null;
  const duration = Date.parse(end) - Date.parse(start);
  if (duration <= 0 || duration > 45 * 86400000) return null;
  // UTC padding includes the entire displayed UK day across GMT/BST boundaries.
  return { timeMin: new Date(Date.parse(start) - 86400000).toISOString(), timeMax: new Date(Date.parse(end) + 86400000).toISOString(), start, end };
}

export { calendarEvent } from "./calendar-events.ts";
export type { GoogleEvent, CalendarEvent } from "./calendar-events.ts";

