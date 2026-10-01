import assert from "node:assert/strict";
import { test } from "node:test";
import { defaultProfile, isDuplicateProspect, normaliseProspect, parseProfile, publicWebsite, scoreProspect } from "../lib/leads/ideal-customer.ts";

test("profile accepts an editable UK targeting strategy", () => {
  assert.deepEqual(parseProfile({ sector: "Mobile mechanics", location: "Leeds", goal: "enquiries", websitePreference: "missing" }), { sector: "Mobile mechanics", location: "Leeds", goal: "enquiries", websitePreference: "missing" });
  assert.equal(parseProfile({ sector: "", location: "Leeds", goal: "enquiries", websitePreference: "any" }), null);
});

test("business links reject private or misleading URLs", () => {
  assert.equal(publicWebsite("example.co.uk/contact"), "https://example.co.uk/contact");
  assert.equal(publicWebsite("http://localhost/admin"), "");
  assert.equal(publicWebsite("https://user:password@example.co.uk"), "");
  assert.equal(publicWebsite("javascript:alert(1)"), "");
});

test("UK listing scores by known details and never claims website quality", () => {
  const profile = { ...defaultProfile, sector: "Plumber", location: "Leeds", websitePreference: "missing" as const };
  const prospect = normaliseProspect({ title: "Reliable Plumbing", categories: ["Plumber"], postal_address: { addressLocality: "Leeds", country: "GB" }, url: "https://facebook.com/reliableplumbing", contact: { telephone: "0113 000 0000" } }, profile, "Brave Place Search");
  assert.ok(prospect);
  assert.equal(prospect.website, "");
  assert.equal(prospect.score, 100);
  assert.ok(prospect.reasons.some((reason) => reason.includes("verify before outreach")));
  assert.ok(prospect.reasons.every((reason) => !reason.includes("outdated")));
  assert.equal(scoreProspect({ ...prospect, country: "US", location: "Boston", sector: "Restaurant" }, profile).score < prospect.score, true);
});

test("non-UK listings are excluded and existing CRM businesses are flagged", () => {
  assert.equal(normaliseProspect(null as unknown as object, defaultProfile, "Brave Place Search"), null);
  assert.equal(normaliseProspect({ title: "US Company", postal_address: { country: "US" } }, defaultProfile, "Brave Place Search"), null);
  const prospect = normaliseProspect({ title: "Acme Plumbing", url: "acmeplumbing.co.uk", postal_address: { addressLocality: "Leeds", country: "GB" } }, defaultProfile, "Brave Place Search");
  assert.ok(prospect);
  assert.equal(isDuplicateProspect(prospect, [{ business_name: "Another Name", website_url: "https://www.acmeplumbing.co.uk", main_location: "York" }], []), true);
  assert.equal(isDuplicateProspect(prospect, [], [{ business_name: "Acme Plumbing", domain: null, website: null }]), true);
  assert.equal(isDuplicateProspect(prospect, [], []), false);
});
