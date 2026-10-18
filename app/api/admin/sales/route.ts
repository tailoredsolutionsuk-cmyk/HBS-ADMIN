import { NextResponse } from "next/server";
import { createClient } from "../../../../lib/supabase/server";
import { portalService } from "../../../../lib/portal/server";

export const dynamic = "force-dynamic";

export async function GET() {
  const auth = await createClient();
  const { data: claims, error: authError } = await auth.auth.getClaims();
  const userId = claims?.claims?.sub;
  if (authError || !userId) return NextResponse.json({ error: "AUTH_REQUIRED" }, { status: 401 });

  const { data: admin, error: adminError } = await auth.from("admin_users")
    .select("role").eq("user_id", userId).maybeSingle();
  if (adminError || !admin || !["owner", "admin"].includes(admin.role)) {
    return NextResponse.json({ error: "FINANCIAL_ACCESS_REQUIRED" }, { status: 403 });
  }

  try {
    const db = portalService();
    const { data, error } = await db.from("crm_received_payments")
      .select("id,client_id,received_on,amount_gbp,payer_name,reference,description,payment_method,source_kind")
      .order("received_on", { ascending: false }).order("created_at", { ascending: false }).limit(500);
    if (error) throw error;
    const clientIds = [...new Set((data || []).map((row) => row.client_id))];
    const clients = clientIds.length ? await db.from("clients").select("id,business_name").in("id", clientIds) : null;
    if (clients?.error) throw clients.error;
    const clientNames = new Map((clients?.data || []).map((client) => [client.id, client.business_name]));
    const payments = (data || []).map((row) => ({
      id: row.id,
      clientId: row.client_id,
      clientName: clientNames.get(row.client_id) || row.payer_name,
      receivedOn: row.received_on,
      amountPence: Math.round(Number(row.amount_gbp) * 100),
      payerName: row.payer_name,
      reference: row.reference,
      description: row.description,
      paymentMethod: row.payment_method,
      sourceKind: row.source_kind,
    }));
    return NextResponse.json({ payments, totalPence: payments.reduce((sum, payment) => sum + payment.amountPence, 0) },
      { headers: { "Cache-Control": "private, no-store" } });
  } catch {
    return NextResponse.json({ error: "PAYMENTS_UNAVAILABLE" }, { status: 503 });
  }
}
