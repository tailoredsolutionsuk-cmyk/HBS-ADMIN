create table public.builder_generations (
 id uuid primary key, site_id uuid not null references public.builder_sites(id) on delete cascade,
 owner_id uuid not null references auth.users(id), model text not null, prompt text not null,
 result text, usage jsonb, estimated_cost_usd numeric,
 status text not null default 'pending', error text, revision integer,
 created_at timestamptz not null default now()
);
create index builder_generations_site_idx on public.builder_generations(site_id, created_at desc);
create index builder_generations_owner_idx on public.builder_generations(owner_id);
alter table public.builder_generations enable row level security;
revoke all on public.builder_generations from public, anon, authenticated;
grant all on public.builder_generations to service_role;
