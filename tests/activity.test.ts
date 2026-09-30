import test from "node:test";
import assert from "node:assert/strict";
import { parseActivityInput } from "../lib/activity/model.ts";

test("accepts bounded, privacy-safe project activity", () => {
  const activity = parseActivityInput({ source: "github", externalId: "push:123", projectName: "UTX", clientId: "utx", action: "commit", summary: "Updated portal analytics", url: "https://github.com/example/repo/commit/1234567", commitSha: "1234567", metadata: { branch: "main", count: 2 } });
  assert.equal(activity.clientId, "utx");
  assert.equal(activity.metadata.branch, "main");
});

test("rejects secrets, unsafe URLs and malformed required fields", () => {
  assert.throws(() => parseActivityInput({ source: "github" }));
  assert.throws(() => parseActivityInput({ source: "github", externalId: "1", projectName: "UTX", action: "commit", summary: "Change", url: "http://example.com" }));
  assert.throws(() => parseActivityInput({ source: "unknown", externalId: "1", projectName: "UTX", action: "commit", summary: "Change" }));
});

test("drops nested metadata instead of accepting arbitrary conversation payloads", () => {
  const activity = parseActivityInput({ source: "codex", externalId: "turn:1", projectName: "HBS", action: "project_update", summary: "Completed safe change", metadata: { transcript: { private: true }, prompt: ["secret"], branch: "main" } });
  assert.deepEqual(activity.metadata, { branch: "main" });
});
