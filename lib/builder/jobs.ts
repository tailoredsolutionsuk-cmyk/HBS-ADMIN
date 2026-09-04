import { setTimeout as delay } from 'node:timers/promises';
import { builderDB, withSiteLock } from './server';
import { BuilderError, providers, resourceName } from './providers.ts';
import { parseDocument } from './model.ts';
import { builderModel, generateWebsiteEdit } from './ai';

export type JobKind = 'setup' | 'ai' | 'preview' | 'publish';
type Job = { id:string; site_id:string; owner_id:string; revision:number; kind:JobKind; attempts:number; polls:number; payload:{ prompt?:string; deploymentId?:string }; lease_token:string; deployment_id:string|null; generation_id:string|null; commit_sha:string|null };
const active = ['queued','running','waiting'];
export async function assertIdle(id: string) {
  const { data, error } = await builderDB().from('builder_jobs').select('id').eq('site_id',id).in('status',active).limit(1);
  if (error) throw new BuilderError('Website job storage needs setup.',503);
  if (data?.length) throw new BuilderError('A website operation is already running. Wait for it to finish before editing.',409);
}
export async function enqueue(id:string, owner:string, revision:number, kind:JobKind, requestId:string, payload:Job['payload']={}) {
  resourceName(requestId);
  const db=builderDB();
  const existing=await db.from('builder_jobs').select('site_id,owner_id,revision,kind').eq('id',requestId).maybeSingle();
  if (existing.error) throw new BuilderError('Website job storage needs setup.',503);
  if (existing.data) {
    if (existing.data.site_id!==id || existing.data.owner_id!==owner || existing.data.kind!==kind || existing.data.revision!==revision) throw new BuilderError('This operation ID has already been used.',409);
    return;
  }
  await assertIdle(id);
  const inserted=await db.from('builder_jobs').insert({id:requestId,site_id:id,owner_id:owner,revision,kind,payload});
  if(inserted.error) throw new BuilderError('Could not queue this operation. Reload its status before retrying.',409);
}

