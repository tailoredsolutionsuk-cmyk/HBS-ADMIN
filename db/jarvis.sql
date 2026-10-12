begin;

create table if not exists public.jarvis_actions (
  id uuid primary key default gen_random_uuid(),
  created_by uuid not null references auth.users(id) on delete restrict,
  reviewed_by uuid references auth.users(id) on delete set null,
  executed_by uuid references auth.users(id) on delete set null,
  action_type text not null check (action_type in ('create_task')),
  status text not null default 'pending_approval' check (status in ('pending_approval', 'approved', 'rejected', 'executed', 'failed')),
  payload jsonb not null default '{}'::jsonb check (jsonb_typeof(payload) = 'object'),
  result jsonb,
  error_message text,
  created_at timestamptz not null default now(),
  reviewed_at timestamptz,
  executed_at timestamptz
);

create index if not exists jarvis_actions_status_created_idx on public.jarvis_actions(status, created_at desc);
create index if not exists jarvis_actions_created_by_idx on public.jarvis_actions(created_by, created_at desc);
create index if not exists jarvis_actions_reviewed_by_idx on public.jarvis_actions(reviewed_by);
create index if not exists jarvis_actions_executed_by_idx on public.jarvis_actions(executed_by);
alter table public.jarvis_actions enable row level security;
revoke all on public.jarvis_actions from public, anon;
grant select, insert, update on public.jarvis_actions to authenticated;

drop policy if exists "JARVIS admins can view actions" on public.jarvis_actions;
create policy "JARVIS admins can view actions" on public.jarvis_actions for select to authenticated using (exists (
  select 1 from public.admin_users where user_id = (select auth.uid()) and role in ('owner', 'admin', 'editor')
));

drop policy if exists "JARVIS admins can propose actions" on public.jarvis_actions;
create policy "JARVIS admins can propose actions" on public.jarvis_actions for insert to authenticated with check (
  created_by = (select auth.uid()) and exists (
    select 1 from public.admin_users where user_id = (select auth.uid()) and role in ('owner', 'admin', 'editor')
  )
);

drop policy if exists "JARVIS owners can review actions" on public.jarvis_actions;
create policy "JARVIS owners can review actions" on public.jarvis_actions for update to authenticated using (exists (
  select 1 from public.admin_users where user_id = (select auth.uid()) and role in ('owner', 'admin')
)) with check (exists (
  select 1 from public.admin_users where user_id = (select auth.uid()) and role in ('owner', 'admin')
));

commit;
