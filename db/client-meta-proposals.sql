-- Apply after client-onboarding.sql. Drafts only: no Meta provider access or spending.
begin;
create table if not exists public.onboarding_meta_proposals (
  project_id uuid primary key references public.onboarding_projects(id),
  source_brief_revision integer not null check (source_brief_revision >= 0),
  revision integer not null default 0 check (revision >= 0),
  draft jsonb not null check (jsonb_typeof(draft) = 'object' and octet_length(draft::text) < 20000),
  created_by uuid not null references auth.users(id),
  updated_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table if not exists public.onboarding_meta_proposal_versions (
  project_id uuid not null references public.onboarding_meta_proposals(project_id),
  revision integer not null,
  source_brief_revision integer not null,
  draft jsonb not null,
  saved_by uuid not null references auth.users(id),
  saved_at timestamptz not null default now(),
  primary key (project_id, revision)
);
alter table public.onboarding_meta_proposals enable row level security;
alter table public.onboarding_meta_proposal_versions enable row level security;
revoke all on public.onboarding_meta_proposals, public.onboarding_meta_proposal_versions from public, anon, authenticated;
grant select, insert, update on public.onboarding_meta_proposals, public.onboarding_meta_proposal_versions to service_role;

create or replace function public.onboarding_meta_snapshot() returns trigger
language plpgsql security invoker set search_path = '' as $$
begin
  if tg_op = 'UPDATE' and new.revision <> old.revision + 1 then
    raise exception 'Invalid Meta proposal revision' using errcode = '40001';
  end if;
  insert into public.onboarding_meta_proposal_versions
    (project_id, revision, source_brief_revision, draft, saved_by)
  values (new.project_id, new.revision, new.source_brief_revision, new.draft, new.updated_by);
  return new;
end $$;
revoke all on function public.onboarding_meta_snapshot() from public, anon, authenticated;
drop trigger if exists onboarding_meta_snapshot on public.onboarding_meta_proposals;
create trigger onboarding_meta_snapshot after insert or update on public.onboarding_meta_proposals
  for each row execute function public.onboarding_meta_snapshot();
commit;
