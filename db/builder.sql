-- HBS-ADMIN website builder. Run once via Supabase migrations.
-- Browser roles cannot read drafts or change infrastructure assignments.
create table public.builder_sites (
 id uuid primary key,
 owner_id uuid not null references auth.users(id),
 name text not null,
 draft jsonb not null check (octet_length(draft::text) < 3000000),
 revision integer not null default 0 check (revision >= 0),
 repo_id bigint unique, repo_owner text, repo_name text unique,
 project_id text unique,
 published_revision integer, live_url text,
 pending_revision integer, pending_deployment text,
 lock_token uuid, lock_until timestamptz,
 last_error text,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 check (repo_name is null or repo_name = 'hbs-site-' || id::text),
 check (project_id is null or project_id not in ('prj_2jlYsvVapKcqzZEbtP9wZNNZ9fL4','prj_wHbSMpCAieIZUl45kQNXMn2W4I5h'))
);
create index builder_sites_owner_idx on public.builder_sites(owner_id, updated_at desc);
create table public.builder_versions (
 site_id uuid not null references public.builder_sites(id) on delete cascade,
 revision integer not null,
 document jsonb not null,
 label text not null default 'Saved draft',
 commit_sha text,
 deployment_id text,
 deployment_state text,
 created_at timestamptz not null default now(),
 primary key (site_id, revision)
);
create table public.builder_limits (
 key text primary key, bucket bigint not null, hits integer not null
);
alter table public.builder_sites enable row level security;
alter table public.builder_versions enable row level security;
alter table public.builder_limits enable row level security;
revoke all on public.builder_sites, public.builder_versions, public.builder_limits from public, anon, authenticated;
grant all on public.builder_sites, public.builder_versions, public.builder_limits to service_role;

create function public.builder_snapshot() returns trigger language plpgsql security invoker set search_path = '' as $$
begin
 if TG_OP = 'INSERT' then
   insert into public.builder_versions(site_id,revision,document,label) values (NEW.id,NEW.revision,NEW.draft,'Initial website');
 elsif NEW.revision <> OLD.revision then
   if NEW.revision <> OLD.revision + 1 then raise exception 'Invalid revision'; end if;
   insert into public.builder_versions(site_id,revision,document) values (NEW.id,NEW.revision,NEW.draft);
 end if;
 return NEW;
end;
$$;
revoke all on function public.builder_snapshot() from public, anon, authenticated;
create trigger builder_snapshot after insert or update on public.builder_sites for each row execute function public.builder_snapshot();

create function public.builder_rate_limit(p_key text, p_limit integer, p_seconds integer)
returns boolean language plpgsql security invoker set search_path = '' as $$
declare current_bucket bigint := floor(extract(epoch from now()) / p_seconds); total integer;
begin
 insert into public.builder_limits(key,bucket,hits) values(p_key,current_bucket,1)
 on conflict(key) do update set bucket=excluded.bucket,
 hits=case when public.builder_limits.bucket=excluded.bucket then public.builder_limits.hits+1 else 1 end
 returning hits into total;
 return total <= p_limit;
end;
$$;
revoke all on function public.builder_rate_limit(text,integer,integer) from public, anon, authenticated;
grant execute on function public.builder_rate_limit(text,integer,integer) to service_role;
