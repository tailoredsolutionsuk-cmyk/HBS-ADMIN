import assert from "node:assert/strict";
import test from "node:test";
import { analyticsBrowser, analyticsDevice, analyticsOrigin, analyticsPath, analyticsReferrer } from "../lib/analytics/public.ts";

test("analytics origins require a clean HTTPS origin", () => {
  assert.deepEqual(analyticsOrigin("https://www.example.com"), { origin: "https://www.example.com", hostname: "www.example.com", domain: "example.com" });
  assert.equal(analyticsOrigin("http://example.com"), null);
  assert.equal(analyticsOrigin("https://user:pass@example.com"), null);
});

test("analytics paths discard query strings and reject oversized values", () => {
  assert.equal(analyticsPath("/classes?email=private@example.com"), "/classes");
  assert.equal(analyticsPath("https://example.com/programs#junior"), "/programs");
  assert.equal(analyticsPath("/" + "x".repeat(501)), null);
});

test("analytics referrers retain only a hostname", () => {
  assert.equal(analyticsReferrer("https://google.com/search?q=utx", "utx.example"), "google.com");
  assert.equal(analyticsReferrer("https://www.utx.example/classes", "utx.example"), "Internal");
});

test("analytics classifies common devices and browsers", () => {
  assert.equal(analyticsDevice("Mozilla/5.0 (iPhone) Mobile Safari"), "Mobile");
  assert.equal(analyticsBrowser("Mozilla/5.0 Chrome/124 Safari/537.36"), "Chrome");
  assert.equal(analyticsBrowser("Mozilla/5.0 Version/17.4 Safari/605.1.15"), "Safari");
});
