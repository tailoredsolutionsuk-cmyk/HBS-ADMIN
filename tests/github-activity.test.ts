import test from "node:test";
import assert from "node:assert/strict";
import { githubPush, validGithubSignature } from "../lib/activity/github.ts";
import { createHmac } from "node:crypto";

test("validates GitHub webhook signatures with a constant-time comparison", () => {
  const body = '{"zen":"safe"}';
  const secret = "a".repeat(32);
  const signature = `sha256=${createHmac("sha256", secret).update(body).digest("hex")}`;
  assert.equal(validGithubSignature(body, signature, secret), true);
  assert.equal(validGithubSignature(body, `${signature}0`, secret), false);
});

test("normalises a GitHub push without accepting conversation content", () => {
  const push = githubPush({ after: "a".repeat(40), repository: { full_name: "TailoredSolutionsUK-CMYK/UTX" }, head_commit: { message: "Update client metrics\nlong body", url: "https://github.com/example/commit/a", timestamp: "2026-09-30T18:00:00Z" }, sender: { login: "harley" }, prompt: "must not be stored" });
  assert.equal(push.fullName, "tailoredsolutionsuk-cmyk/utx");
  assert.equal(push.summary, "Update client metrics");
  assert.equal("prompt" in push, false);
});

test("rejects incomplete or unsafe push payloads", () => {
  assert.throws(() => githubPush({}));
  assert.throws(() => githubPush({ after: "x", repository: { full_name: "owner/repo" }, head_commit: { message: "change" } }));
});
