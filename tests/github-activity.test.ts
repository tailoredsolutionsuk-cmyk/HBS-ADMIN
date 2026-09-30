import test from "node:test";
import assert from "node:assert/strict";
import { githubFallbackSummary, githubPush, validGithubSignature } from "../lib/activity/github.ts";
import { githubSummaryInput } from "../lib/activity/github-summary.ts";
import { createHmac } from "node:crypto";

test("validates GitHub webhook signatures with a constant-time comparison", () => {
  const body = '{"zen":"safe"}';
  const secret = "a".repeat(32);
  const signature = `sha256=${createHmac("sha256", secret).update(body).digest("hex")}`;
  assert.equal(validGithubSignature(body, signature, secret), true);
  assert.equal(validGithubSignature(body, `${signature}0`, secret), false);
});

test("normalises a GitHub push without accepting conversation or source content", () => {
  const push = githubPush({ after: "a".repeat(40), ref: "refs/heads/main", repository: { full_name: "TailoredSolutionsUK-CMYK/UTX" }, head_commit: { message: "Update client metrics\nlong body", url: "https://github.com/example/commit/a", timestamp: "2026-09-30T18:00:00Z" }, commits: [{ message: "Update client metrics", added: ["app/metrics/page.tsx"], modified: ["app/portal/page.tsx"], removed: ["app/old.tsx"], patch: "private source" }], sender: { login: "harley" }, prompt: "must not be stored" });
  assert.equal(push.fullName, "tailoredsolutionsuk-cmyk/utx");
  assert.equal(push.summary, "Update client metrics");
  assert.equal(push.branch, "main");
  assert.equal(push.commitCount, 1);
  assert.deepEqual(push.files, [{ path: "app/metrics/page.tsx", status: "added" }, { path: "app/portal/page.tsx", status: "modified" }, { path: "app/old.tsx", status: "removed" }]);
  assert.equal(githubFallbackSummary(push), "Update client metrics. 1 commit changed 3 files (1 added, 1 modified, 1 removed).");
  assert.equal("prompt" in push, false);
  assert.equal(JSON.stringify(githubSummaryInput(push)).includes("private source"), false);
});

test("rejects incomplete or unsafe push payloads", () => {
  assert.throws(() => githubPush({}));
  assert.throws(() => githubPush({ after: "x", repository: { full_name: "owner/repo" }, head_commit: { message: "change" } }));
});