async function execute(job:Job) {
  const db=builderDB(), api=providers();
  const updateJob=async(values:Record<string,unknown>)=>{
    const {data,error}=await db.from('builder_jobs').update({...values,updated_at:new Date().toISOString()}).eq('id',job.id).eq('lease_token',job.lease_token).select('id').maybeSingle();
    if(error||!data) throw new BuilderError('The operation lease expired. Reload its saved status.',409);
  };
  try {
    const admin=await db.from('admin_users').select('role').eq('user_id',job.owner_id).maybeSingle();
    if(admin.error||!['owner','admin'].includes(admin.data?.role)) throw new BuilderError('This account no longer has website publishing permission.',403);
    await withSiteLock(job.site_id,job.owner_id,job.revision,async(site,update,checkpoint)=>{
      const progress=async(value:string)=>updateJob({progress:value});
      if(job.kind==='setup') {
        await progress('Creating isolated private repository and hosting');
        await api.provision(site.id,site,target=>update({...target}));
        await update({last_error:null});
      } else if(job.kind==='ai') {
        // One generation per job. An uncertain/crashed call is never silently charged again.
        const generationId=job.generation_id||job.id;
        const existing=await db.from('builder_generations').select('status,result').eq('id',generationId).maybeSingle();
        if(existing.error) throw new BuilderError('Could not inspect AI history.',503);
        if(existing.data) throw new BuilderError('This AI request already ran. Review its saved history before starting another edit.',409);
        const record=await db.from('builder_generations').insert({id:generationId,site_id:site.id,owner_id:job.owner_id,model:builderModel(),prompt:job.payload.prompt});
        if(record.error) throw new BuilderError('Could not prepare AI history.',503);
        await updateJob({generation_id:generationId,progress:'GPT-5.4 mini is editing approved website content'});
        try {
          const generated=await generateWebsiteEdit(parseDocument(site.draft),job.payload.prompt!);
          const cost=generated.cost == null ? NaN : Number(generated.cost);
          const saved=await db.from('builder_generations').update({result:generated.result,usage:generated.usage,estimated_cost_usd:Number.isFinite(cost)?cost:null,status:'generated'}).eq('id',generationId);
          if(saved.error) throw new BuilderError('AI output could not be saved.',503);
          await checkpoint();
          await update({draft:generated.draft,revision:site.revision+1,last_error:null});
          const completed=await db.from('builder_generations').update({status:'complete',revision:site.revision+1}).eq('id',generationId);
          if(completed.error) throw new BuilderError('Draft saved. AI history needs a refresh.',503);
        } catch(error) {
          await db.from('builder_generations').update({status:'error',error:'Generation, validation or persistence failed. Review stored output and draft before retrying.'}).eq('id',generationId);
          throw error;
        }
      } else if(job.kind==='preview') {
        if(!job.deployment_id) {
          await progress('Saving website files to its private repository');
          const target=await api.provision(site.id,site,target=>update({...target}));
          const deployment=await api.preview(site.id,site.revision,parseDocument(site.draft),target,checkpoint,async sha=>{
            await updateJob({commit_sha:sha});
            const saved=await db.from('builder_versions').update({commit_sha:sha}).eq('site_id',site.id).eq('revision',site.revision);
            if(saved.error) throw new BuilderError('Repository checkpoint could not be saved.',503);
          });
          await updateJob({deployment_id:deployment.id,commit_sha:deployment.sha,status:'waiting',progress:'Vercel is building the preview',available_at:new Date(Date.now()+5000).toISOString(),lease_token:null,lease_until:null});
          return;
        }
        const status=await api.status(site.id,site,job.deployment_id);
        if(['ERROR','CANCELED'].includes(status.state)) throw new BuilderError('Preview build failed. Your live website has not changed.',400);
        if(status.state!=='READY'||!status.url) {
          if(job.polls>=60) throw new BuilderError('Preview is taking longer than expected. Check Vercel before retrying.',400);
          await updateJob({status:'waiting',polls:job.polls+1,progress:'Waiting for Vercel preview',available_at:new Date(Date.now()+5000).toISOString(),lease_token:null,lease_until:null});return;
        }
        await update({preview_revision:site.revision,preview_deployment:job.deployment_id,preview_url:status.url,last_error:null});
        const saved=await db.from('builder_versions').update({deployment_id:job.deployment_id,deployment_state:'READY',preview_url:status.url}).eq('site_id',site.id).eq('revision',site.revision);
        if(saved.error) throw new BuilderError('Could not save preview history.',503);
      } else {
        if(site.preview_revision!==job.revision||site.preview_deployment!==job.payload.deploymentId||!site.preview_url) throw new BuilderError('This preview no longer matches the approved draft. Build and review another preview.',409);
        if(!job.deployment_id) {
          const version=await db.from('builder_versions').select('commit_sha').eq('site_id',site.id).eq('revision',job.revision).single();
          if(version.error||!version.data.commit_sha) throw new BuilderError('The preview repository checkpoint is missing.',409);
          await progress('Publishing the exact preview you approved');
          await checkpoint();
          await api.promote(site.id,job.revision,site,site.preview_deployment!,version.data.commit_sha);
          await updateJob({deployment_id:site.preview_deployment,status:'waiting',progress:'Confirming production routing',available_at:new Date(Date.now()+5000).toISOString(),lease_token:null,lease_until:null});return;
        }
        if(!await api.promotionStatus(site.id,site,job.deployment_id)) {
          if(job.polls>=60) throw new BuilderError('Production routing needs attention in Vercel. Do not assume the old version is live.',400);
          await updateJob({status:'waiting',polls:job.polls+1,progress:'Confirming production routing',available_at:new Date(Date.now()+5000).toISOString(),lease_token:null,lease_until:null});return;
        }
        await update({published_revision:job.revision,published_deployment:job.deployment_id,live_url:site.preview_url,last_error:null});
      }
      await updateJob({status:'succeeded',progress:job.kind==='preview'?'Preview ready — review before publishing':job.kind==='publish'?'Published':job.kind==='ai'?'AI draft saved':'Hosting ready',error:null,lease_token:null,lease_until:null});
    });
  } catch(error) {
    const safe=error instanceof BuilderError?error.message:'The operation failed. Your saved draft is safe. Review its status before retrying.';
    const retry=job.kind!=='ai'&&job.attempts<3&&(!(error instanceof BuilderError)||error.status>=500);
    await updateJob({status:retry?'queued':'failed',progress:retry?'Retry scheduled':'Needs attention',error:safe,available_at:new Date(Date.now()+job.attempts*10000).toISOString(),lease_token:null,lease_until:null});
  }
}

export async function runJobs(owner?:string) {
  // Durable SQL leases coordinate concurrent cron/after() invocations. No browser is needed.
  const deadline=Date.now()+210000;
  while(Date.now()<deadline-100000) {
    const {data,error}=await builderDB().rpc('builder_claim_job',{p_token:crypto.randomUUID(),p_owner:owner||null});
    if(error) throw new BuilderError('The background worker database needs setup.',503);
    if(data?.[0]) await execute(data[0] as Job);
    else {
      let pendingQuery=builderDB().from('builder_jobs').select('id').in('status',['queued','waiting']).lte('available_at',new Date(Date.now()+30000).toISOString()).limit(1);
      if(owner)pendingQuery=pendingQuery.eq('owner_id',owner);
      const pending=await pendingQuery;
      if(pending.error||!pending.data?.length)return;
      await delay(5000);
    }
  }
}
