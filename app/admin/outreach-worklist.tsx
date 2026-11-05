"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { followUpSequence, type OutreachLead, type OutreachLeadStats } from "../../lib/crm/outreach";
import { leadDisplayName, outreachBucket, outreachViews, whatsAppLink, type OutreachView } from "../../lib/crm/outreach-worklist";
import "./outreach-worklist.css";

const dates = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/London", day: "numeric", month: "short" });
const dateLabel = (value: string | null | undefined) => value && Number.isFinite(Date.parse(value)) ? dates.format(new Date(value)) : "—";

export function OutreachWorklist({ leads, allLeads, stats, now, view, onChangeView, onSelect }: {
  leads: OutreachLead[]; allLeads: OutreachLead[]; stats: Map<string, OutreachLeadStats>; now: Date; view: OutreachView;
  onChangeView: (view: OutreachView) => void; onSelect: (id: string, trigger: HTMLButtonElement) => void;
}) {
  const counts: Partial<Record<OutreachView, number>> = { all: allLeads.length };
  const buckets = new Map(allLeads.map(lead => {
    const bucket = outreachBucket(lead, stats.get(lead.id), now);
    counts[bucket] = (counts[bucket] || 0) + 1;
    return [lead.id, bucket] as const;
  }));
  const visible = leads.filter(lead => view === "all" || buckets.get(lead.id) === view).sort((a,b) => {
    const aDue = followUpSequence(stats.get(a.id), a.status, now), bDue = followUpSequence(stats.get(b.id), b.status, now);
    const priority = Number(bDue.status === "due") - Number(aDue.status === "due");
    if (priority) return priority;
    if (aDue.status === "due" && bDue.status === "due") return Date.parse(aDue.dueAt!) - Date.parse(bDue.dueAt!);
    return leadDisplayName(a.business_name).localeCompare(leadDisplayName(b.business_name));
  });
  return <>
    <nav className="outreach-view-tabs" aria-label="Lead work queues">{outreachViews.map(item => <button key={item.value} aria-pressed={view === item.value} onClick={() => onChangeView(item.value)}>{item.label}<span>{counts[item.value] || 0}</span></button>)}</nav>
    <p className="outreach-result-count" role="status">{visible.length} of {allLeads.length} leads shown · Open a lead to log outreach, see drafts and review history.</p>
    <div className="outreach-table-wrap"><table className="outreach-lead-table"><caption className="outreach-visually-hidden">Outreach leads and next actions</caption><thead><tr><th scope="col">Business</th><th scope="col">Outreach status</th><th scope="col">Last outreach</th><th scope="col">Next action</th><th scope="col">Tries</th><th scope="col">Action</th></tr></thead><tbody>{visible.map(lead => {
      const record = stats.get(lead.id), bucket = buckets.get(lead.id) || "new", sequence = followUpSequence(record, lead.status, now);
      const name = leadDisplayName(lead.business_name);
      return <tr key={lead.id}><th scope="row"><span className="outreach-business-name">{name}</span><small>{lead.main_location || "Location not listed"}</small><small>{lead.phone || lead.email || "No contact details"}</small></th><td data-label="Status"><span className={`outreach-state ${bucket}`}>{outreachViews.find(item => item.value === bucket)?.label}</span></td><td data-label="Last outreach">{dateLabel(record?.lastOutreachAt)}</td><td data-label="Next action"><strong>{bucket === "new" ? (lead.next_action || "First outreach") : bucket === "replied" ? "Review their reply" : bucket === "booked" ? "Prepare for meeting" : bucket === "closed" ? "No further follow-up" : sequence.status === "waiting" ? "Wait for a reply" : sequence.label}</strong>{sequence.dueAt && !["booked","replied","closed"].includes(bucket) ? <small>{sequence.status === "waiting" ? "Review" : "Due"} {dateLabel(sequence.dueAt)}</small> : null}</td><td data-label="Attempts">{record?.attempts || 0}</td><td data-label="Action"><button className="admin-outline-button outreach-open-button" aria-label={`Open lead ${name}`} onClick={event => onSelect(lead.id, event.currentTarget)}>Open lead →</button></td></tr>;
    })}</tbody></table></div>
    {!visible.length ? <div className="admin-empty-state compact"><strong>No leads in this view</strong><p>Choose another queue or clear your search and filters.</p><button className="admin-outline-button" onClick={() => onChangeView("all")}>Show all leads</button></div> : null}
  </>;
}

export function OutreachLeadDrawer({ lead, children, onClose, disabled, returnFocus }: { lead: OutreachLead; children: ReactNode; onClose: () => void; disabled: boolean; returnFocus: HTMLButtonElement | null }) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const element = dialog.current;
    const previousOverflow = document.body.style.overflow;
    element?.showModal(); document.body.style.overflow = "hidden";
    return () => {
      element?.close(); document.body.style.overflow = previousOverflow;
      const target = returnFocus?.isConnected ? returnFocus : document.querySelector<HTMLButtonElement>(".outreach-view-tabs [aria-pressed=true]");
      target?.focus({ preventScroll: true });
    };
  }, [returnFocus]);
  const link = whatsAppLink(lead.phone);
  const callNumber = lead.phone?.replace(/[^+\d]/g, "");
  return <dialog ref={dialog} className="outreach-lead-dialog" aria-labelledby="outreach-lead-title" onCancel={event => { event.preventDefault(); if (!disabled) onClose(); }} onClick={event => {
    const bounds = event.currentTarget.getBoundingClientRect();
    if (event.target === event.currentTarget && event.clientX < bounds.left && !disabled) onClose();
  }} onKeyDown={event => {
    if (event.key !== "Tab") return;
    const controls = Array.from(event.currentTarget.querySelectorAll<HTMLElement>("a[href],button:not(:disabled),input:not(:disabled),select:not(:disabled),textarea:not(:disabled),summary")).filter(control => control.getClientRects().length > 0);
    const first = controls[0], last = controls.at(-1);
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
    if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
  }}>
    <header className="outreach-drawer-heading"><div><span className="admin-section-kicker">Lead workspace</span><h2 id="outreach-lead-title">{leadDisplayName(lead.business_name)}</h2><p>{lead.main_location || "Location not listed"}</p></div><button autoFocus disabled={disabled} className="admin-icon-button" aria-label="Close lead workspace" onClick={onClose}>×</button></header>
    <div className="outreach-drawer-contacts">{callNumber ? <a href={`tel:${callNumber}`}>Call {lead.phone}</a> : null}{lead.email ? <a href={`mailto:${lead.email}`}>{lead.email}</a> : null}{link ? <a className="outreach-whatsapp-link" href={link} target="_blank" rel="noopener noreferrer">Open WhatsApp ↗</a> : <span>WhatsApp needs a valid phone number.</span>}</div>
    <p className="outreach-whatsapp-help">WhatsApp opens in your app or browser. Log the message after sending; opening it does not count as outreach. Use it for contacts who have agreed to hear from HBS on WhatsApp.</p>
    <div className="outreach-drawer-content">{children}</div>
  </dialog>;
}

