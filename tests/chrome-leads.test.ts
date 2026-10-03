import assert from "node:assert/strict";
import { test } from "node:test";
import { guessColumns, importedBusiness, isBlockedSource, normaliseWebsiteResults, parseLeadCsv } from "../lib/leads/chrome-import.ts";

test("Chrome CSV parsing handles BOM, commas, quotes and line breaks", () => {
  const table = parseLeadCsv('\uFEFFBusiness name,Website,Phone\r\n"A, B Plumbing",abplumbing.co.uk,01234\r\n"North ""Star""",northstar.co.uk,05678');
  assert.deepEqual(table.headers, ["Business name", "Website", "Phone"]);
  assert.equal(table.rows[0][0], "A, B Plumbing");
  assert.equal(table.rows[1][0], 'North "Star"');
  assert.deepEqual(guessColumns(table.headers), { name: 0, website: 1, email: -1, phone: 2, location: -1, sector: -1 });
});

test("Chrome import preserves source and refuses Maps as a website", () => {
  const columns = { name: 0, website: 1, email: 2, phone: 3, location: 4, sector: 5 };
  const business = importedBusiness(["Acme", "https://maps.google.com/place/acme", "info@acme.co.uk", "0113", "Leeds", "Plumber"], columns, "https://directory.example/leeds");
  assert.equal(business.website, "");
  assert.equal(business.sourceUrl, "https://directory.example/leeds");
  assert.equal(isBlockedSource("https://google.co.uk/maps/place/acme"), true);
  assert.equal(isBlockedSource("https://maps.google.de/place/acme"), true);
  assert.equal(isBlockedSource("https://maps.app.goo.gl/example"), true);
  assert.equal(isBlockedSource("https://directory.example/leeds"), false);
});

test("Chrome import rejects oversized and malformed CSV files", () => {
  assert.throws(() => parseLeadCsv("name\n" + "Acme\n".repeat(501)), /CSV_TOO_MANY_ROWS/);
  assert.throws(() => parseLeadCsv('name\n"unfinished'), /CSV_INVALID/);
  assert.throws(() => parseLeadCsv("name\n"), /CSV_INVALID/);
});

test("SerpApi research keeps distinct business websites and drops directories", () => {
  const results = normaliseWebsiteResults([
    { title: "Acme Plumbers", link: "https://www.acme.co.uk/services", snippet: "Local plumbing" },
    { title: "Duplicate", link: "https://acme.co.uk/contact" },
    { title: "Directory", link: "https://www.yell.com/listing" },
    { title: "Second business", link: "https://second.co.uk" },
  ]);
  assert.equal(results.length, 2);
  assert.equal(results[0].website, "https://www.acme.co.uk/services");
  assert.equal(results[1].website, "https://second.co.uk");
});
