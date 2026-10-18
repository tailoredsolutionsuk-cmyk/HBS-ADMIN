-- Run once against the HBS Supabase project. Only the service role can access
-- encrypted Microsoft tokens; no anon or authenticated grants or RLS policies.
create table if not exists public.outlook_calendar_connections (
  user_id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  access_token text not null,
  refresh_token text not null,
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.outlook_calendar_connections enable row level security;
revoke all on public.outlook_calendar_connections from anon, authenticated;
