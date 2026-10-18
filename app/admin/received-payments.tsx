"use client";

import { useEffect, useMemo, useState } from "react";

type Payment = {
  id: string;
  clientId: string;
  clientName: string;
  receivedOn: string;
  amountPence: number;
  payerName: string;
  reference: string | null;
  description: string | null;
  paymentMethod: string;
  sourceKind: string;
};

const money = (pence: number) => new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" }).format(pence / 100);
const date = (value: string) => new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric" }).format(new Date(`${value}T12:00:00`));

export default function ReceivedPayments({ refreshSignal }: { refreshSignal: number }) {
  const [payments, setPayments] = useState<Payment[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError("");
    fetch("/api/admin/sales", { cache: "no-store" })
      .then(async (response) => {
        if (response.status === 403) throw new Error("Received payments are available only to the owner or an admin.");
        if (!response.ok) throw new Error("Received payments could not be loaded.");
        const result = await response.json() as { payments?: Payment[] };
        if (!Array.isArray(result.payments)) throw new Error("Received-payment data is incomplete.");
        if (active) setPayments(result.payments);
      })
      .catch((reason) => { if (active) setError(reason instanceof Error ? reason.message : "Received payments could not be loaded."); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [refreshSignal]);

  const summary = useMemo(() => {
    const byClient = new Map<string, { name: string; count: number; pence: number }>();
    let totalPence = 0;
    for (const payment of payments || []) {
      totalPence += payment.amountPence;
      const current = byClient.get(payment.clientId) || { name: payment.clientName, count: 0, pence: 0 };
      byClient.set(payment.clientId, { ...current, count: current.count + 1, pence: current.pence + payment.amountPence });
    }
    return { totalPence, clients: [...byClient].map(([id, values]) => ({ id, ...values })) };
  }, [payments]);

  return <section className="admin-panel admin-sales-payments" aria-label="Received payments">
    <div className="admin-panel-heading"><div><span className="admin-section-kicker">Recorded bank credits</span><h3>Payments received</h3></div><span className="admin-client-analytics-count">Not invoices or VAT records</span></div>
    {error ? <p className="admin-sales-payment-error" role="alert">{error}{payments ? " Showing the last loaded records." : ""}</p> : null}
    {loading && !payments ? <p className="admin-sales-payment-loading" aria-busy="true">Loading received payments…</p> : payments ? <>
      <div className="admin-sales-payment-totals"><div><span>Total recorded</span><strong>{money(summary.totalPence)}</strong><small>{payments.length} {payments.length === 1 ? "bank credit" : "bank credits"}</small></div>{summary.clients.map((client) => <div key={client.id}><span>{client.name}</span><strong>{money(client.pence)}</strong><small>{client.count} {client.count === 1 ? "payment" : "payments"}</small></div>)}</div>
      {payments.length ? <div className="admin-sales-payment-table" role="table" aria-label="Received bank credits"><div className="admin-sales-payment-head" role="row"><span role="columnheader">Date</span><span role="columnheader">Client</span><span role="columnheader">Bank reference</span><span role="columnheader">Amount</span></div>{payments.map((payment) => <div className="admin-sales-payment-row" role="row" key={payment.id}><time role="cell" dateTime={payment.receivedOn}>{date(payment.receivedOn)}</time><span role="cell"><strong>{payment.clientName}</strong><small>Bank credit</small></span><span role="cell">{payment.reference || "Not shown"}</span><strong role="cell">{money(payment.amountPence)}</strong></div>)}</div> : <div className="admin-empty-state compact"><strong>No received payments recorded</strong><p>Bank credits will appear here when they are entered.</p></div>}
      <p className="admin-sales-note">These are recorded bank credits only. They are kept separate from estimated lead values and do not establish invoice, VAT, or accounting status.</p>
    </> : null}
  </section>;
}
