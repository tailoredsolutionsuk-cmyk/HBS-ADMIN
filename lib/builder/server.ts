import { createClient as serviceClient } from '@supabase/supabase-js';
import { createClient } from '../supabase/server';
import { BuilderError, resourceName, type Targets } from './providers.ts';
import type { SiteDocument } from './model.ts';

export type BuilderSite = Targets & { client_id: string | null; preview_revision: number | null; preview_deployment: string | null; preview_url: string | null; published_deployment: string | null; custom_domain: string | null; domain_verified: boolean; domain_status: Record<string, unknown> | null; id: string; owner_id: string; name: string; draft: SiteDocument; revision: number; published_revision: number | null; live_url: string | null; pending_revision: number | null; pending_deployment: string | null; last_error: string | null; updated_at: string; lock_token: string | null };
export async function builderUser() {
  const client = await createClient();
  const { data, error } = await client.auth.getUser();
  if (error || !data.user) throw new BuilderError('Please sign in to HBS Admin.', 401);
  const { data: admin } = await client.from('admin_users').select('role').eq('user_id', data.user.id).maybeSingle();
  if (!admin || !['owner', 'admin'].includes(admin.role)) throw new BuilderError('Website building requires an owner or admin account.', 403);
  return data.user.id;
}
export function builderDB() {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) throw new BuilderError('The website builder database is not configured.', 503);
  return serviceClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
}
export async function ownedSite(id: string, owner: string): Promise<BuilderSite> {
  resourceName(id);
  const { data, error } = await builderDB().from('builder_sites').select('*').eq('id', id).eq('owner_id', owner).maybeSingle();
  if (error) throw new BuilderError('Could not load your website. Try again.', 503);
  if (!data) throw new BuilderError('Website not found in your workspace.', 404);
  return data as BuilderSite;
}
export async function rateLimit(owner: string, action: string, limit: number, seconds = 60) {
  const { data, error } = await builderDB().rpc('builder_rate_limit', { p_key: `${owner}:${action}`, p_limit: limit, p_seconds: seconds });
  if (error) throw new BuilderError('The website builder database needs setup.', 503);
  if (!data) throw new BuilderError('Too many requests. Please wait before trying again.', 429);
}
export function publicSite(site: BuilderSite) {
  const { owner_id: _owner, lock_token: _lock, ...safe } = site;
  return safe;
}
export async function state(id: string, owner: string) {
  const site = await ownedSite(id, owner);
  const { data, error } = await builderDB().from('builder_versions').select('revision,label,created_at,commit_sha,deployment_id,deployment_state').eq('site_id', id).order('revision', { ascending: false }).limit(50);
  if (error) throw new BuilderError('Could not load version history.', 503);
  const generations = await builderDB().from('builder_generations').select('id,revision,status,created_at').eq('site_id', id).eq('owner_id', owner).order('created_at', { ascending: false }).limit(20);
  const jobs = await builderDB().from('builder_jobs').select('id,kind,status,progress,error,attempts,revision,created_at').eq('site_id',id).eq('owner_id',owner).order('created_at',{ascending:false}).limit(20);
  const metrics = await builderDB().from('builder_metrics').select('day,page,views').eq('site_id',id).gte('day',new Date(Date.now()-29*86400000).toISOString().slice(0,10)).order('day',{ascending:false});
  const enquiries = await builderDB().from('leads').select('id',{count:'exact',head:true}).eq('builder_site_id',id);
  if (generations.error || jobs.error || metrics.error || enquiries.error) throw new BuilderError('Website history needs database setup.',503);
  return { site: publicSite(site), versions: data, generations: generations.data || [], jobs: jobs.data || [], metrics: metrics.data || [], enquiryCount: enquiries.count || 0 };
}
export async function withSiteLock<T>(id: string, owner: string, revision: number, action: (site: BuilderSite, update: (values: Record<string, unknown>) => Promise<void>, checkpoint: () => Promise<void>) => Promise<T>) {
  const db = builderDB(), token = crypto.randomUUID();
  const { data, error } = await db.from('builder_sites').update({ lock_token: token, lock_until: new Date(Date.now() + 300_000).toISOString() }).eq('id', id).eq('owner_id', owner).eq('revision', revision).or(`lock_token.is.null,lock_until.lt.${new Date().toISOString()}`).select('*').maybeSingle();
  if (error) throw new BuilderError('Could not lock this website for editing.', 503);
  if (!data) throw new BuilderError('This website changed in another tab or has an operation running. Reload before trying again.', 409);
  const update = async (values: Record<string, unknown>) => {
    const result = await db.from('builder_sites').update({ ...values, updated_at: new Date().toISOString() }).eq('id', id).eq('owner_id', owner).eq('lock_token', token).select('id').maybeSingle();
    if (result.error || !result.data) throw new BuilderError('Could not save the website state. Reload before retrying.', 503);
  };
  const checkpoint = async () => {
    const result = await db.from('builder_sites').select('id').eq('id', id).eq('owner_id', owner).eq('lock_token', token).maybeSingle();
    if (result.error || !result.data) throw new BuilderError('Website operation expired. Retry from the saved draft.', 409);
  };
  try { return await action(data as BuilderSite, update, checkpoint); }
  finally { await db.from('builder_sites').update({ lock_token: null, lock_until: null }).eq('id', id).eq('owner_id', owner).eq('lock_token', token); }
}
