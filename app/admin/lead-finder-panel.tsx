"use client";

import { FormEvent, useEffect, useState } from "react";
import { defaultProfile, type IdealCustomerProfile, type Prospect } from "../../lib/leads/ideal-customer";
import { Icon } from "./admin-ui";

type ManualBusiness = { name: string; sector: string; location: string; website: string; email: string; phone: string; sourceUrl: string };
const blankBusiness: ManualBusiness = { name: "", sector: "", location: "", website: "", email: "", phone: "", sourceUrl: "" };
const errors: Record<string, string> = {
  AUTH_REQUIRED: "Please sign in again to use Lead Finder.", ADMIN_ACCESS_REQUIRED: "You do not have admin access.", READ_ONLY_ACCESS: "Your role can view this profile but cannot change it.",
  PROFILE_UNAVAILABLE: "The Lead Finder profile is not available yet. Check that the database setup has been completed.", PROFILE_SAVE_FAILED: "The profile could not be saved. Please try again.",
  LOCATION_REQUIRED: "Add a UK town or area to find businesses.", SEARCH_NOT_CONFIGURED: "Business search needs its server-side search key. You can still review a business manually.",
  SEARCH_LIMIT_REACHED: "The search provider's request limit has been reached. Please try later.", SEARCH_PROVIDER_FAILED: "Business search is temporarily unavailable.", SEARCH_PROVIDER_UNAVAILABLE: "Business search could not be reached. Please try again.",
  DUPLICATE_CHECK_FAILED: "Existing CRM records could not be checked. No lead was added.", PROSPECT_ALREADY_EXISTS: "This business is already in Leads or Clients.",
  INVALID_PROSPECT: "Enter a business name of at least two characters.", LEAD_SAVE_FAILED: "The business could not be added to Pipeline. Please try again.",
};

async function post(action: string, payload: Record<string, unknown>) {
  const response = await fetch("/api/admin/lead-generator", { method: "POST", headers: { "Content-Type": "application/json" }, credentials: "same-origin", body: JSON.stringify({ action, ...payload }) });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(errors[data.error] || "That action could not be completed. Please try again.");
  return data;
}

