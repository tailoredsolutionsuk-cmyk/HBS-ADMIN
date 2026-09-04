import { type OutputFile } from './model.ts';

export function domainName(value: string) {
  const name = value.trim().toLowerCase();
  if (name.length > 253 || !/^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/.test(name)) throw new Error('Enter only a valid domain name, without https:// or a path.');
  if (['hbsmarketing.online', 'hbsmarketing.co.uk', 'vercel.app', 'supabase.co', 'localhost'].some(protectedName => name === protectedName || name.endsWith(`.${protectedName}`))) throw new Error('The CRM, marketing site and platform domains cannot be reassigned.');
  return name;
}
export function allowedOrigin(origin: string | null, liveUrl: string | null, customDomain: string | null, verified: boolean) {
  if (!origin || !liveUrl) return false;
  try {
    const parsed = new URL(origin);
    if (parsed.protocol !== 'https:' || parsed.origin !== origin) return false;
    return origin === new URL(liveUrl).origin || (verified && Boolean(customDomain) && parsed.hostname === customDomain && !parsed.port);
  } catch { return false; }
}
export function parseEnquiry(value: Record<string, unknown>) {
  const field = (key: string, max: number, required = true) => {
    if (typeof value[key] !== 'string' || (value[key] as string).length > max || (required && !(value[key] as string).trim())) throw new Error('Please complete the form using valid contact details.');
    return (value[key] as string).trim();
  };
  const name = field('name', 120), email = field('email', 254), phone = field('phone', 40, false), message = field('message', 2000);
  if (!/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(email) || value.consent !== true) throw new Error('Enter a valid email and agree to share your enquiry with the business.');
  if (!/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(String(value.submissionId))) throw new Error('Please reload the contact form.');
  return { name, email, phone, message, submissionId: String(value.submissionId) };
}
export function connectedFiles(files: OutputFile[], siteId: string, origin: string): OutputFile[] {
  if (!/^[a-f0-9-]{36}$/.test(siteId)) throw new Error('Invalid website ID.');
  const url = new URL(origin);
  if (url.protocol !== 'https:' || url.origin !== origin || url.username || url.password) throw new Error('Configure a valid HTTPS builder origin.');
  const endpoint = `${origin}/api/websites/${siteId}`;
  const form = `<section><h2>Send an enquiry</h2><form id="enquiry"><label>Your name<input name="name" autocomplete="name" maxlength="120" required></label><label>Email<input name="email" type="email" autocomplete="email" maxlength="254" required></label><label>Phone (optional)<input name="phone" autocomplete="tel" maxlength="40"></label><label>How can we help?<textarea name="message" maxlength="2000" rows="5" required></textarea></label><label style="display:none" aria-hidden="true">Leave empty<input name="company_website" tabindex="-1" autocomplete="off"></label><label><input name="consent" type="checkbox" required> I agree to share these details with this business so it can respond to my enquiry.</label><button class="button" type="submit" disabled>Loading secure form…</button><p id="enquiry-status" role="status">Forms work on the published website, not preview deployments.</p></form><p>Enquiries are securely stored by HBS on behalf of this business. We record aggregate page views without analytics cookies. Contact the business using the details above about your information.</p></section>`;
  const style = '<style>#enquiry{max-width:620px}#enquiry label{display:block;margin:16px 0}#enquiry input:not([type=checkbox]),#enquiry textarea{display:block;width:100%;padding:12px;border:1px solid #aaa;border-radius:6px;font:inherit}#enquiry .button{border:0;cursor:pointer}#enquiry button:disabled{opacity:.6}</style>';
  const script: OutputFile = { file: 'hbs-runtime.js', encoding: 'utf-8', data: `"use strict";(()=>{const base=${JSON.stringify(endpoint)};const page=({"index.html":"home","about.html":"about","services.html":"services","contact.html":"contact"})[location.pathname.split('/').pop()||'index.html']||'home';if(navigator.doNotTrack!=="1")fetch(base+"/events",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({page}),credentials:"omit",keepalive:true}).catch(()=>{});const form=document.getElementById("enquiry");if(!form)return;const button=form.querySelector("button"),status=document.getElementById("enquiry-status");let token="",submissionId=crypto.randomUUID();fetch(base+"/contact",{credentials:"omit"}).then(r=>{if(!r.ok)throw Error();return r.json()}).then(data=>{token=data.token;setTimeout(()=>{button.disabled=false;button.textContent="Send enquiry";status.textContent=""},3000)}).catch(()=>{button.textContent="Form unavailable";status.textContent="Please use the email or phone above. Forms activate after publishing."});form.addEventListener("submit",async event=>{event.preventDefault();if(!form.reportValidity()||!token)return;button.disabled=true;status.textContent="Sending…";const data=Object.fromEntries(new FormData(form));try{const r=await fetch(base+"/contact",{method:"POST",headers:{"Content-Type":"application/json"},credentials:"omit",body:JSON.stringify({...data,consent:data.consent==="on",token,submissionId})});const result=await r.json();if(!r.ok)throw Error(result.error||"Please try again.");form.reset();status.textContent="Thank you. Your enquiry has been sent.";button.textContent="Enquiry sent";token=""}catch(error){status.textContent=error.message||"Could not send. Please use our email or phone.";button.disabled=false}})})();` };
  return [...files.map(file => file.file.endsWith('.html') ? { ...file, data: file.data.replace('</head>', `${style}</head>`).replace('</main>', `${file.file === 'contact.html' ? form : ''}</main>`).replace('</body>', '<script src="hbs-runtime.js" defer></script></body>') } : file), script,
    { file: 'robots.txt', encoding: 'utf-8', data: 'User-agent: *\nAllow: /\n' },
    { file: 'hbs-site.json', encoding: 'utf-8', data: JSON.stringify({ siteId }) }];
}
