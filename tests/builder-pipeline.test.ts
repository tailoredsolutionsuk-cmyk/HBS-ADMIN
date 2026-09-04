import test from 'node:test';
import assert from 'node:assert/strict';
import { createDocument, EMPTY_BRIEF, websiteFiles } from '../lib/builder/model.ts';
import { allowedOrigin, connectedFiles, domainName, parseEnquiry } from '../lib/builder/public-model.ts';
import { formToken, verifyFormToken } from '../lib/builder/form-security.ts';
import { providers, resourceName } from '../lib/builder/providers.ts';
import { builderModel, generationInput } from '../lib/builder/ai.ts';

const id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', other='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const origin='https://example.vercel.app';
const draft=createDocument({...EMPTY_BRIEF,businessName:'Test business',niche:'Design',audience:'Local businesses',services:'Websites',email:'test@example.test'});
test('custom domains reject URLs, ports, paths, platform and HBS domains',()=>{
  assert.equal(domainName(' WWW.EXAMPLE.CO.UK '),'www.example.co.uk');
  for(const value of ['https://example.com','localhost','example.com/a','example.com:443','www.hbsmarketing.online','hbsmarketing.co.uk','a.hbsmarketing.co.uk','x.vercel.app','bad-.com','-bad.com','a..com'])assert.throws(()=>domainName(value));
});
test('public collection accepts only the live origin or verified exact custom domain',()=>{
  assert.equal(allowedOrigin(origin,origin,null,false),true);
  assert.equal(allowedOrigin('https://www.example.co.uk',origin,'www.example.co.uk',true),true);
  for(const value of [null,'null','https://preview.vercel.app','https://evil.example.co.uk','https://example.vercel.app.evil.test','http://example.vercel.app',origin+'/path'])assert.equal(allowedOrigin(value,origin,null,false),false);
  assert.equal(allowedOrigin('https://www.example.co.uk',origin,'www.example.co.uk',false),false);
  assert.equal(allowedOrigin(origin,null,null,false),false);
});
test('enquiries require consent and bounded valid fields',()=>{
  const data={name:' Jane ',email:'jane@example.test',phone:'',message:'Please help',consent:true,submissionId:id};
  assert.equal(parseEnquiry(data).name,'Jane');
  for(const extra of [{consent:false},{email:'bad'},{name:''},{message:'x'.repeat(2001)},{submissionId:'-'.repeat(36)}])assert.throws(()=>parseEnquiry({...data,...extra}));
});
test('signed form tokens reject tampering, cross-site replay and expired or too-fast submissions',()=>{
  process.env.BUILDER_FORM_SECRET='test-only-secret-not-for-production-123456';
  const token=formToken(id,origin,10000);
  assert.doesNotThrow(()=>verifyFormToken(token,id,origin,13000));
  assert.throws(()=>verifyFormToken(token,other,origin,13000));
  assert.throws(()=>verifyFormToken(token,id,'https://other.test',13000));
  assert.throws(()=>verifyFormToken(token,id,origin,11000));
  assert.throws(()=>verifyFormToken(token,id,origin,4000000));
  assert.throws(()=>verifyFormToken(token+'bad',id,origin,13000));
  assert.throws(()=>verifyFormToken(token+'.extra',id,origin,13000));
  delete process.env.BUILDER_FORM_SECRET;
  assert.throws(()=>formToken(id,origin));
});
test('published files include controlled runtime, accessible form and no credentials',()=>{
  const files=connectedFiles(websiteFiles(draft),id,'https://www.hbsmarketing.online');
  assert.equal(files.length,7);
  assert.match(files.find(f=>f.file==='contact.html')!.data,/<form id="enquiry">/);
  assert.match(files.find(f=>f.file==='contact.html')!.data,/name="consent" type="checkbox" required/);
  const runtime=files.find(f=>f.file==='hbs-runtime.js')!.data;
  assert.doesNotThrow(()=>new Function(runtime),'generated runtime must parse');
  assert.match(runtime,/credentials:"omit"/);
  assert.match(runtime,/doNotTrack/);
  assert.doesNotMatch(JSON.stringify(files),/SUPABASE_SERVICE_ROLE_KEY|GITHUB_TOKEN|BUILDER_FORM_SECRET|document.cookie|localStorage/);
  assert.throws(()=>connectedFiles(websiteFiles(draft),id,'http://insecure.test'));
});
test('builder uses the requested mini model without reading CRM assistant config',()=>{
  process.env.AI_MODEL='openai/gpt-5.6-sol';delete process.env.BUILDER_AI_MODEL;
  assert.equal(builderModel(),'openai/gpt-5.4-mini');
  assert.equal(process.env.AI_MODEL,'openai/gpt-5.6-sol');
  process.env.BUILDER_AI_MODEL='other/model';assert.throws(()=>builderModel());delete process.env.BUILDER_AI_MODEL;
  const withUpload={...draft,assets:[{id:'public-image-id',name:'private-filename',mime:'image/png' as const,data:'SECRET-UPLOAD-BYTES'}]};
  const input=generationInput(withUpload,'Improve the heading');
  assert.match(input,/public-image-id/);assert.doesNotMatch(input,/SECRET-UPLOAD-BYTES|private-filename/);
});
test('promotion rechecks project, site, revision, commit and readiness; never rebuilds',async()=>{
  Object.assign(process.env,{GITHUB_TOKEN:'test',GITHUB_OWNER:'example',GITHUB_ADMIN_REPO:'HBS-ADMIN',VERCEL_TOKEN:'test',VERCEL_TEAM_ID:'team_test',VERCEL_ADMIN_PROJECT_ID:'prj_admin',SUPABASE_SERVICE_ROLE_KEY:'test'});
  const target={repo_id:1,repo_owner:'example',repo_name:resourceName(id),project_id:'prj_site'};
  let deployment={projectId:'prj_site',meta:{hbsSiteId:id,hbsRevision:'2',hbsCommit:'commit',hbsDigest:'digest'},readyState:'READY'};
  const posts:string[]=[];
  const api=providers(async(input,init)=>{
    const path=new URL(String(input)).pathname;
    if(init?.method==='POST'){posts.push(path);return Response.json({});}
    if(path.startsWith('/repos/'))return Response.json({id:1,private:true,name:resourceName(id),owner:{login:'example'},description:`HBS generated website ${id}`});
    if(path.startsWith('/v9/projects/'))return Response.json({id:'prj_site',name:resourceName(id),accountId:'team_test',targets:{production:{id:'dpl_reviewed'}}});
    return Response.json(deployment);
  });
  await api.promote(id,2,target,'dpl_reviewed','commit');
  assert.deepEqual(posts,['/v10/projects/prj_site/promote/dpl_reviewed']);
  assert.equal(await api.promotionStatus(id,target,'dpl_reviewed'),true);
  assert.equal(await api.promotionStatus(id,target,'dpl_other'),false);
  await assert.rejects(()=>api.promote(id,3,target,'dpl_reviewed','commit'));
  await assert.rejects(()=>api.promote(id,2,target,'dpl_reviewed','other-commit'));
  deployment={...deployment,readyState:'BUILDING'};await assert.rejects(()=>api.promote(id,2,target,'dpl_reviewed','commit'));
  deployment={...deployment,readyState:'READY',projectId:'prj_admin'};await assert.rejects(()=>api.promote(id,2,target,'dpl_reviewed','commit'));
  assert.equal(posts.length,1);
});
