-- HBS CRM work checklist upgrade.
-- Safe to re-run against an existing checklist_items table.

alter table public.checklist_items
  add column if not exists category text not null default 'General',
  add column if not exists priority text not null default 'medium',
  add column if not exists status text not null default 'todo',
  add column if not exists assigned_to uuid references auth.users(id) on delete set null,
  add column if not exists updated_at timestamptz not null default now();

update public.checklist_items
set status = case when done then 'done' else 'todo' end
where status is null
   or status not in ('todo', 'in_progress', 'blocked', 'done')
   or (done and status <> 'done');

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.checklist_items'::regclass
      and conname = 'checklist_items_priority_check'
  ) then
    alter table public.checklist_items
      add constraint checklist_items_priority_check
      check (priority in ('low', 'medium', 'high', 'urgent'));
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.checklist_items'::regclass
      and conname = 'checklist_items_status_check'
  ) then
    alter table public.checklist_items
      add constraint checklist_items_status_check
      check (status in ('todo', 'in_progress', 'blocked', 'done'));
  end if;
end $$;

create index if not exists checklist_items_open_due_idx
  on public.checklist_items (done, due_date, priority, position);

create index if not exists checklist_items_assigned_to_idx
  on public.checklist_items (assigned_to);

grant select on public.checklist_items to authenticated;
grant insert, update on public.checklist_items to authenticated;
grant delete on public.checklist_items to authenticated;


