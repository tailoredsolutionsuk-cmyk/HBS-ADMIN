import { websiteFiles, type SiteDocument } from './model.ts';
import { createHash } from 'node:crypto';
import { connectedFiles, domainName } from './public-model.ts';

export type Targets = { repo_id: number | null; repo_name: string | null; repo_owner: string | null; project_id: string | null };
export class BuilderError extends Error {
  status: number;
  constructor(message: string, status = 400) { super(message); this.status = status; }
}
export function resourceName(id: string): string {
  if (!/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(id)) throw new BuilderError('Invalid website ID.');
  return `hbs-site-${id.toLowerCase()}`;
}
export function assertTargets(id: string, target: Targets, adminRepo: string, adminProject: string): void {
  const name = resourceName(id);
  const protectedRepos = ['hbs-admin', 'website-code-hbs', adminRepo.toLowerCase()];
  const protectedProjects = ['prj_2jlYsvVapKcqzZEbtP9wZNNZ9fL4', 'prj_wHbSMpCAieIZUl45kQNXMn2W4I5h', adminProject];
  if (!target.repo_id || !target.project_id || !target.repo_owner || target.repo_name !== name || protectedRepos.includes(target.repo_name.toLowerCase()) || protectedProjects.includes(target.project_id)) throw new BuilderError('Isolation check failed. No repository or deployment was changed.', 409);
}
export function providerReadiness() {
  const required = ['GITHUB_TOKEN', 'GITHUB_OWNER', 'GITHUB_ADMIN_REPO', 'VERCEL_TOKEN', 'VERCEL_TEAM_ID', 'VERCEL_ADMIN_PROJECT_ID', 'SUPABASE_SERVICE_ROLE_KEY'];
  const missing = required.filter(key => !process.env[key]);
  return { configured: missing.length === 0, missing };
}
type Json = Record<string, any>; // External provider JSON is validated at each boundary below.
export function providers(fetcher: typeof fetch = fetch) {
  const config = () => {
    const readiness = providerReadiness();
    if (!readiness.configured) throw new BuilderError(`Builder setup required: ${readiness.missing.join(', ')}.`, 503);
    const owner = process.env.GITHUB_OWNER!;
    if (!/^[A-Za-z0-9-]+$/.test(owner)) throw new BuilderError('Invalid GitHub owner configuration.', 503);
    return { owner, adminRepo: process.env.GITHUB_ADMIN_REPO!, adminProject: process.env.VERCEL_ADMIN_PROJECT_ID! };
  };
  async function request(provider: 'github' | 'vercel', path: string, method = 'GET', body?: unknown, allow404 = false): Promise<Json | null> {
    const base = provider === 'github' ? 'https://api.github.com' : 'https://api.vercel.com';
    const suffix = provider === 'vercel' ? `${path.includes('?') ? '&' : '?'}teamId=${encodeURIComponent(process.env.VERCEL_TEAM_ID!)}` : '';
    let response: Response;
    try { response = await fetcher(`${base}${path}${suffix}`, { method, headers: { Authorization: `Bearer ${provider === 'github' ? process.env.GITHUB_TOKEN : process.env.VERCEL_TOKEN}`, Accept: 'application/json', 'Content-Type': 'application/json', ...(provider === 'github' ? { 'X-GitHub-Api-Version': '2022-11-28' } : {}) }, body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(15_000), redirect: 'error', cache: 'no-store' }); }
    catch { throw new BuilderError(`${provider === 'github' ? 'GitHub' : 'Vercel'} did not respond. Your draft is safe; retry this step.`, 502); }
    if (allow404 && response.status === 404) return null;
    if (!response.ok) throw new BuilderError(`${provider === 'github' ? 'GitHub' : 'Vercel'} ${response.status === 401 || response.status === 403 ? 'access is not configured for this action' : response.status === 429 ? 'rate limit reached; try again later' : `request failed (${response.status})`}. Your draft is safe.`, 502);
    const raw = await response.text();
    return raw ? JSON.parse(raw) : {};
  }
  async function verifyRepo(id: string, target: Targets) {
    const c = config();
    if (target.repo_name !== resourceName(id) || target.repo_owner !== c.owner) throw new BuilderError('Repository isolation check failed.', 409);
    const repo = await request('github', `/repos/${c.owner}/${resourceName(id)}`);
    if (!repo || repo.id !== target.repo_id || repo.private !== true || repo.name !== resourceName(id) || repo.owner?.login?.toLowerCase() !== c.owner.toLowerCase() || repo.description !== `HBS generated website ${id}`) throw new BuilderError('The private website repository could not be verified.', 409);
    return repo;
  }
  async function verifyProject(id: string, target: Targets) {
    const c = config(); assertTargets(id, target, c.adminRepo, c.adminProject);
    const project = await request('vercel', `/v9/projects/${encodeURIComponent(target.project_id!)}`);
    if (!project || project.id !== target.project_id || project.name !== resourceName(id) || project.accountId !== process.env.VERCEL_TEAM_ID || project.link) throw new BuilderError('The isolated website project could not be verified.', 409);
    return project;
  }
  return {
    async provision(id: string, previous: Targets, persist: (target: Targets) => Promise<void>): Promise<Targets> {
      const c = config(), name = resourceName(id); let target = { ...previous };
      if (!target.repo_id) {
        let repo = await request('github', `/repos/${c.owner}/${name}`, 'GET', undefined, true);
        if (!repo) {
          const owner = await request('github', `/users/${c.owner}`);
          if (owner?.type === 'User') { const me = await request('github', '/user'); if (me?.login?.toLowerCase() !== c.owner.toLowerCase()) throw new BuilderError('GitHub token must belong to the configured owner.', 503); }
          repo = await request('github', owner?.type === 'Organization' ? `/orgs/${c.owner}/repos` : '/user/repos', 'POST', { name, private: true, auto_init: true, description: `HBS generated website ${id}`, has_issues: false, has_wiki: false });
        }
        if (!repo?.private || repo.description !== `HBS generated website ${id}`) throw new BuilderError('A repository with this name exists but was not created for this website.', 409);
        target = { ...target, repo_id: repo.id, repo_name: name, repo_owner: c.owner }; await verifyRepo(id, target); await persist(target);
      } else { await verifyRepo(id, target); }
      if (!target.project_id) {
        let project = await request('vercel', `/v9/projects/${name}`, 'GET', undefined, true);
        if (!project) project = await request('vercel', '/v11/projects', 'POST', { name, framework: null, buildCommand: '', installCommand: '', outputDirectory: null, publicSource: false });
        target = { ...target, project_id: project?.id }; await verifyProject(id, target); await persist(target);
      } else { await verifyProject(id, target); }
      return target;
    },
    async preview(id: string, revision: number, doc: SiteDocument, target: Targets, checkpoint: () => Promise<void>, onCommit: (sha: string) => Promise<void>) {
      const c = config(); assertTargets(id, target, c.adminRepo, c.adminProject);
      const repo = await verifyRepo(id, target); await verifyProject(id, target);
      const root = `/repos/${c.owner}/${resourceName(id)}`;
      const branch = encodeURIComponent(repo.default_branch);
      const files = connectedFiles(websiteFiles(doc), id, process.env.BUILDER_PUBLIC_ORIGIN || 'https://www.hbsmarketing.online');
      const digest = createHash('sha256').update(JSON.stringify(files)).digest('hex');
      const message = `HBS website ${id} revision ${revision} ${digest}`;
      const ref = await request('github', `${root}/git/ref/heads/${branch}`);
      const parent = await request('github', `${root}/git/commits/${ref!.object.sha}`);
      let sha = parent!.sha as string;
      if (parent!.message !== message) {
        const entries = await Promise.all(files.map(async file => {
          const blob = await request('github', `${root}/git/blobs`, 'POST', { content: file.data, encoding: file.encoding });
          return { path: file.file, mode: '100644', type: 'blob', sha: blob!.sha };
        }));
        const tree = await request('github', `${root}/git/trees`, 'POST', { tree: entries });
        const commit = await request('github', `${root}/git/commits`, 'POST', { message, tree: tree!.sha, parents: [parent!.sha] });
        await checkpoint();
        await request('github', `${root}/git/refs/heads/${branch}`, 'PATCH', { sha: commit!.sha, force: false });
        sha = commit!.sha;
      }
      await onCommit(sha); await checkpoint();
      // Recover an accepted request if the original response was lost. Never aim at the CRM.
      const recent = await request('vercel', `/v6/deployments?projectId=${encodeURIComponent(target.project_id!)}&limit=20`);
      let deployment = recent?.deployments?.find((d: Json) => d.meta?.hbsSiteId === id && d.meta?.hbsRevision === String(revision) && d.meta?.hbsDigest === digest && !['ERROR', 'CANCELED'].includes(d.state ?? d.readyState));
      // Omitting target creates a PREVIEW. Only promote() below may change production.
      if (!deployment) deployment = await request('vercel', '/v13/deployments', 'POST', { name: resourceName(id), project: target.project_id, files, projectSettings: { framework: null, buildCommand: '', installCommand: '', outputDirectory: null }, meta: { hbsSiteId: id, hbsRevision: String(revision), hbsCommit: sha, hbsDigest: digest } });
      if (!(deployment?.id || deployment?.uid)) throw new BuilderError('Vercel did not return a deployment ID.', 502);
      return { id: String(deployment.id || deployment.uid), sha };
    },
    async promote(id: string, revision: number, target: Targets, deploymentId: string, commit: string) {
      await verifyRepo(id, target); await verifyProject(id, target);
      const d = await request('vercel', `/v13/deployments/${encodeURIComponent(deploymentId)}`);
      if (!d || d.projectId !== target.project_id || d.meta?.hbsSiteId !== id || d.meta?.hbsRevision !== String(revision) || d.meta?.hbsCommit !== commit || !d.meta?.hbsDigest || d.readyState !== 'READY') throw new BuilderError('Only the reviewed, ready preview can be published.', 409);
      await request('vercel', `/v10/projects/${encodeURIComponent(target.project_id!)}/promote/${encodeURIComponent(deploymentId)}`, 'POST');
    },
    async promotionStatus(id: string, target: Targets, deploymentId: string) {
      const project = await verifyProject(id, target);
      return project.targets?.production?.id === deploymentId;
    },
    async domain(id: string, target: Targets, value: string, attach = false) {
      const name = domainName(value);
      await verifyProject(id, target);
      const path = `/v9/projects/${encodeURIComponent(target.project_id!)}/domains/${name}`;
      let domain = await request('vercel', path, 'GET', undefined, true);
      if (!domain && attach) domain = await request('vercel', `/v10/projects/${encodeURIComponent(target.project_id!)}/domains`, 'POST', { name });
      if (!domain || domain.projectId !== target.project_id || domain.name !== name) throw new BuilderError('This domain is not assigned to this website.', 409);
      if (!domain.verified) domain = await request('vercel', `/v9/projects/${encodeURIComponent(target.project_id!)}/domains/${name}/verify`, 'POST');
      const dns = await request('vercel', `/v6/domains/${name}/config?projectIdOrName=${encodeURIComponent(target.project_id!)}`);
      return { name, verified: domain?.verified === true && dns?.misconfigured === false, ownershipVerified: domain?.verified === true, verification: domain?.verification || [], recommendedIPv4: dns?.recommendedIPv4 || [], recommendedCNAME: dns?.recommendedCNAME || [], misconfigured: dns?.misconfigured !== false, checkedAt: new Date().toISOString() };
    },
    async status(id: string, target: Targets, deploymentId: string) {
      await verifyProject(id, target);
      const d = await request('vercel', `/v13/deployments/${encodeURIComponent(deploymentId)}`);
      if (!d || d.projectId !== target.project_id || d.meta?.hbsSiteId !== id) throw new BuilderError('Deployment isolation check failed.', 409);
      const state = String(d.readyState ?? d.state);
      const url = typeof d.url === 'string' && /^[a-z0-9.-]+\.vercel\.app$/i.test(d.url) ? `https://${d.url}` : null;
      return { state, url };
    },
  };
}
