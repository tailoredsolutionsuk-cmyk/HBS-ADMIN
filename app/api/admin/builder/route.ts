import { after, NextResponse } from 'next/server';
import { builderDB, builderUser, ownedSite, rateLimit, state, withSiteLock } from '../../../../lib/builder/server';
import { createDocument, DocumentError, MAX_DOCUMENT_BYTES, parseBrief, parseDocument } from '../../../../lib/builder/model.ts';
import { BuilderError, providerReadiness, providers, resourceName } from '../../../../lib/builder/providers.ts';
import { domainName } from '../../../../lib/builder/public-model.ts';
import { assertIdle, enqueue, runJobs, type JobKind } from '../../../../lib/builder/jobs';
import { builderModel, generationInput } from '../../../../lib/builder/ai';
import { createClient } from '../../../../lib/supabase/server';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;
const headers = { 'Cache-Control': 'private, no-store' };
const json = (value: unknown, status = 200) => NextResponse.json(value, { status, headers });
function failure(error: unknown) {
  return json({ error: error instanceof BuilderError || error instanceof DocumentError ? error.message.slice(0, 300) : 'The operation failed. Your saved draft is safe.' }, error instanceof BuilderError ? error.status : error instanceof DocumentError ? 400 : 500);
}
function startWorker(owner:string) {
  after(async()=>{ try { await runJobs(owner); } catch { console.error('Builder worker needs attention; inspect saved jobs.'); } });
}
export async function GET(request: Request) {
  try {
    const owner = await builderUser(); await rateLimit(owner, 'read', 120);
    const generationId = new URL(request.url).searchParams.get('generation');
    if (generationId) {
      resourceName(generationId);
      const { data, error } = await builderDB().from('builder_generations').select('*').eq('id', generationId).eq('owner_id', owner).maybeSingle();
      if (error || !data) throw new BuilderError('AI edit not found in your workspace.', 404);
      return json({ generation: data });
    }
    const id = new URL(request.url).searchParams.get('id');
    if (id) {
      const result=await state(id,owner);
      if(result.jobs.some(job=>['queued','waiting','running'].includes(job.status))) startWorker(owner);
      return json(result);
    }
    const { data, error } = await builderDB().from('builder_sites').select('id,name,client_id,revision,published_revision,live_url,repo_name,project_id,last_error,updated_at').eq('owner_id', owner).order('updated_at', { ascending: false }).limit(100);
    if (error) throw new BuilderError('The website builder database needs setup.', 503);
    const client=await createClient();
    const clients=await client.from('clients').select('id,business_name').eq('archived',false).order('business_name');
    if(clients.error) throw new BuilderError('Could not load the client list.',503);
    return json({ sites: data, clients:clients.data, readiness: {...providerReadiness(), aiModel:process.env.BUILDER_AI_MODEL||'openai/gpt-5.4-mini', backgroundRecovery:Boolean(process.env.CRON_SECRET), contactForms:Boolean(process.env.BUILDER_FORM_SECRET)} });
  } catch (error) { return failure(error); }
}
export async function POST(request: Request) {
  try {
    if (request.headers.get('origin') !== new URL(request.url).origin) throw new BuilderError('Open the builder in HBS Admin to make changes.', 403);
    const owner = await builderUser(); await rateLimit(owner, 'write', 40);
    if (!request.headers.get('content-type')?.startsWith('application/json')) throw new BuilderError('Send JSON website data.', 415);
    const reader = request.body?.getReader(); if (!reader) throw new BuilderError('Missing request.');
    const chunks: Uint8Array[] = []; let size = 0;
    for (;;) { const { done, value } = await reader.read(); if (done) break; size += value.byteLength; if (size > MAX_DOCUMENT_BYTES + 20_000) { await reader.cancel(); throw new BuilderError('Uploads are too large. Keep total files below 2 MB.', 413); } chunks.push(value); }
    let body: Record<string, any>;
    try { body = JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { throw new BuilderError('Invalid website data.'); }
    if (!body || Array.isArray(body) || typeof body !== 'object') throw new BuilderError('Invalid website data.');
    const id = String(body.id ?? ''); resourceName(id);
    if (body.action === 'create') {
      await rateLimit(owner, 'create', 5, 3600);
      const draft = createDocument(parseBrief(body.brief));
      const clientId=typeof body.clientId==='string'&&body.clientId?body.clientId:null;
      if(clientId) {
        const client=await createClient();
        const linked=await client.from('clients').select('id').eq('id',clientId).eq('archived',false).maybeSingle();
        if(linked.error||!linked.data) throw new BuilderError('Choose an accessible CRM client.',403);
      }
      const { error } = await builderDB().from('builder_sites').insert({ id, owner_id: owner, name: draft.brief.businessName, draft, client_id:clientId });
      if (error && error.code !== '23505') throw new BuilderError('Could not save the new website.', 503);
      const existing = await ownedSite(id, owner);
      // Draft creation never relies on provider access. Hosting is an explicit queued action.
      return json(await state(existing.id, owner), 201);
    }
    if (!Number.isInteger(body.revision) || body.revision < 0) throw new BuilderError('Reload this website before editing.');
    const result=await withSiteLock(id,owner,body.revision,async(site,update)=>{
      if(body.action==='save'||body.action==='restore') {
        await assertIdle(id);
        let document=body.document;
        if(body.action==='restore') {
          const {data,error}=await builderDB().from('builder_versions').select('document').eq('site_id',id).eq('revision',body.version).maybeSingle();
          if(error||!data) throw new BuilderError('That version was not found.',404);
          document=data.document;
        }
        const draft=parseDocument(document);
        await update({draft,name:draft.brief.businessName,revision:site.revision+1,last_error:null});
        const label=body.action==='restore'?'Restored version '+body.version:'Saved draft';
        const saved=await builderDB().from('builder_versions').update({label}).eq('site_id',id).eq('revision',site.revision+1);
        if(saved.error) throw new BuilderError('Draft saved; version label needs a refresh.',503);
      } else if(['setup','ai','preview','publish'].includes(body.action)) {
        const kind=body.action as JobKind;
        await rateLimit(owner,kind,10,3600);
        const payload:{prompt?:string;deploymentId?:string}={};
        if(kind==='ai') {
          builderModel();
          if(body.aiConsent!==true) throw new BuilderError('Confirm sending this website content to AI.');
          if(typeof body.prompt!=='string'||!body.prompt.trim()||body.prompt.length>1500) throw new BuilderError('Describe the edit in under 1,500 characters.');
          generationInput(site.draft,body.prompt);
          // $0.15 conservative reservation per bounded request, at most $3/day/admin.
          // Failed/uncertain calls retain their reservation; no automatic AI retry.
          const requested=Number(process.env.BUILDER_AI_DAILY_BUDGET_USD||3);
          const budget=Number.isFinite(requested)?Math.min(3,Math.max(0,requested)):0;
          if(budget<0.15) throw new BuilderError('AI daily budget is disabled.',503);
          await rateLimit(owner,'ai-budget',Math.floor(budget/0.15),86400);
          payload.prompt=body.prompt.trim();
        }
        if(kind==='preview'||kind==='publish') {
          if(!site.draft.brief.email&&!site.draft.brief.phone) throw new BuilderError('Add a public email or phone number before building a release.');
        }
        if(kind==='publish') {
          if(body.reviewed!==true||site.preview_revision!==site.revision||body.deploymentId!==site.preview_deployment||!site.preview_url) throw new BuilderError('Open and approve the ready preview for this saved draft before publishing.',409);
          payload.deploymentId=site.preview_deployment!;
        }
        await enqueue(id,owner,site.revision,kind,String(body.requestId||''),payload);
        startWorker(owner);
      } else if(body.action==='domain-add'||body.action==='domain-check') {
        await assertIdle(id); await rateLimit(owner,'domains',10,3600);
        if(site.published_revision===null) throw new BuilderError('Publish and test the website before connecting a custom domain.');
        let domain:string;
        try { domain=domainName(body.action==='domain-check'?site.custom_domain||'':String(body.domain||'')); } catch(error) { throw new BuilderError((error as Error).message); }
        if(site.custom_domain&&site.custom_domain!==domain) throw new BuilderError('A domain is already attached. Manage replacements in Vercel to avoid disconnecting visitors.',409);
        // Reserve the domain before provider calls so retries cannot cross website assignments.
        if(body.action==='domain-add') await update({custom_domain:domain,domain_verified:false});
        try {
          const status=await providers().domain(id,site,domain,body.action==='domain-add');
          await update({domain_status:status,domain_verified:status.verified,last_error:null});
        } catch(error) { await update({domain_verified:false,last_error:error instanceof BuilderError?error.message:'Domain check failed.'});throw error; }
      } else if(body.action!=='status') throw new BuilderError('Unknown website action.');
      return state(id,owner);
    });
    if(body.action==='status') startWorker(owner);
    return json(result);
  } catch(error) {return failure(error);}
}
