// Shared data-only model. No credentials, repository paths or executable code.
export const PAGE_KEYS = ['home', 'about', 'services', 'contact'] as const;
export type PageKey = typeof PAGE_KEYS[number];
export const PAGE_NAMES: Record<PageKey, string> = { home: 'Home', about: 'About', services: 'Services', contact: 'Contact' };
export type Section = { id: string; kind: 'hero' | 'text' | 'services' | 'testimonials' | 'cta'; title: string; body: string; imageId: string };
export type Asset = { id: string; name: string; mime: 'image/png' | 'image/jpeg' | 'image/webp' | 'font/woff2'; data: string };
export type Brief = { businessName: string; niche: string; audience: string; goal: string; tone: string; services: string; location: string; about: string; email: string; phone: string };
export type SiteDocument = { brief: Brief; primary: string; accent: string; font: 'sans' | 'serif' | 'mono' | 'uploaded'; logoId: string; fontId: string; assets: Asset[]; pages: Record<PageKey, Section[]> };
export const EMPTY_BRIEF: Brief = { businessName: '', niche: '', audience: '', goal: 'Get enquiries', tone: 'Clean and professional', services: '', location: '', about: '', email: '', phone: '' };
export const MAX_DOCUMENT_BYTES = 2_800_000;
export class DocumentError extends Error {}
const sectionKinds = ['hero', 'text', 'services', 'testimonials', 'cta'];
const idPattern = /^[a-zA-Z0-9-]{1,80}$/;