export default function LeadFinderPanel({ onOpenPipeline }: { onOpenPipeline: () => void }) {
  const [profile, setProfile] = useState<IdealCustomerProfile>(defaultProfile);
  const [manual, setManual] = useState<ManualBusiness>(blankBusiness);
  const [results, setResults] = useState<Prospect[]>([]);
  const [selected, setSelected] = useState<Prospect | null>(null);
  const [searchConfigured, setSearchConfigured] = useState(false);
  const [canEdit, setCanEdit] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  useEffect(() => {
    let active = true;
    fetch("/api/admin/lead-generator", { cache: "no-store" }).then(async (response) => {
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(errors[data.error] || "Lead Finder could not be loaded.");
      if (active) { setProfile(data.profile); setSearchConfigured(data.searchConfigured); setCanEdit(data.canEdit); }
    }).catch((cause) => { if (active) setError(cause.message); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  const saveProfile = async () => {
    const data = await post("save_profile", { profile });
    setProfile(data.profile);
  };

  const handleProfile = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); setError(""); setSuccess(""); setBusy("save");
    try { await saveProfile(); setSuccess("Ideal customer profile saved for the HBS workspace."); }
    catch (cause) { setError((cause as Error).message); }
    finally { setBusy(""); }
  };

  const findBusinesses = async () => {
    setError(""); setSuccess(""); setBusy("search"); setResults([]); setSelected(null);
    try {
      await saveProfile();
      const data = await post("search", {});
      setResults(data.results || []);
      setSuccess(data.results?.length ? `${data.results.length} business listings found. Review each one before adding it to Pipeline.` : "No matching business listings were returned. Try a broader sector or a different town.");
    } catch (cause) { setError((cause as Error).message); }
    finally { setBusy(""); }
  };

  const reviewManual = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); setError(""); setSuccess(""); setBusy("review");
    try {
      await saveProfile();
      const data = await post("review", { candidate: { ...manual, country: "GB", source: "Manual review" } });
      setSelected(data.prospect);
      setSuccess("Business ready for your review. Check the details before adding it to Pipeline.");
    } catch (cause) { setError((cause as Error).message); }
    finally { setBusy(""); }
  };

  const addLead = async () => {
    if (!selected || selected.duplicate) return;
    setError(""); setSuccess(""); setBusy("add");
    try {
      const data = await post("save_lead", { candidate: selected });
      setResults((value) => value.map((candidate) => candidate.name === selected.name ? { ...candidate, duplicate: true } : candidate));
      setSelected({ ...selected, duplicate: true });
      setSuccess(`${data.lead.business_name} was added to Pipeline as a new lead. No message was sent to the business.`);
    } catch (cause) { setError((cause as Error).message); }
    finally { setBusy(""); }
  };

  return <div className="admin-lead-finder">
    <section className="admin-panel admin-lead-intro"><div><span className="admin-section-kicker">HBS sales workspace</span><h2>Find businesses that fit HBS</h2><p>Search public UK business listings, compare them with your ideal customer profile, then choose which ones enter your pipeline. Match scores reflect listing details—not website quality or buying intent.</p></div><button type="button" className="admin-outline-button" onClick={onOpenPipeline}>Open Pipeline <Icon name="arrow-up-right" size={15} /></button></section>
    {loading ? <div className="admin-panel admin-crm-loading" aria-busy="true">Loading Lead Finder…</div> : <>
      {error ? <div className="admin-lead-alert error" role="alert">{error}</div> : null}
      {success ? <div className="admin-lead-alert success" role="status">{success}</div> : null}
      <form className="admin-panel admin-lead-profile" onSubmit={handleProfile}>
        <div className="admin-panel-heading"><div><span className="admin-section-kicker">Targeting</span><h3>HBS ideal customer profile</h3></div></div>
        <p>Start with the businesses HBS most wants to help. Change this profile whenever your focus changes.</p>
        <div className="admin-lead-fields">
          <label>Business type or sector<input value={profile.sector} maxLength={80} required disabled={!canEdit || Boolean(busy)} onChange={(event) => setProfile({ ...profile, sector: event.target.value })} placeholder="e.g. Mobile mechanics" /></label>
          <label>UK town or area<input value={profile.location} maxLength={100} disabled={!canEdit || Boolean(busy)} onChange={(event) => setProfile({ ...profile, location: event.target.value })} placeholder="e.g. Manchester" /></label>
          <label>Primary opportunity<select value={profile.goal} disabled={!canEdit || Boolean(busy)} onChange={(event) => setProfile({ ...profile, goal: event.target.value as IdealCustomerProfile["goal"] })}><option value="enquiries">More customer enquiries</option><option value="website">New or improved website</option><option value="visibility">Better online visibility</option><option value="automation">Business automation</option></select></label>
          <label>Website listing<select value={profile.websitePreference} disabled={!canEdit || Boolean(busy)} onChange={(event) => setProfile({ ...profile, websitePreference: event.target.value as IdealCustomerProfile["websitePreference"] })}><option value="any">With or without a listed website</option><option value="missing">No website listed</option><option value="present">Website listed</option></select></label>
        </div>
        <div className="admin-lead-actions"><button type="submit" className="admin-outline-button" disabled={!canEdit || Boolean(busy)}>{busy === "save" ? "Saving…" : "Save profile"}</button><button type="button" className="admin-primary-button" disabled={!canEdit || Boolean(busy) || !searchConfigured} onClick={findBusinesses}><Icon name="search" size={15} />{busy === "search" ? "Finding businesses…" : "Find businesses"}</button></div>
        {!searchConfigured ? <p className="admin-lead-setup">Automatic business search is not connected yet. An owner needs to add a server-side Brave Search API key in Vercel. Manual review below works now.</p> : null}
      </form>

      <section className="admin-panel admin-lead-results"><div className="admin-panel-heading"><div><span className="admin-section-kicker">Public listings</span><h3>Businesses to review</h3></div><span className="admin-lead-count">{results.length} found</span></div>
        {results.length ? <div className="admin-lead-result-grid">{results.map((candidate, index) => <article className="admin-lead-result" key={`${candidate.name}-${candidate.location}-${index}`}><div className="admin-lead-result-top"><div><strong>{candidate.name}</strong><small>{candidate.sector} · {candidate.location || "Location not listed"}</small></div><span className="admin-lead-score">{candidate.score}/100 match</span></div><p>{candidate.reasons.join(" · ") || "Limited listing information—research before outreach."}</p><div className="admin-lead-result-bottom"><span className={candidate.duplicate ? "admin-lead-duplicate" : "admin-lead-new"}>{candidate.duplicate ? "Already in CRM" : "Not in CRM"}</span><button type="button" className="admin-outline-button" onClick={() => { setSelected(candidate); setError(""); setSuccess(""); }}>Review details</button></div></article>)}</div> : <div className="admin-empty-state compact"><span><Icon name="search" size={18} /></span><strong>No search results yet</strong><p>Set a town and sector above, then find businesses.</p></div>}
      </section>

      <form className="admin-panel admin-lead-manual" onSubmit={reviewManual}><div className="admin-panel-heading"><div><span className="admin-section-kicker">Already know a business?</span><h3>Review a business manually</h3></div></div><p>Enter public business details you already have. A contact email is optional; HBS can research it later.</p><div className="admin-lead-fields">
        <label>Business name<input value={manual.name} required minLength={2} maxLength={200} disabled={!canEdit || Boolean(busy)} onChange={(event) => setManual({ ...manual, name: event.target.value })} /></label>
        <label>Sector<input value={manual.sector} maxLength={100} disabled={!canEdit || Boolean(busy)} onChange={(event) => setManual({ ...manual, sector: event.target.value })} /></label>
        <label>Town or area<input value={manual.location} maxLength={100} disabled={!canEdit || Boolean(busy)} onChange={(event) => setManual({ ...manual, location: event.target.value })} /></label>
        <label>Website<input value={manual.website} type="text" maxLength={500} disabled={!canEdit || Boolean(busy)} onChange={(event) => setManual({ ...manual, website: event.target.value })} placeholder="example.co.uk" /></label>
        <label>Public contact email<input value={manual.email} type="email" maxLength={320} disabled={!canEdit || Boolean(busy)} onChange={(event) => setManual({ ...manual, email: event.target.value })} /></label>
        <label>Public contact phone<input value={manual.phone} type="tel" maxLength={50} disabled={!canEdit || Boolean(busy)} onChange={(event) => setManual({ ...manual, phone: event.target.value })} /></label>
        <label className="admin-lead-wide">Public listing or source URL<input value={manual.sourceUrl} type="text" maxLength={500} disabled={!canEdit || Boolean(busy)} onChange={(event) => setManual({ ...manual, sourceUrl: event.target.value })} placeholder="Where you found the business" /></label>
      </div><button className="admin-outline-button" type="submit" disabled={!canEdit || Boolean(busy)}>{busy === "review" ? "Checking…" : "Review business"}</button></form>

      {selected ? <section className="admin-panel admin-lead-review" aria-label="Selected business review"><div className="admin-panel-heading"><div><span className="admin-section-kicker">Final review</span><h3>{selected.name}</h3></div><button type="button" className="admin-outline-button" onClick={() => setSelected(null)} aria-label="Close business review"><Icon name="x" size={15} /></button></div><div className="admin-lead-review-grid"><div><span>Profile match</span><strong>{selected.score}/100</strong></div><div><span>Sector</span><strong>{selected.sector}</strong></div><div><span>Location</span><strong>{selected.location || "Not listed"}</strong></div><div><span>Public contact</span><strong>{selected.email || selected.phone || "Not listed"}</strong></div></div><p>{selected.reasons.join(" · ") || "Limited listing information. Verify before outreach."}</p><div className="admin-lead-links">{selected.website ? <a href={selected.website} target="_blank" rel="noopener noreferrer">Business website <Icon name="external" size={13} /></a> : null}{selected.sourceUrl ? <a href={selected.sourceUrl} target="_blank" rel="noopener noreferrer">Listing source <Icon name="external" size={13} /></a> : null}</div><div className="admin-lead-actions"><button type="button" className="admin-primary-button" disabled={!canEdit || Boolean(busy) || selected.duplicate} onClick={addLead}>{busy === "add" ? "Adding…" : selected.duplicate ? "Already in CRM" : "Add to Pipeline"}</button><span>No emails are sent automatically.</span></div></section> : null}
    </>}
  </div>;
}
