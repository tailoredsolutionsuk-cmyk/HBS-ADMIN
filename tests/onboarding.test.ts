import test from "node:test";
import assert from "node:assert/strict";
import { parseProject, parseBrief, projectId, revision, editableBrief, EMPTY_BRIEF } from "../lib/onboarding/model.ts";
test("project validation strips unexpected infrastructure properties", () => {
  const parsed = parseProject({ client_id: "utx", name: " New site ", service: "Website", target_date: "", role: "owner", repo: "admin" });
  assert.deepEqual(parsed, {client_id:"utx",name:"New site",service:"Website",target_date:null});
});
test("project fields reject malformed dates, objects, missing names and oversize text", () => {
  const good = {client_id:"utx",name:"Site",service:"Website",target_date:"2028-02-29"};
  assert.equal(parseProject(good).target_date,"2028-02-29");
  for (const date of ["2026-02-29","2026-13-01","tomorrow"]) assert.throws(() => parseProject({...good,target_date:date}));
  assert.throws(() => parseProject({...good,name:" "}));
  assert.throws(() => parseProject({...good,name:"x".repeat(161)}));
  assert.throws(() => parseProject({...good,client_id:{id:"utx"}}));
});
test("partial drafts save but submission requires the four core fields", () => {
  assert.deepEqual(parseBrief({}),EMPTY_BRIEF);
  assert.throws(() => parseBrief({},true));
  const brief = {...EMPTY_BRIEF,business:"Training",audience:"Families",goals:"Enquiries",pages:"Home, classes, contact"};
  assert.deepEqual(parseBrief({...brief,client_id:"other-client"},true),brief);
  assert.throws(() => parseBrief({...brief,brand:"x".repeat(4001)},true));
  assert.throws(() => parseBrief({...brief,goals:[]},true));
});
test("IDs and revisions are strict, only draft states permit client edits", () => {
  assert.equal(projectId("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"),"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa");
  for (const id of ["abc",123,"../../admin",null]) assert.throws(() => projectId(id));
  for (const value of [-1,0.5,"1",null,Infinity]) assert.throws(() => revision(value));
  assert.equal(revision(0),0);
  assert.equal(editableBrief("collecting"),true);
  assert.equal(editableBrief("changes_requested"),true);
  assert.equal(editableBrief("submitted"),false);
  assert.equal(editableBrief("approved"),false);
});