function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new DocumentError('Invalid website data.');
  return value as Record<string, unknown>;
}
function text(value: unknown, max = 2000): string {
  if (typeof value !== 'string' || value.length > max) throw new DocumentError(`Text must be under ${max} characters.`);
  return value.trim();
}
export function parseBrief(value: unknown): Brief {
  const input = object(value);
  const brief = Object.fromEntries(Object.keys(EMPTY_BRIEF).map(key => [key, text(input[key], key === 'about' || key === 'services' ? 2000 : 300)])) as Brief;
  if (!brief.businessName || !brief.niche || !brief.audience || !brief.services) throw new DocumentError('Tell us the business name, niche, audience and services.');
  if (brief.email && !/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(brief.email)) throw new DocumentError('Enter a valid public contact email.');
  if (brief.phone && !/^[+\d ()-]{5,40}$/.test(brief.phone)) throw new DocumentError('Enter a valid public phone number.');
  return brief;
}
export function parseDocument(value: unknown): SiteDocument {
  if (JSON.stringify(value ?? null).length > MAX_DOCUMENT_BYTES) throw new DocumentError('This website is too large. Keep uploads below 2 MB in total.');
  const input = object(value);
  const brief = parseBrief(input.brief);
  const primary = text(input.primary, 7), accent = text(input.accent, 7);
  if (![primary, accent].every(color => /^#[\da-f]{6}$/i.test(color))) throw new DocumentError('Choose valid brand colours.');
  if (!['sans', 'serif', 'mono', 'uploaded'].includes(String(input.font))) throw new DocumentError('Choose a supported font.');
  if (!Array.isArray(input.assets) || input.assets.length > 8) throw new DocumentError('Upload at most eight images or fonts.');
  const assetIds = new Set<string>();
  const assets: Asset[] = input.assets.map(item => {
    const a = object(item); const id = text(a.id, 80); const name = text(a.name, 100); const data = text(a.data, 1_050_000);
    if (!idPattern.test(id) || assetIds.has(id)) throw new DocumentError('Invalid upload ID.');
    assetIds.add(id);
    if (!/^[A-Za-z0-9+/]+={0,2}$/.test(data) || data.length % 4 !== 0) throw new DocumentError('Invalid upload encoding.');
    const mime = String(a.mime) as Asset['mime'];
    const magic = { 'image/png': /^iVBORw0KGgo/, 'image/jpeg': /^\/9j\//, 'image/webp': /^UklGR/, 'font/woff2': /^d09GMg/ }[mime];
    if (!magic || !magic.test(data)) throw new DocumentError('Use a PNG, JPEG, WebP image or WOFF2 font.');
    return { id, name, mime, data };
  });
  const imageIds = new Set(assets.filter(a => a.mime.startsWith('image/')).map(a => a.id));
  const logoId = text(input.logoId, 80), fontId = text(input.fontId, 80);
  if (logoId && !imageIds.has(logoId)) throw new DocumentError('Choose an uploaded logo.');
  if (fontId && !assets.some(a => a.id === fontId && a.mime === 'font/woff2')) throw new DocumentError('Choose an uploaded WOFF2 font.');
  if (input.font === 'uploaded' && !fontId) throw new DocumentError('Upload a font first.');
  const source = object(input.pages);
  const pages = {} as SiteDocument['pages'];
  for (const key of PAGE_KEYS) {
    const list = source[key];
    if (!Array.isArray(list) || list.length < 1 || list.length > 12) throw new DocumentError('Each of the four pages needs 1–12 sections.');
    const ids = new Set<string>();
    pages[key] = list.map(value => {
      const s = object(value); const id = text(s.id, 80), kind = text(s.kind, 20), imageId = text(s.imageId, 80);
      if (!idPattern.test(id) || ids.has(id) || !sectionKinds.includes(kind)) throw new DocumentError('Invalid page section.');
      ids.add(id);
      if (imageId && !imageIds.has(imageId)) throw new DocumentError('A section references a missing image.');
      return { id, kind: kind as Section['kind'], title: text(s.title, 180), body: text(s.body, 4000), imageId };
    });
  }
  return { brief, primary, accent, font: input.font as SiteDocument['font'], logoId, fontId, assets, pages };
}
export function createDocument(brief: Brief): SiteDocument {
  const section = (id: string, kind: Section['kind'], title: string, body: string): Section => ({ id, kind, title, body, imageId: '' });
  const themes: Record<string, { primary: string; accent: string; font: string }> = {
    'Clean and professional': { primary: '#253b32', accent: '#df7152', font: 'sans' },
    'Warm and approachable': { primary: '#654831', accent: '#dc995a', font: 'sans' },
    'Bold and contemporary': { primary: '#24243f', accent: '#8174f2', font: 'sans' },
    'Elegant and established': { primary: '#293d50', accent: '#b99352', font: 'serif' },
  };
  return parseDocument({ brief, ...(themes[brief.tone] || themes['Clean and professional']), logoId: '', fontId: '', assets: [], pages: {
    home: [section('welcome', 'hero', `${brief.niche} for ${brief.audience}`.slice(0, 180), brief.about || `${brief.businessName} offers ${brief.services}${brief.location ? ` in ${brief.location}` : ''}.`), section('services', 'services', 'How we can help', brief.services), section('contact', 'cta', 'Let’s talk about what you need', 'Get in touch to discuss the right service for you.')],
    about: [section('about', 'hero', `About ${brief.businessName}`.slice(0, 180), brief.about || `We provide ${brief.services} for ${brief.audience}.`), section('approach', 'text', 'Our approach', 'Tell visitors what makes your business different. Add your experience, values and approach here.')],
    services: [section('intro', 'hero', 'Our services', `Explore the services offered by ${brief.businessName}.`), section('services', 'services', 'What we offer', brief.services)],
    contact: [section('contact', 'hero', 'Get in touch', brief.location ? `Serving ${brief.location}. Tell us how we can help.` : 'Tell us how we can help.')],
  } });
}
export function escapeHtml(value: string): string { return value.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!)); }
export function assetPath(asset: Asset): string { return `assets/${asset.id}.${{ 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp', 'font/woff2': 'woff2' }[asset.mime]}`; }
export function renderPage(doc: SiteDocument, page: PageKey, preview = false): string {
  const e = escapeHtml;
  const assetUrl = (id: string) => { const asset = doc.assets.find(a => a.id === id); return asset ? preview ? `data:${asset.mime};base64,${asset.data}` : assetPath(asset) : ''; };
  const font = { sans: 'Arial, sans-serif', serif: 'Georgia, serif', mono: 'monospace', uploaded: 'BrandFont, Arial, sans-serif' }[doc.font];
  const href = (path: string) => preview ? '#' : path;
  const callGoal = doc.brief.goal === 'Encourage phone calls' && doc.brief.phone;
  const ctaHref = href(callGoal ? `tel:${doc.brief.phone.replace(/[^+\d]/g, '')}` : doc.brief.goal === 'Explain our services' && page !== 'services' ? 'services.html' : 'contact.html');
  const ctaLabel = callGoal ? 'Call us →' : doc.brief.goal === 'Explain our services' && page !== 'services' ? 'Explore services →' : 'Get in touch →';
  const navigation = PAGE_KEYS.map(key => `<a ${key === page ? 'aria-current="page"' : ''} href="${href(`${key === 'home' ? 'index' : key}.html`)}">${PAGE_NAMES[key]}</a>`).join('');
  const sections = doc.pages[page].map((section, index) => `<section class="${section.kind}" id="${section.id}"><div class="section-copy">${index === 0 ? `<p class="eyebrow">${e(doc.brief.niche)}${doc.brief.location ? ` · ${e(doc.brief.location)}` : ''}</p>` : ''}<${index === 0 ? 'h1' : 'h2'}>${e(section.title)}</${index === 0 ? 'h1' : 'h2'}>${section.kind === 'services' ? `<ul class="services">${section.body.split(/\n|,/).filter(Boolean).map(s => `<li>${e(s.trim())}</li>`).join('')}</ul>` : `<p class="copy">${e(section.body)}</p>`}${['hero', 'cta'].includes(section.kind) && page !== 'contact' ? `<a class="button" href="${ctaHref}">${ctaLabel}</a>` : ''}</div>${section.imageId ? `<img class="section-image" src="${assetUrl(section.imageId)}" alt="${e(section.title)}" />` : ''}</section>`).join('');
  const contact = page === 'contact' ? `<section><h2>Contact details</h2>${doc.brief.email ? `<p><a href="${href(`mailto:${e(doc.brief.email)}`)}">${e(doc.brief.email)}</a></p>` : ''}${doc.brief.phone ? `<p><a href="${href(`tel:${e(doc.brief.phone.replace(/[^+\d]/g, ''))}`)}">${e(doc.brief.phone)}</a></p>` : ''}${!doc.brief.email && !doc.brief.phone ? '<p>Add your public contact email or phone before publishing.</p>' : ''}</section>` : '';
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="description" content="${e(`${doc.brief.businessName} — ${doc.brief.niche}. ${doc.brief.location}`)}"><title>${PAGE_NAMES[page]} | ${e(doc.brief.businessName)}</title><style>${doc.font === 'uploaded' ? `@font-face{font-family:BrandFont;src:url('${assetUrl(doc.fontId)}') format('woff2');font-display:swap}` : ''}
  *{box-sizing:border-box}body{margin:0;color:#202924;background:#fafbf8;font-family:${font};line-height:1.6}a{color:inherit;text-underline-offset:4px}header,main,footer{max-width:1180px;margin:auto;padding:28px 6vw}header{display:flex;align-items:center;justify-content:space-between;gap:24px;border-bottom:1px solid #ddd}nav{display:flex;gap:20px;flex-wrap:wrap;font-size:14px}nav a{text-decoration:none}nav a[aria-current]{font-weight:bold;border-bottom:2px solid ${doc.accent}}.brand{font-size:20px;font-weight:bold;text-decoration:none}.logo{max-width:180px;max-height:56px;object-fit:contain}section{padding:56px 0;display:block}section:has(.section-image){display:grid;grid-template-columns:1.1fr 1fr;gap:40px;align-items:center}.eyebrow{font-size:12px;letter-spacing:.13em;text-transform:uppercase;color:#52665a}h1{font-size:clamp(36px,6vw,72px);line-height:1.08;letter-spacing:-.045em;margin:16px 0 24px;color:${doc.primary}}h2{font-size:32px;line-height:1.2;color:${doc.primary}}.copy{max-width:700px;white-space:pre-wrap;font-size:18px;color:#526057}.button{display:inline-block;background:${doc.primary};color:#fff;padding:14px 22px;border-radius:8px;margin-top:18px;text-decoration:none;box-shadow:0 4px 0 ${doc.accent}}.services{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:16px;padding:0;list-style:none}.services li{padding:24px;border:1px solid #dfe5dd;border-top:3px solid ${doc.accent};border-radius:12px;background:#fff}.section-image{width:100%;max-height:540px;object-fit:cover;border-radius:20px}.cta{background:#eaf0e9;padding:36px;border-radius:20px}footer{font-size:13px;border-top:1px solid #ddd;color:#526057}@media(max-width:640px){header{align-items:flex-start;flex-direction:column}nav{gap:14px}section{padding:32px 0}section:has(.section-image){grid-template-columns:1fr}h2{font-size:27px}.cta{padding:24px}}@media(prefers-reduced-motion:reduce){*{scroll-behavior:auto}}
  </style></head><body><header><a class="brand" href="${href('index.html')}">${doc.logoId ? `<img class="logo" src="${assetUrl(doc.logoId)}" alt="${e(doc.brief.businessName)}">` : e(doc.brief.businessName)}</a><nav aria-label="Main navigation">${navigation}</nav></header><main>${sections}${contact}</main><footer>© ${new Date().getFullYear()} ${e(doc.brief.businessName)}. All rights reserved.</footer></body></html>`;
}
export type OutputFile = { file: string; data: string; encoding: 'utf-8' | 'base64' };
export function websiteFiles(document: SiteDocument): OutputFile[] {
  const doc = parseDocument(document);
  return [...PAGE_KEYS.map(page => ({ file: `${page === 'home' ? 'index' : page}.html`, data: renderPage(doc, page), encoding: 'utf-8' as const })), ...doc.assets.map(asset => ({ file: assetPath(asset), data: asset.data, encoding: 'base64' as const }))];
}
