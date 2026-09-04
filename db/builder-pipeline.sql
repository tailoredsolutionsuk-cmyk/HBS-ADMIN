-- Additive website studio release/queue migration. No existing CRM data is removed.
alter table public.builder_sites
 add column client_id text references public.clients(id),
 add column preview_revision integer,
 add column preview_deployment text,
 add column preview_url text,
 add column published_deployment text,
 add column custom_domain text unique,
 add column domain_verified boolean not null default false,
 add column domain_status jsonb;
create index builder_sites_client_idx on public.builder_sites(client_id);
alter table public.builder_versions add column preview_url text;
alter table public.leads
 add column builder_site_id uuid references public.builder_sites(id),
 add column builder_client_id text references public.clients(id),
 add column builder_submission_id uuid unique;
create index leads_builder_site_idx on public.leads(builder_site_id,created_at desc);
create index leads_builder_client_idx on public.leads(builder_client_id);

create table public.builder_jobs (
 id uuid primary key,
 site_id uuid not null references public.builder_sites(id) on delete cascade,
 owner_id uuid not null references auth.users(id),
 kind text not null check(kind in ('setup','ai','preview','publish')),
 revision integer not null,
 payload jsonb not null default '{}' check(octet_length(payload::text) < 3000000),
 status text not null default 'queued' check(status in ('queued','running','waiting','succeeded','failed')),
 attempts integer not null default 0,
 polls integer not null default 0,
 progress text not null default 'Queued',
 error text,
 deployment_id text,
 commit_sha text,
 generation_id uuid references public.builder_generations(id),
 lease_token uuid, lease_until timestamptz,
 available_at timestamptz not null default now(),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);
create index builder_jobs_owner_idx on public.builder_jobs(owner_id,created_at desc);
create index builder_jobs_generation_idx on public.builder_jobs(generation_id);
create index builder_jobs_due_idx on public.builder_jobs(available_at) where status in ('queued','running','waiting');
create unique index builder_one_active_job on public.builder_jobs(site_id) where status in ('queued','running','waiting');

create table public.builder_metrics (
 site_id uuid not null references public.builder_sites(id) on delete cascade,
 day date not null default current_date,
 page text not null check(page in ('home','about','services','contact')),
 views bigint not null default 0,
 primary key(site_id,day,page)
);
alter table public.builder_jobs enable row level security;
alter table public.builder_metrics enable row level security;
revoke all on public.builder_jobs,public.builder_metrics from public,anon,authenticated;
grant select,insert,update,delete on public.builder_jobs,public.builder_metrics to service_role;

create function public.builder_claim_job(p_token uuid,p_owner uuid default null)
returns setof public.builder_jobs language plpgsql security invoker set search_path='' as $$
begin
 -- A crashed AI call is NOT repeated: it may already have incurred a charge.
 update public.builder_jobs set status='failed',progress='Needs attention',error='Worker stopped. Your draft is safe. Review history before retrying.',lease_token=null,lease_until=null
 where status='running' and lease_until < now() and (kind='ai' or attempts >= 3)
 and (p_owner is null or owner_id=p_owner);
 return query
 update public.builder_jobs set status='running',lease_token=p_token,lease_until=now()+interval '6 minutes',
 attempts=attempts+case when status='waiting' then 0 else 1 end,updated_at=now()
 where id=(select id from public.builder_jobs
   where ((status in ('queued','waiting') and available_at<=now()) or (status='running' and lease_until<now()))
   and (p_owner is null or owner_id=p_owner)
   order by available_at,created_at for update skip locked limit 1)
 returning *;
end;
$$;
revoke all on function public.builder_claim_job(uuid,uuid) from public,anon,authenticated;
grant execute on function public.builder_claim_job(uuid,uuid) to service_role;

create function public.builder_count_view(p_site uuid,p_page text)
returns void language sql security invoker set search_path='' as $$
 insert into public.builder_metrics(site_id,day,page,views) values(p_site,current_date,p_page,1)
 on conflict(site_id,day,page) do update set views=public.builder_metrics.views+1;
$$;
revoke all on function public.builder_count_view(uuid,text) from public,anon,authenticated;
grant execute on function public.builder_count_view(uuid,text) to service_role;
