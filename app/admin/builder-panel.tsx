"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { EMPTY_BRIEF, PAGE_KEYS, PAGE_NAMES, parseDocument, renderPage, type Asset, type Brief, type PageKey, type Section, type SiteDocument } from '../../lib/builder/model';
import './builder.css';

type Site = { id: string; name: string; revision: number; published_revision: number | null; live_url: string | null; repo_name: string | null; repo_owner?: string; project_id: string | null; pending_deployment: string | null; last_error: string | null; draft: SiteDocument };
type Version = { revision: number; label: string; created_at: string; deployment_state: string | null };
type Generation = { id: string; revision: number | null; status: string; created_at: string };
type ResponseData = { site: Site; versions: Version[]; generations?: Generation[] };
async function request(body?: Record<string, unknown>, id?: string) {
  const response = await fetch(`/api/admin/builder${id ? `?id=${encodeURIComponent(id)}` : ''}`, { method: body ? 'POST' : 'GET', headers: body ? { 'Content-Type': 'application/json' } : {}, body: body ? JSON.stringify(body) : undefined, cache: 'no-store' });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'Could not complete this step. Please try again.');
  return data;
}
export default function BuilderPanel({ startNew = 0, onDirty }: { startNew?: number; onDirty: (value: boolean) => void }) {
  const [sites, setSites] = useState<Site[]>([]), [site, setSite] = useState<Site | null>(null), [document, setDocument] = useState<SiteDocument | null>(null);
  const [versions, setVersions] = useState<Version[]>([]), [brief, setBrief] = useState<Brief>({ ...EMPTY_BRIEF });
  const [generations, setGenerations] = useState<Generation[]>([]);
  const [step, setStep] = useState<number | null>(null), [page, setPage] = useState<PageKey>('home'), [device, setDevice] = useState<'desktop' | 'mobile'>('desktop');
  const [busy, setBusy] = useState('Loading websites…'), [error, setError] = useState(''), [notice, setNotice] = useState(''), [prompt, setPrompt] = useState('');
  const [missing, setMissing] = useState<string[]>([]), [selectedVersion, setSelectedVersion] = useState('');
  const createId = useRef(''), initial = useRef(true), saved = useRef('');
  const dirty = Boolean(document && JSON.stringify(document) !== saved.current) || (step !== null && JSON.stringify(brief) !== JSON.stringify(EMPTY_BRIEF));
  useEffect(() => { onDirty(dirty); }, [dirty, onDirty]);
  useEffect(() => { const warn = (event: BeforeUnloadEvent) => { if (dirty) { event.preventDefault(); event.returnValue = ''; } }; window.addEventListener('beforeunload', warn); return () => window.removeEventListener('beforeunload', warn); }, [dirty]);
  const reloadList = useCallback(async () => { const data = await request(); setSites(data.sites); setMissing(data.readiness.missing); }, []);
  useEffect(() => { reloadList().catch(e => setError(e.message)).finally(() => setBusy('')); }, [reloadList]);
  function begin() {
    if (dirty && !window.confirm('Discard unsaved changes and start another website?')) return;
    createId.current = crypto.randomUUID(); setBrief({ ...EMPTY_BRIEF }); setStep(0); setSite(null); setDocument(null); setError(''); setNotice('');
  }
  useEffect(() => { if (initial.current) { initial.current = false; if (startNew) begin(); } else if (startNew) begin(); }, [startNew]); // A parent shortcut explicitly starts a new brief.
  function accept(data: ResponseData, replaceDraft = true) {
    setSite(data.site); setVersions(data.versions);
    setGenerations(data.generations || []);
    if (replaceDraft) { saved.current = JSON.stringify(data.site.draft); setDocument(data.site.draft); }
  }
  async function open(id: string) {
    if (dirty && !window.confirm('Discard unsaved changes?')) return;
    setBusy('Opening website…'); setError(''); setNotice('');
    try { accept(await request(undefined, id)); setStep(null); setPage('home'); } catch (e) { setError((e as Error).message); } finally { setBusy(''); }
  }
  async function action(action: string, extra: Record<string, unknown> = {}, label = 'Saving…') {
    if (!site) return; setBusy(label); setError(''); setNotice('');
    try {
      const data = await request({ action, id: site.id, revision: site.revision, ...extra });
      accept(data, !['status', 'setup', 'publish'].includes(action));
      setNotice(action === 'publish' ? 'Deployment submitted. Checking when it is live…' : action === 'restore' ? 'Version restored as a new draft. Preview it before publishing.' : action === 'ai' ? 'AI changes saved as a new draft. Review before publishing.' : action === 'save' ? 'Draft saved. Your live site has not changed.' : 'Status updated.');
      if (action === 'ai') setPrompt('');
      void reloadList().catch(() => setNotice('Your change is saved. Refresh the website list to update it.'));
    } catch (e) { setError((e as Error).message); } finally { setBusy(''); }
  }
  useEffect(() => {
    if (!site?.pending_deployment || busy || error) return;
    const timer = window.setTimeout(() => { void action('status', {}, 'Checking deployment…'); }, 5000);
    return () => window.clearTimeout(timer);
  }, [site?.pending_deployment, site?.revision, busy, error]);
  const preview = useMemo(() => document ? renderPage(document, page, true) : '', [document, page]);
  const update = (values: Partial<SiteDocument>) => setDocument(current => current ? { ...current, ...values } : current);
  function editSection(id: string, values: Partial<Section>) { if (document) update({ pages: { ...document.pages, [page]: document.pages[page].map(s => s.id === id ? { ...s, ...values } : s) } }); }
  function moveSection(index: number, direction: number) { if (!document) return; const sections = [...document.pages[page]]; [sections[index], sections[index + direction]] = [sections[index + direction], sections[index]]; update({ pages: { ...document.pages, [page]: sections } }); }
  async function upload(file?: File) {
    if (!file || !document) return;
    setError('');
    if (file.size > 750_000) { setError('Please use an image or WOFF2 font smaller than 750 KB.'); return; }
    setBusy('Adding upload…');
    try {
      const data = await new Promise<string>((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result).split(',')[1]); reader.onerror = reject; reader.readAsDataURL(file); });
      const mime = file.name.toLowerCase().endsWith('.woff2') ? 'font/woff2' : file.type;
      const asset: Asset = { id: crypto.randomUUID(), name: file.name.slice(0, 100), mime: mime as Asset['mime'], data };
      const next = parseDocument({ ...document, assets: [...document.assets, asset], ...(mime === 'font/woff2' ? { fontId: asset.id, font: 'uploaded' } : {}) });
      setDocument(next); setNotice('Upload added to your draft. Save to keep it.');
    } catch (e) { setError(e instanceof Error ? e.message : 'This upload could not be read.'); } finally { setBusy(''); }
  }
  const input = (key: keyof Brief, label: string, required = false, multiline = false) => <label className="wb-field" key={key}>{label}{multiline ? <textarea maxLength={key === 'about' || key === 'services' ? 2000 : 300} rows={4} required={required} value={brief[key]} onChange={e => setBrief({ ...brief, [key]: e.target.value })} /> : <input type={key === 'email' ? 'email' : 'text'} maxLength={300} required={required} value={brief[key]} onChange={e => setBrief({ ...brief, [key]: e.target.value })} />}</label>;
  return <div className="wb">
    <header className="wb-heading"><div><span className="admin-kicker">Website studio · Version one</span><h2>{site?.name || 'Build a business website'}</h2><p>Four pages. Your branding. A separate private repository and hosting project for every website.</p></div><button disabled={Boolean(busy)} className="admin-primary-button" onClick={begin}>+ New website</button></header>
    {error && <div className="wb-alert" role="alert">{error}</div>}
    {notice && <div className="wb-notice" role="status">{notice}</div>}
    {busy && <p role="status" className="wb-progress">{busy}</p>}
    {missing.length > 0 && <details className="wb-setup"><summary>Hosting setup needs attention — drafts are still available</summary><p>Add these server-only settings to HBS-ADMIN in Vercel: {missing.join(', ')}.</p></details>}
    {step !== null ? <form className="wb-wizard" onSubmit={async e => {
      e.preventDefault(); if (step < 2) { setStep(step + 1); return; }
      setBusy('Creating your four-page website and private hosting…'); setError('');
      try { const data = await request({ action: 'create', id: createId.current, brief }); accept(data); setStep(null); void reloadList().catch(() => setNotice('Your change is saved. Refresh the website list to update it.')); }
      catch (error) { setError((error as Error).message); } finally { setBusy(''); }
    }}>
      <p className="wb-step">Step {step + 1} of 3</p><h3>{['Tell us about the business', 'What should the website achieve?', 'Set the direction'][step]}</h3>
      {step === 0 && <>{input('businessName', 'Business name', true)}{input('niche', 'What type of business is it?', true)}{input('location', 'Where do you work or serve customers?')}</>}
      {step === 1 && <>{input('audience', 'Who are your ideal customers?', true)}{input('services', 'What services do you offer? One per line.', true, true)}<label className="wb-field">Main website goal<select value={brief.goal} onChange={e => setBrief({ ...brief, goal: e.target.value })}>{['Get enquiries', 'Encourage phone calls', 'Explain our services', 'Build trust in our brand'].map(v => <option key={v}>{v}</option>)}</select></label></>}
      {step === 2 && <><label className="wb-field">Preferred style<select value={brief.tone} onChange={e => setBrief({ ...brief, tone: e.target.value })}>{['Clean and professional', 'Warm and approachable', 'Bold and contemporary', 'Elegant and established'].map(v => <option key={v}>{v}</option>)}</select></label>{input('about', 'What makes the business different?', false, true)}<div className="wb-two">{input('email', 'Public contact email')}{input('phone', 'Public phone number')}</div><p className="wb-help">These details will appear on the generated website. This version supports business information and direct email/phone contact, not checkout or appointment processing.</p></>}
      <div className="wb-actions"><button type="button" className="admin-outline-button" disabled={Boolean(busy)} onClick={() => step ? setStep(step - 1) : setStep(null)}>{step ? 'Back' : 'Cancel'}</button><button className="admin-primary-button" disabled={Boolean(busy)}>{step === 2 ? 'Generate website' : 'Continue →'}</button></div>
    </form> : site && document ? <>
      <div className="wb-top-actions"><button disabled={Boolean(busy)} onClick={() => { if (!dirty || window.confirm('Discard unsaved changes?')) { setSite(null); setDocument(null); void reloadList().catch(() => setNotice('Your change is saved. Refresh the website list to update it.')); } }}>← All websites</button><span>{dirty ? 'Unsaved changes' : `Draft ${site.revision} saved`}{site.published_revision !== null ? ` · Live version ${site.published_revision}` : ' · Not published'}</span><button className="admin-outline-button" disabled={Boolean(busy) || !dirty} onClick={() => action('save', { document })}>Save draft</button><button className="admin-primary-button" disabled={Boolean(busy) || dirty || Boolean(site.pending_deployment)} onClick={() => { if (window.confirm('Publish this saved draft to its own website project? The CRM will not be changed.')) void action('publish', {}, 'Publishing to the website’s private repository and project…'); }}>Publish</button></div>
      {dirty && <p className="wb-help">Save your draft before publishing. Unsaved edits do not affect the live website.</p>}
      {site.last_error && <div className="wb-alert">{site.last_error}</div>}
      {generations.length > 0 && <details className="wb-infrastructure"><summary>AI edit history</summary><ul>{generations.map(item => <li key={item.id}><a href={`/api/admin/builder?generation=${item.id}`} target="_blank" rel="noopener noreferrer">{new Date(item.created_at).toLocaleString()} · {item.status}{item.revision !== null ? ` · Draft ${item.revision}` : ''}</a></li>)}</ul></details>}
      <details className="wb-infrastructure"><summary>Isolated hosting & version history</summary><p>CRM: <strong>HBS-ADMIN</strong> · This website: <strong>{site.repo_name || 'Private repository pending'}</strong></p><p>{site.project_id ? `Separate Vercel project assigned: ${site.project_id}` : 'Vercel project pending'}</p>{site.live_url && <p><a target="_blank" rel="noopener noreferrer" href={site.live_url}>Open last successful live website ↗</a></p>}<div className="wb-actions">{(!site.repo_name || !site.project_id) && <button disabled={Boolean(busy)} onClick={() => action('setup', {}, 'Setting up isolated hosting…')}>Retry hosting setup</button>}{site.pending_deployment && <button disabled={Boolean(busy)} onClick={() => action('status', {}, 'Checking deployment…')}>Check deployment status</button>}<label>Previous version<select value={selectedVersion} onChange={e => setSelectedVersion(e.target.value)}><option value="">Choose a saved version</option>{versions.map(v => <option key={v.revision} value={v.revision}>#{v.revision} · {v.label} · {new Date(v.created_at).toLocaleString()}</option>)}</select></label><button disabled={Boolean(busy) || selectedVersion === ''} onClick={() => { if (window.confirm('Restore this version as a draft? Current unsaved changes will be replaced; the live site stays unchanged.')) void action('restore', { version: Number(selectedVersion) }, 'Restoring saved version…'); }}>Restore as draft</button></div></details>
      <div className="wb-editor"><div className="wb-controls"><fieldset disabled={Boolean(busy)}><legend>Brand & content</legend>
        <div className="wb-two"><label className="wb-field">Primary colour<input type="color" value={document.primary} onChange={e => update({ primary: e.target.value })} /></label><label className="wb-field">Accent colour<input type="color" value={document.accent} onChange={e => update({ accent: e.target.value })} /></label></div>
        <label className="wb-field">Font<select value={document.font} onChange={e => update({ font: e.target.value as SiteDocument['font'] })}><option value="sans">Modern sans-serif</option><option value="serif">Classic serif</option><option value="mono">Monospace</option>{document.fontId && <option value="uploaded">Uploaded brand font</option>}</select></label>
        <label className="wb-field">Upload logo, images or font<input type="file" accept="image/png,image/jpeg,image/webp,.woff2" onChange={e => { void upload(e.target.files?.[0]); e.target.value = ''; }} /><small>PNG, JPEG, WebP or WOFF2. Up to 750 KB each; 2 MB total.</small></label>
        <label className="wb-field">Logo<select value={document.logoId} onChange={e => update({ logoId: e.target.value })}><option value="">Use business name</option>{document.assets.filter(a => a.mime.startsWith('image/')).map(a => <option key={a.id} value={a.id}>{a.name}</option>)}</select></label>
        {document.assets.length > 0 && <div className="wb-assets">{document.assets.map(asset => <div key={asset.id}>{asset.mime.startsWith('image/') && <img alt={asset.name} src={`data:${asset.mime};base64,${asset.data}`} />}<span>{asset.name}</span><button type="button" aria-label={`Remove ${asset.name}`} onClick={() => { const pages = Object.fromEntries(PAGE_KEYS.map(key => [key, document.pages[key].map(s => ({ ...s, imageId: s.imageId === asset.id ? '' : s.imageId }))])) as SiteDocument['pages']; update({ assets: document.assets.filter(a => a.id !== asset.id), logoId: document.logoId === asset.id ? '' : document.logoId, fontId: document.fontId === asset.id ? '' : document.fontId, font: document.fontId === asset.id ? 'sans' : document.font, pages }); }}>Remove</button></div>)}</div>}
        <details><summary>Business & contact details</summary>{Object.entries(document.brief).map(([key, value]) => <label key={key} className="wb-field">{({ businessName: 'Business name', niche: 'Niche', audience: 'Audience', goal: 'Goal', tone: 'Style', services: 'Services', location: 'Location', about: 'About', email: 'Public email', phone: 'Public phone' } as Record<string, string>)[key]}<input maxLength={key === 'about' || key === 'services' ? 2000 : 300} value={value} onChange={e => update({ brief: { ...document.brief, [key]: e.target.value } })} /></label>)}</details>
        <hr /><h3>{PAGE_NAMES[page]} sections</h3>
        {document.pages[page].map((section, index) => <details className="wb-section" key={section.id} open={index === 0}><summary>{section.title || 'Untitled section'}</summary><label className="wb-field">Heading<input maxLength={180} value={section.title} onChange={e => editSection(section.id, { title: e.target.value })} /></label><label className="wb-field">Text<textarea rows={5} maxLength={4000} value={section.body} onChange={e => editSection(section.id, { body: e.target.value })} /></label><label className="wb-field">Section style<select value={section.kind} onChange={e => editSection(section.id, { kind: e.target.value as Section['kind'] })}>{['hero', 'text', 'services', 'testimonials', 'cta'].map(v => <option key={v}>{v}</option>)}</select></label><label className="wb-field">Image<select value={section.imageId} onChange={e => editSection(section.id, { imageId: e.target.value })}><option value="">No image</option>{document.assets.filter(a => a.mime.startsWith('image/')).map(a => <option key={a.id} value={a.id}>{a.name}</option>)}</select></label><div className="wb-actions"><button disabled={index === 0} onClick={() => moveSection(index, -1)} aria-label="Move section up">↑</button><button disabled={index === document.pages[page].length - 1} onClick={() => moveSection(index, 1)} aria-label="Move section down">↓</button><button disabled={document.pages[page].length === 1} onClick={() => update({ pages: { ...document.pages, [page]: document.pages[page].filter(s => s.id !== section.id) } })}>Remove section</button></div></details>)}
        <button className="admin-outline-button" disabled={document.pages[page].length >= 12} onClick={() => update({ pages: { ...document.pages, [page]: [...document.pages[page], { id: crypto.randomUUID(), kind: 'text', title: 'New section', body: 'Add your content here.', imageId: '' }] } })}>+ Add section</button>
        <hr /><h3>Ask AI for a change</h3><label className="wb-field">Instructions<textarea rows={4} value={prompt} maxLength={1500} placeholder="Add a testimonials section to the home page" onChange={e => setPrompt(e.target.value)} /></label><button className="admin-primary-button" disabled={!prompt.trim()} onClick={() => action('ai', { prompt, document }, 'AI is updating your draft…')}>Update draft with AI</button><p className="wb-help">AI edits are saved as a new version, never published automatically. Only page content is sent to the model—not uploads, CRM records or credentials. Review all wording before publishing.</p>
      </fieldset></div><div className="wb-preview-area"><div className="wb-preview-toolbar"><div role="tablist" aria-label="Preview page">{PAGE_KEYS.map(key => <button key={key} role="tab" aria-selected={page === key} className={page === key ? 'active' : ''} onClick={() => setPage(key)}>{PAGE_NAMES[key]}</button>)}</div><div><button aria-pressed={device === 'desktop'} onClick={() => setDevice('desktop')}>Desktop</button><button aria-pressed={device === 'mobile'} onClick={() => setDevice('mobile')}>Mobile</button></div></div><div className="wb-preview-scroll"><iframe title={`${PAGE_NAMES[page]} ${device} preview`} sandbox="" referrerPolicy="no-referrer" srcDoc={preview} className={`wb-preview ${device}`} /></div><p className="wb-help">Preview is isolated from the CRM. Use the page tabs above to navigate.</p></div></div>
    </> : !busy && <div className="wb-site-grid">{sites.length === 0 ? <section className="wb-empty"><h3>Your first website starts with a few questions.</h3><p>Tell us about the business, its customers and the result you want.</p><button className="admin-primary-button" onClick={begin}>Start the brief →</button></section> : sites.map(item => <button className="wb-site-card" key={item.id} onClick={() => open(item.id)}><span className="wb-step">{item.published_revision === null ? 'Draft' : 'Published'}</span><h3>{item.name}</h3><p>Home · About · Services · Contact</p><small>{item.project_id ? 'Isolated GitHub + Vercel hosting' : 'Hosting setup pending'}</small><strong>Open website →</strong></button>)}</div>}
  </div>;
}
