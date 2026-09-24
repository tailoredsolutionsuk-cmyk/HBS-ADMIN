-- Keep direct Data API reads in step with the current admin-approved portal access.
-- Run after the client portal tables and their initial policies exist.
begin;

drop policy if exists "Portal users can view own client" on public.clients;
create policy "Portal users can view own client" on public.clients
  for select to authenticated
  using (
    portal_enabled and not archived
    and portal_email = (select auth.jwt() ->> 'email')
    and exists (
      select 1 from public.client_portal_users cpu
      where cpu.user_id = (select auth.uid())
        and cpu.client_id = clients.id
        and cpu.email = clients.portal_email
        and not cpu.disabled
    )
  );

drop policy if exists "Portal users can view own tasks" on public.checklist_items;
create policy "Portal users can view own tasks" on public.checklist_items
  for select to authenticated
  using (
    exists (
      select 1 from public.client_portal_users cpu
      join public.clients c on c.id = cpu.client_id
      where cpu.user_id = (select auth.uid())
        and cpu.client_id = checklist_items.client_id
        and cpu.email = c.portal_email
        and not cpu.disabled
        and c.portal_enabled and not c.archived
        and c.portal_email = (select auth.jwt() ->> 'email')
    )
  );

drop policy if exists "Portal users can view own messages" on public.client_messages;
create policy "Portal users can view own messages" on public.client_messages
  for select to authenticated
  using (
    exists (
      select 1 from public.client_portal_users cpu
      join public.clients c on c.id = cpu.client_id
      where cpu.user_id = (select auth.uid())
        and cpu.client_id = client_messages.client_id
        and cpu.email = c.portal_email
        and not cpu.disabled
        and c.portal_enabled and not c.archived
        and c.portal_email = (select auth.jwt() ->> 'email')
    )
  );

drop policy if exists "Portal users can view own site" on public.client_sites;
create policy "Portal users can view own site" on public.client_sites
  for select to authenticated
  using (
    exists (
      select 1 from public.client_portal_users cpu
      join public.clients c on c.id = cpu.client_id
      where cpu.user_id = (select auth.uid())
        and cpu.client_id = client_sites.client_id
        and cpu.email = c.portal_email
        and not cpu.disabled
        and c.portal_enabled and not c.archived
        and c.portal_email = (select auth.jwt() ->> 'email')
    )
  );

drop policy if exists "Portal users can view own analytics" on public.page_views;
create policy "Portal users can view own analytics" on public.page_views
  for select to authenticated
  using (
    exists (
      select 1 from public.client_portal_users cpu
      join public.clients c on c.id = cpu.client_id
      where cpu.user_id = (select auth.uid())
        and cpu.client_id = page_views.client_id
        and cpu.email = c.portal_email
        and not cpu.disabled
        and c.portal_enabled and not c.archived
        and c.portal_email = (select auth.jwt() ->> 'email')
    )
  );

commit;
