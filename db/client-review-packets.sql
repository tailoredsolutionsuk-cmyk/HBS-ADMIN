-- Apply after client-meta-proposals.sql. Owner-released, client-scoped review only.
begin;
create table if not exists public.onboarding_review_packets (
  id uuid primary key default gen_random_uuid(),
  event_no bigint generated always as identity unique,
  project_id uuid not null references public.onboarding_projects(id),
  brief_revision integer not null check (brief_revision >= 0),
  site_revision integer not null check (site_revision >= 0),
  preview_deployment text not null check (char_length(preview_deployment) between 1 and 200),
  preview_url text not null check (char_length(preview_url) between 1 and 1000),
  proposal_revision integer not null check (proposal_revision >= 0),
  qa_note text not null check (char_length(qa_note) <= 4000),
  released_by uuid not null references auth.users(id),
  released_at timestamptz not null default now(),
  unique (project_id, site_revision, preview_deployment, proposal_revision)
);
create index if not exists onboarding_review_packets_project_idx on public.onboarding_review_packets(project_id, event_no desc);
create table if not exists public.onboarding_client_reviews (
  id uuid primary key default gen_random_uuid(),
  event_no bigint generated always as identity unique,
  packet_id uuid not null references public.onboarding_review_packets(id),
  decision text not null check (decision in ('approved', 'changes_requested')),
  feedback text not null check (char_length(feedback) <= 4000),
  reviewed_by uuid not null references auth.users(id),
  reviewed_at timestamptz not null default now()
);
create index if not exists onboarding_client_reviews_packet_idx on public.onboarding_client_reviews(packet_id, event_no desc);
alter table public.onboarding_review_packets enable row level security;
alter table public.onboarding_client_reviews enable row level security;
revoke all on public.onboarding_review_packets, public.onboarding_client_reviews from public, anon, authenticated;
grant select, insert on public.onboarding_review_packets, public.onboarding_client_reviews to service_role;
commit;
