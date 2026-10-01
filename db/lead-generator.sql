-- HBS lead generator profile. API access is server-side after admin authentication.
create table if not exists public.lead_generator_profiles (
  id text primary key check (id = 'hbs'),
  sector text not null default 'Local service business',
  location text not null default '',
  goal text not null default 'enquiries' check (goal in ('website', 'enquiries', 'visibility', 'automation')),
  website_preference text not null default 'any' check (website_preference in ('any', 'missing', 'present')),
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now()
);

alter table public.lead_generator_profiles enable row level security;
revoke all on public.lead_generator_profiles from anon, authenticated;

insert into public.lead_generator_profiles (id) values ('hbs') on conflict (id) do nothing;
