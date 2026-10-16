-- Apply after client-onboarding.sql. Drafts only: no Meta provider access or spending.
begin;
create table if not exists public.onboarding_meta_proposals (
  project_id uuid primary key references public.onboarding_projects(id),
  source_brief_revision integer not null check (source_brief_revision >= 0),
  revision integer not null default 0 check (revision >= 0),
  draft jsonb not null check (jsonb_typeof(draft) = 'object' and octet_length(draft::text) < 20000),
  reviewed_revision integer check (reviewed_revision >= 0 and reviewed_revision <= revision),
  review_decision text check (review_decision in ('approved', 'changes_requested')),
  review_note text check (char_length(review_note) <= 4000),
  reviewed_by uuid references auth.users(id),
  reviewed_at timestamptz,
  check ((reviewed_revision is null and review_decision is null and reviewed_by is null and reviewed_at is null)
    or (reviewed_revision is not null and review_decision is not null and reviewed_by is not null and reviewed_at is not null)),
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
create table if not exists public.onboarding_meta_reviews (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.onboarding_meta_proposals(project_id),
  proposal_revision integer not null,
  decision text not null check (decision in ('approved', 'changes_requested')),
  note text not null check (char_length(note) <= 4000),
  reviewed_by uuid not null references auth.users(id),
  reviewed_at timestamptz not null
);
create index if not exists onboarding_meta_reviews_project_idx on public.onboarding_meta_reviews(project_id, reviewed_at desc);
alter table public.onboarding_meta_proposals enable row level security;
alter table public.onboarding_meta_proposal_versions enable row level security;
alter table public.onboarding_meta_reviews enable row level security;
revoke all on public.onboarding_meta_proposals, public.onboarding_meta_proposal_versions, public.onboarding_meta_reviews from public, anon, authenticated;
grant select, insert, update on public.onboarding_meta_proposals, public.onboarding_meta_proposal_versions, public.onboarding_meta_reviews to service_role;

create or replace function public.onboarding_meta_snapshot() returns trigger
language plpgsql security invoker set search_path = '' as $$
begin
  if tg_op = 'UPDATE' then
    if new.revision = old.revision then
      if new.draft <> old.draft or new.source_brief_revision <> old.source_brief_revision then
        raise exception 'Meta proposal content requires a new revision' using errcode = '40001';
      end if;
      if row(new.reviewed_revision, new.review_decision, new.review_note, new.reviewed_by, new.reviewed_at)
         is distinct from row(old.reviewed_revision, old.review_decision, old.review_note, old.reviewed_by, old.reviewed_at) then
        insert into public.onboarding_meta_reviews(project_id,proposal_revision,decision,note,reviewed_by,reviewed_at)
        values(new.project_id,new.reviewed_revision,new.review_decision,coalesce(new.review_note,''),new.reviewed_by,new.reviewed_at);
      end if;
      return new;
    elsif new.revision <> old.revision + 1 then
      raise exception 'Invalid Meta proposal revision' using errcode = '40001';
    end if;
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
