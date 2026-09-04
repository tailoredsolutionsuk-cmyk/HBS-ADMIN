import test from 'node:test';
import assert from 'node:assert/strict';
import { createDocument, EMPTY_BRIEF, parseDocument, renderPage, websiteFiles } from '../lib/builder/model.ts';
import { assertTargets, providers, resourceName, type Targets } from '../lib/builder/providers.ts';

const id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const id2 = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const brief = { ...EMPTY_BRIEF, businessName: 'Example Studio', niche: 'Design', audience: 'Local businesses', services: 'Branding\nWeb design', email: 'hello@example.test', phone: '+44 7700 900123' };
const doc = createDocument(brief);

test('generates four functional pages and no CRM code or secrets', () => {
  const files = websiteFiles(doc);
  assert.deepEqual(files.map(f => f.file), ['index.html', 'about.html', 'services.html', 'contact.html']);
  assert.match(files[0].data, /href="about.html"/);
  assert.match(files[3].data, /mailto:hello@example.test/);
  assert.match(files[3].data, /tel:\+447700900123/);
  assert.ok(files.every(f => !/HBS-ADMIN|SUPABASE_SERVICE_ROLE_KEY|GITHUB_TOKEN|<script/.test(f.data)));
});
test('brief style and goal influence the generated website', () => {
  const custom = createDocument({ ...brief, tone: 'Elegant and established', goal: 'Encourage phone calls' });
  assert.equal(custom.font, 'serif');
  assert.match(renderPage(custom, 'home'), /href="tel:\+447700900123">Call us/);
});
test('escapes customer text and removes executable or infrastructure properties', () => {
  const modified = structuredClone(doc);
  modified.pages.home[0].body = '<script>alert(1)</script><img onerror="bad()">';
  const parsed = parseDocument({ ...modified, repo_name: 'HBS-ADMIN', project_id: 'crm', code: 'dangerous()' });
  assert.equal('repo_name' in parsed, false);
  assert.match(renderPage(parsed, 'home'), /&lt;script&gt;/);
  assert.doesNotMatch(renderPage(parsed, 'home'), /<script|<img onerror/);
  assert.doesNotMatch(renderPage(parsed, 'home', true), /href="(?:index|contact|about|services)\.html"/);
});
test('rejects invalid pages, uploads and traversal filenames', () => {
  assert.throws(() => parseDocument({ ...doc, pages: { ...doc.pages, about: [] } }));
  assert.throws(() => parseDocument({ ...doc, primary: 'red;url' }));
  assert.throws(() => parseDocument({ ...doc, assets: [{ id: '../.env', name: 'x', mime: 'image/png', data: 'iVBORw0KGgo=' }] }));
  assert.throws(() => parseDocument({ ...doc, assets: [{ id: 'safe', name: 'x', mime: 'image/svg+xml', data: 'PHN2Zz4=' }] }));
  assert.throws(() => parseDocument(undefined));
  const image = { id: 'logo', name: '../../app.tsx', mime: 'image/png', data: 'iVBORw0KGgo=' };
  assert.equal(websiteFiles(parseDocument({ ...doc, assets: [image], logoId: 'logo' }))[4].file, 'assets/logo.png');
});
test('blocks CRM repositories, projects and malformed site IDs', () => {
  const target = { repo_id: 1, repo_name: resourceName(id), repo_owner: 'example', project_id: 'prj_site' };
  assert.doesNotThrow(() => assertTargets(id, target, 'HBS-ADMIN', 'prj_admin'));
  for (const project of ['prj_admin', 'prj_2jlYsvVapKcqzZEbtP9wZNNZ9fL4', 'prj_wHbSMpCAieIZUl45kQNXMn2W4I5h']) assert.throws(() => assertTargets(id, { ...target, project_id: project }, 'HBS-ADMIN', 'prj_admin'));
  assert.throws(() => assertTargets(id, { ...target, repo_name: 'HBS-ADMIN' }, 'HBS-ADMIN', 'prj_admin'));
  assert.throws(() => assertTargets(id2, target, 'HBS-ADMIN', 'prj_admin'));
  assert.throws(() => resourceName('../HBS-ADMIN'));
});
test('provider authentication errors never expose upstream response or tokens', async () => {
  Object.assign(process.env, { GITHUB_TOKEN: 'private-token', GITHUB_OWNER: 'example', GITHUB_ADMIN_REPO: 'HBS-ADMIN', VERCEL_TOKEN: 'private-token', VERCEL_TEAM_ID: 'team_test', VERCEL_ADMIN_PROJECT_ID: 'prj_admin', SUPABASE_SERVICE_ROLE_KEY: 'private-token' });
  const api = providers(async () => new Response('sensitive upstream error private-token', { status: 403 }));
  await assert.rejects(() => api.provision(id, { repo_id: null, repo_name: null, repo_owner: null, project_id: null }, async () => {}), error => {
    assert.ok(error instanceof Error);
    assert.match(error.message, /access is not configured/);
    assert.doesNotMatch(error.message, /private-token|sensitive upstream/);
    return true;
  });
});
test('provisions unique private resources and publishes only static website files', async () => {
  Object.assign(process.env, { GITHUB_TOKEN: 'test-github-secret', GITHUB_OWNER: 'example', GITHUB_ADMIN_REPO: 'HBS-ADMIN', VERCEL_TOKEN: 'test-vercel-secret', VERCEL_TEAM_ID: 'team_test', VERCEL_ADMIN_PROJECT_ID: 'prj_admin', SUPABASE_SERVICE_ROLE_KEY: 'test-db-secret' });
  const repos = new Map<string, any>(), projects = new Map<string, any>(), calls: { path: string; method: string; body: any }[] = [];
  const fetcher: typeof fetch = async (input, init) => {
    const url = new URL(String(input)), path = url.pathname, method = init?.method || 'GET', body = init?.body ? JSON.parse(String(init.body)) : null;
    calls.push({ path, method, body });
    let result: any;
    if (path === '/users/example' || path === '/user') result = { type: 'User', login: 'example' };
    else if (path === '/user/repos') { result = { ...body, id: repos.size + 1, owner: { login: 'example' }, default_branch: 'main' }; repos.set(body.name, result); }
    else if (/^\/repos\/example\/[^/]+$/.test(path)) result = repos.get(path.split('/')[3]);
    else if (path === '/v11/projects') { result = { id: `prj_${projects.size + 1}`, name: body.name, accountId: 'team_test' }; projects.set(body.name, result); }
    else if (path.startsWith('/v9/projects/')) result = [...projects.values()].find(p => p.name === path.split('/')[3] || p.id === path.split('/')[3]);
    else if (path.includes('/git/ref/')) result = { object: { sha: 'parent' } };
    else if (path.endsWith('/git/commits/parent')) result = { sha: 'parent', message: 'Initial commit' };
    else if (path.includes('/git/')) result = { sha: 'new-sha' };
    else if (path === '/v6/deployments') result = { deployments: [] };
    else if (path === '/v13/deployments') result = { id: 'dpl_site' };
    else if (path === '/v13/deployments/dpl_site') result = { projectId: 'prj_1', meta: { hbsSiteId: id }, readyState: 'READY', url: 'example.vercel.app' };
    else throw new Error(`Unexpected request: ${path}`);
    return new Response(JSON.stringify(result ?? {}), { status: result ? 200 : 404 });
  };
  const api = providers(fetcher), empty: Targets = { repo_id: null, repo_name: null, repo_owner: null, project_id: null };
  const a = await api.provision(id, empty, async () => {}), b = await api.provision(id2, empty, async () => {});
  assert.notEqual(a.repo_id, b.repo_id); assert.notEqual(a.project_id, b.project_id);
  assert.ok([...repos.values()].every(r => r.private === true));
  await api.provision(id, a, async () => {});
  assert.equal(repos.size, 2); assert.equal(projects.size, 2);
  let checkpointed = false;
  await api.preview(id, 0, doc, a, async () => { checkpointed = true; }, async () => {});
  assert.ok(checkpointed);
  const deployed = calls.find(c => c.path === '/v13/deployments' && c.method === 'POST')!.body;
  assert.equal(deployed.project, a.project_id);
  assert.equal(deployed.files.length, 7);
  assert.equal(deployed.target, undefined, 'preview must never target production');
  assert.doesNotMatch(JSON.stringify(deployed), /test-github-secret|test-db-secret|HBS-ADMIN/);
  assert.equal(calls.find(c => c.method === 'PATCH')!.body.force, false);
  assert.deepEqual(await api.status(id, a, 'dpl_site'), { state: 'READY', url: 'https://example.vercel.app' });
  repos.get(a.repo_name!).private = false;
  await assert.rejects(() => api.preview(id, 1, doc, a, async () => {}, async () => {}), /private website repository/);
});
