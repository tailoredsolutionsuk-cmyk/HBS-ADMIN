import test from "node:test";
import assert from "node:assert/strict";
import { normalisePortalEmail, safePortalNext, safePortalUrl } from "../lib/portal/validation.ts";

test("normalises client emails and rejects malformed values", () => {
  assert.equal(normalisePortalEmail(" Client@Example.COM "), "client@example.com");
  for (const value of ["", "not-an-email", "a@b", "<x>@example.com", "a ".repeat(200) + "@example.com"]) assert.equal(normalisePortalEmail(value), null);
});

test("allows only internal redirect paths", () => {
  assert.equal(safePortalNext("/portal"), "/portal");
  for (const value of ["https://evil.test", "//evil.test", "/\\evil", ""]) assert.equal(safePortalNext(value), "/portal");
});

test("allows only HTTPS website links", () => {
  assert.equal(safePortalUrl("https://example.com/path"), "https://example.com/path");
  assert.equal(safePortalUrl("javascript:alert(1)"), null);
  assert.equal(safePortalUrl("http://example.com"), null);
});
