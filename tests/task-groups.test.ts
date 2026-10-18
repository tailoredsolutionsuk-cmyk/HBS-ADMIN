import assert from "node:assert/strict";
import test from "node:test";
import { groupTasksByClient } from "../lib/crm/task-groups.ts";

const clients = [
  { id: "auto-tek", business_name: "Auto-Tek" },
  { id: "utx", business_name: "UTX" },
];
const tasks = [{ client_id: "auto-tek", title: "Update website" }, { client_id: null, title: "Internal review" }];

test("every client has a task group even with no existing tasks", () => {
  const groups = groupTasksByClient(clients, tasks, "all", "");
  assert.deepEqual(groups.map(({ id }) => id), ["auto-tek", "utx", "internal"]);
  assert.deepEqual(groups.find(({ id }) => id === "utx")?.tasks, []);
});

test("client and search filters retain the right client headings", () => {
  assert.deepEqual(groupTasksByClient(clients, [], "utx", "").map(({ id }) => id), ["utx"]);
  assert.deepEqual(groupTasksByClient(clients, [], "all", "UTX").map(({ id }) => id), ["utx"]);
  assert.deepEqual(groupTasksByClient(clients, [tasks[0]], "all", "website").map(({ id }) => id), ["auto-tek"]);
});

test("tasks for archived clients remain visible with internal work", () => {
  const groups = groupTasksByClient(clients, [{ client_id: "archived", title: "Review" }], "all", "");
  assert.equal(groups.at(-1)?.id, "internal");
  assert.equal(groups.at(-1)?.tasks.length, 1);
});
