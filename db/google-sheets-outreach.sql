-- HBS owner/admin Google Sheets OAuth credentials and idempotent outreach imports.
-- Secrets are encrypted by the application; browsers cannot query these tables.
create table if not exists public.google_sheets_connections (
  user_id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  access_token text not null,
  refresh_token text not null,
  expires_at timestamptz not null,
  spreadsheet_id text not null,
  sheet_name text not null,
  last_synced_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.google_sheets_outreach_imports (
  id uuid primary key default gen_random_uuid(),
  spreadsheet_id text not null,
  sheet_name text not null,
  source_fingerprint text not null,
  business_name text not null,
  lead_id uuid references public.leads(id) on delete set null,
  disposition text not null check (disposition in ('imported', 'already_in_crm')),
  synced_at timestamptz not null default now(),
  unique (spreadsheet_id, source_fingerprint)
);

create index if not exists google_sheets_outreach_imports_lead_idx
  on public.google_sheets_outreach_imports (lead_id) where lead_id is not null;

alter table public.google_sheets_connections enable row level security;
alter table public.google_sheets_outreach_imports enable row level security;
revoke all on public.google_sheets_connections from anon, authenticated;
revoke all on public.google_sheets_outreach_imports from anon, authenticated;
