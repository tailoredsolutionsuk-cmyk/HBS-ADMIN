-- Privacy-safe project activity and client portal login tracking.
begin;

create table public.project_activity_events (
  id uuid primary key default gen_random_uuid(),
  source text not null check (source in ('codex','chatgpt','github','vercel','portal','builder','manual')),
  external_id text not null check (char_length(external_id) between 1 and 240),
  project_name text not null check (char_length(project_name) between 1 and 160),
  client_id text references public.clients(id) on delete set null,
  action text not null check (char_length(action) between 1 and 80),
  summary text not null check (char_length(summary) between 1 and 1000),
  event_url text check (event_url is null or (char_length(event_url) <= 2000 and event_url ~ '^https://')),
  commit_sha text check (commit_sha is null or commit_sha ~ '^[0-9a-fA-F]{7,64}$'),
  actor text check (actor is null or char_length(actor) <= 320),
  occurred_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object' and octet_length(metadata::text) <= 16384),
  unique (source, external_id)
);
create index project_activity_client_time_idx on public.project_activity_events(client_id, occurred_at desc);
create index project_activity_time_idx on public.project_activity_events(occurred_at desc);

alter table public.project_activity_events enable row level security;
revoke all on public.project_activity_events from public, anon, authenticated;
grant select, insert, update, delete on public.project_activity_events to service_role;
create policy "Service role manages project activity" on public.project_activity_events
  for all to service_role using (true) with check (true);

create table public.project_activity_sources (
  id uuid primary key default gen_random_uuid(),
  provider text not null check (provider in ('github','vercel')),
  external_key text not null check (external_key = lower(external_key) and char_length(external_key) between 3 and 240),
  project_name text not null check (char_length(project_name) between 1 and 160),
  client_id text references public.clients(id) on delete set null,
  enabled boolean not null default true,
  webhook_id bigint,
  last_verified_at timestamptz,
  last_error text check (last_error is null or char_length(last_error) <= 1000),
  created_at timestamptz not null default now(),
  unique(provider, external_key)
);
alter table public.project_activity_sources enable row level security;
revoke all on public.project_activity_sources from public, anon, authenticated;
grant select, insert, update, delete on public.project_activity_sources to service_role;
create policy "Service role manages project activity sources" on public.project_activity_sources
  for all to service_role using (true) with check (true);

insert into public.project_activity_sources(provider, external_key, project_name, client_id)
values
  ('github', 'tailoredsolutionsuk-cmyk/hbs-admin', 'HBS Admin', null),
  ('github', 'tailoredsolutionsuk-cmyk/utx', 'UTX', 'utx')
on conflict(provider, external_key) do update set project_name=excluded.project_name, client_id=excluded.client_id, enabled=true;

alter table public.client_portal_users
  add column last_login_at timestamptz,
  add column login_count integer not null default 0 check (login_count >= 0);

create function public.record_client_portal_login(p_user_id uuid, p_client_id text, p_email text, p_event_id uuid)
returns void language plpgsql security invoker set search_path = '' as $$
declare v_now timestamptz := now();
begin
  insert into public.client_portal_users(user_id, client_id, email, disabled, last_login_at, last_seen_at, login_count)
  values(p_user_id, p_client_id, p_email, false, v_now, v_now, 1)
  on conflict(user_id) do update set
    client_id = excluded.client_id,
    email = excluded.email,
    disabled = false,
    last_login_at = v_now,
    last_seen_at = v_now,
    login_count = public.client_portal_users.login_count + 1;
  insert into public.project_activity_events(source, external_id, project_name, client_id, action, summary, actor, occurred_at)
  values('portal', 'login:' || p_event_id::text, 'Client portal', p_client_id, 'client_login', 'Client signed in to the portal', p_email, v_now);
end;
$$;
revoke all on function public.record_client_portal_login(uuid,text,text,uuid) from public, anon, authenticated;
grant execute on function public.record_client_portal_login(uuid,text,text,uuid) to service_role;

commit;
