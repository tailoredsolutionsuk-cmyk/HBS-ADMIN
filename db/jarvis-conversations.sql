begin;

create table if not exists public.jarvis_conversations (
  id uuid primary key default gen_random_uuid(),
  created_by uuid not null references auth.users(id) on delete cascade,
  title text not null default 'New conversation' check (char_length(title) between 1 and 120),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists jarvis_conversations_owner_updated_idx
  on public.jarvis_conversations (created_by, updated_at desc);

create table if not exists public.jarvis_messages (
  id bigint generated always as identity primary key,
  conversation_id uuid not null references public.jarvis_conversations(id) on delete cascade,
  sender_user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('user', 'assistant')),
  content text not null check (char_length(content) between 1 and 10000),
  created_at timestamptz not null default now(),
  unique (id, conversation_id)
);

create index if not exists jarvis_messages_conversation_id_idx
  on public.jarvis_messages (conversation_id, id desc);
create index if not exists jarvis_messages_sender_idx
  on public.jarvis_messages (sender_user_id);

-- These are searchable excerpts from user turns, not independently verified facts.
create table if not exists public.jarvis_conversation_knowledge (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.jarvis_conversations(id) on delete cascade,
  source_message_id bigint not null unique,
  content text not null check (char_length(content) between 1 and 2500),
  search_vector tsvector generated always as (to_tsvector('english', content)) stored,
  created_at timestamptz not null default now(),
  foreign key (source_message_id, conversation_id)
    references public.jarvis_messages (id, conversation_id) on delete cascade
);

create index if not exists jarvis_knowledge_conversation_created_idx
  on public.jarvis_conversation_knowledge (conversation_id, created_at desc);
create index if not exists jarvis_knowledge_source_conversation_idx
  on public.jarvis_conversation_knowledge (source_message_id, conversation_id);
create index if not exists jarvis_knowledge_search_idx
  on public.jarvis_conversation_knowledge using gin (search_vector);

alter table public.jarvis_conversations enable row level security;
alter table public.jarvis_messages enable row level security;
alter table public.jarvis_conversation_knowledge enable row level security;

revoke all on public.jarvis_conversations, public.jarvis_messages,
  public.jarvis_conversation_knowledge from public, anon;
grant select, insert, update on public.jarvis_conversations to authenticated;
grant select, insert on public.jarvis_messages,
  public.jarvis_conversation_knowledge to authenticated;
grant usage on sequence public.jarvis_messages_id_seq to authenticated;

create policy "JARVIS conversation owner reads" on public.jarvis_conversations
  for select to authenticated using (
    created_by = (select auth.uid()) and exists (
      select 1 from public.admin_users
      where user_id = (select auth.uid()) and role in ('owner', 'admin', 'editor')
    )
  );
create policy "JARVIS conversation owner creates" on public.jarvis_conversations
  for insert to authenticated with check (
    created_by = (select auth.uid()) and exists (
      select 1 from public.admin_users
      where user_id = (select auth.uid()) and role in ('owner', 'admin', 'editor')
    )
  );
create policy "JARVIS conversation owner updates" on public.jarvis_conversations
  for update to authenticated using (created_by = (select auth.uid()))
  with check (created_by = (select auth.uid()));

create policy "JARVIS conversation messages read" on public.jarvis_messages
  for select to authenticated using (exists (
    select 1 from public.jarvis_conversations c
    where c.id = conversation_id and c.created_by = (select auth.uid())
  ));
create policy "JARVIS conversation messages append" on public.jarvis_messages
  for insert to authenticated with check (
    sender_user_id = (select auth.uid()) and exists (
      select 1 from public.jarvis_conversations c
      where c.id = conversation_id and c.created_by = (select auth.uid())
    )
  );

create policy "JARVIS conversation knowledge read" on public.jarvis_conversation_knowledge
  for select to authenticated using (exists (
    select 1 from public.jarvis_conversations c
    where c.id = conversation_id and c.created_by = (select auth.uid())
  ));
create policy "JARVIS conversation knowledge append" on public.jarvis_conversation_knowledge
  for insert to authenticated with check (exists (
    select 1 from public.jarvis_conversations c
    join public.jarvis_messages m
      on m.id = source_message_id and m.conversation_id = c.id and m.role = 'user'
    where c.id = conversation_id and c.created_by = (select auth.uid())
  ));

commit;
