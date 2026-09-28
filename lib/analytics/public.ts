export function analyticsOrigin(value: string | null) {
  if (!value || value.length > 300) return null;
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || url.username || url.password || url.port) return null;
    return { origin: url.origin, hostname: url.hostname.toLowerCase(), domain: url.hostname.toLowerCase().replace(/^www\./, "") };
  } catch {
    return null;
  }
}

export function analyticsPath(value: unknown) {
  if (typeof value !== "string" || value.length > 500) return null;
  try {
    const url = new URL(value, "https://analytics.invalid");
    const path = url.pathname.replace(/\/{2,}/g, "/");
    return path.length <= 300 ? path : null;
  } catch {
    return null;
  }
}

export function analyticsReferrer(value: unknown, siteHostname: string) {
  if (typeof value !== "string" || !value || value.length > 1000) return null;
  try {
    const hostname = new URL(value).hostname.toLowerCase();
    return hostname === siteHostname || hostname.replace(/^www\./, "") === siteHostname.replace(/^www\./, "") ? "Internal" : hostname.slice(0, 200);
  } catch {
    return null;
  }
}

export function analyticsDevice(userAgent: string) {
  if (/tablet|ipad/i.test(userAgent)) return "Tablet";
  if (/mobile|iphone|android/i.test(userAgent)) return "Mobile";
  return "Desktop";
}

export function analyticsBrowser(userAgent: string) {
  if (/edg\//i.test(userAgent)) return "Edge";
  if (/opr\//i.test(userAgent)) return "Opera";
  if (/chrome|crios/i.test(userAgent)) return "Chrome";
  if (/firefox|fxios/i.test(userAgent)) return "Firefox";
  if (/safari/i.test(userAgent)) return "Safari";
  return "Other";
}
