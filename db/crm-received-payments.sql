-- HBS-only received-payment ledger. Bank credits are not invoices or
-- automatically recognised revenue. The server reads this table only after
-- verifying an owner/admin account; browsers have no direct table grants.
create table if not exists public.crm_received_payments (
  id uuid primary key default gen_random_uuid(),
  client_id text not null references public.clients(id) on delete restrict,
  received_on date not null,
  amount_gbp numeric(12,2) not null check (amount_gbp > 0),
  payer_name text not null,
  payment_method text not null default 'bank_transfer' check (payment_method = 'bank_transfer'),
  reference text,
  description text,
  source_kind text not null check (source_kind = 'bank_credit_screenshot'),
  source_filename text not null,
  source_sha256 text not null unique check (source_sha256 ~ '^[a-f0-9]{64}$'),
  created_at timestamptz not null default now()
);

create index if not exists crm_received_payments_client_date_idx
  on public.crm_received_payments (client_id, received_on desc);

alter table public.crm_received_payments enable row level security;
revoke all on public.crm_received_payments from anon, authenticated;
