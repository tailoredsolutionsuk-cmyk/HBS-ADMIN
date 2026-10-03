"use client";

import { useState } from "react";
import { guessColumns, importedBusiness, isBlockedSource, parseLeadCsv, type ColumnMap, type CsvTable } from "../../lib/leads/chrome-import";
import { publicWebsite } from "../../lib/leads/ideal-customer";

type Business = ReturnType<typeof importedBusiness>;
const fieldLabels: Record<keyof ColumnMap, string> = { name: "Business name", website: "Website", email: "Email", phone: "Phone", location: "Town or area", sector: "Sector" };
const importErrors: Record<string, string> = {
  CSV_TOO_LARGE: "The CSV is too large. Export up to 500 rows at a time (1 MB maximum).",
  CSV_TOO_MANY_ROWS: "This CSV has more than 500 businesses. Export a smaller batch.",
  CSV_INVALID: "This file does not look like a valid CSV with a header row and business records.",
};

export default function ChromeCsvImport({ canEdit, onSelect }: { canEdit: boolean; onSelect: (business: Business) => void }) {
  const [sourceUrl, setSourceUrl] = useState("");
  const [table, setTable] = useState<CsvTable | null>(null);
  const [columns, setColumns] = useState<ColumnMap | null>(null);
  const [error, setError] = useState("");
  const [permitted, setPermitted] = useState(false);
  const [chosen, setChosen] = useState<number | null>(null);

  const loadFile = async (file?: File) => {
    setError(""); setChosen(null); setTable(null);
    if (!file) return;
    if (file.size > 1_000_000 || !file.name.toLowerCase().endsWith(".csv")) { setError("Choose a CSV file smaller than 1 MB."); return; }
    try {
      const parsed = parseLeadCsv(await file.text());
      setTable(parsed);
      setColumns(guessColumns(parsed.headers));
    } catch (cause) { setError(importErrors[(cause as Error).message] || "The CSV could not be read."); }
  };

  const source = publicWebsite(sourceUrl);
  const sourceAllowed = Boolean(source) && !isBlockedSource(source);

  return <section className="admin-panel admin-lead-csv"><div className="admin-panel-heading"><div><span className="admin-section-kicker">Chrome workflow</span><h3>Import an Instant Data Scraper CSV</h3></div></div>
    <p>In Chrome, <a href="https://chromewebstore.google.com/detail/instant-data-scraper/ofaokhiedipichpaobibbnahnkdoiiah" target="_blank" rel="noopener noreferrer">open Instant Data Scraper</a>, use it only on a website that permits your intended use, and export a CSV. Choose the CSV below, map its columns, then review one business at a time. The file stays in this browser until you select a row; it is not bulk-uploaded.</p>
    <div className="admin-lead-fields"><label>Source website URL<input type="url" value={sourceUrl} onChange={(event) => setSourceUrl(event.target.value)} placeholder="https://permitted-directory.example" disabled={!canEdit} /></label><label>CSV file<input type="file" accept=".csv,text/csv" disabled={!canEdit} onChange={(event) => { void loadFile(event.target.files?.[0]); event.target.value = ""; }} /></label></div>
    {sourceUrl && !sourceAllowed ? <p className="admin-lead-csv-warning" role="alert">Enter the website where you collected this data. Google Maps and social-network exports are not accepted here.</p> : null}
    <label className="admin-lead-import-consent"><input type="checkbox" checked={permitted} disabled={!canEdit} onChange={(event) => setPermitted(event.target.checked)} />I have permission to use this source for HBS prospect research.</label>
    {error ? <div className="admin-lead-alert error" role="alert">{error}</div> : null}
    {table && columns ? <><div className="admin-lead-csv-summary"><strong>{table.rows.length} rows found</strong><span>Choose the matching columns, then review one business at a time.</span></div><div className="admin-lead-fields admin-lead-csv-mapping">{(Object.keys(fieldLabels) as Array<keyof ColumnMap>).map((field) => <label key={field}>{fieldLabels[field]}<select value={columns[field]} onChange={(event) => setColumns({ ...columns, [field]: Number(event.target.value) })}><option value={-1}>Not in this file</option>{table.headers.map((header, index) => <option value={index} key={`${index}-${header}`}>{header || `Column ${index + 1}`}</option>)}</select></label>)}</div>{columns.name < 0 ? <p className="admin-lead-csv-warning">Choose a business-name column before reviewing rows.</p> : null}<div className="admin-lead-csv-list" aria-label="CSV businesses">{table.rows.map((row, index) => { const business = importedBusiness(row, columns, sourceUrl); if (!business.name) return null; return <div className="admin-lead-csv-row" key={`${business.name}-${index}`}><div><strong>{business.name}</strong><small>{business.location || business.sector || business.website || "Details need review"}</small></div><button type="button" className="admin-outline-button" disabled={!canEdit || !permitted || !sourceAllowed || columns.name < 0} onClick={() => { setChosen(index); onSelect(business); }}>Review in CRM</button></div>; })}</div>{chosen !== null ? <p className="admin-lead-csv-selected" role="status">Row {chosen + 1} copied to the review form below. Check its details before adding it to Pipeline.</p> : null}</> : null}
  </section>;
}
