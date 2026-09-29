-- Additive phase-one onboarding. No new portal access, emails or provider resources.
begin;
create table public.onboarding_projects (
  id uuid primary key,
  client_id text not null references public.clients(id),
  name text not null check (char_length(name) between 1 and 160),
  service text not null check (char_length(service) between 1 and 100),
  target_date date,
  status text not null default 'collecting' check (status in ('collecting','submitted','changes_requested','approved')),
  brief jsonb not null default '{}'::jsonb,
  revision integer not null default 0 check (revision >= 0),
  review_note text,
  creation_payload jsonb not null,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index onboarding_projects_client_created_idx on public.onboarding_projects(client_id, created_at desc);
create index onboarding_projects_created_by_idx on public.onboarding_projects(created_by);
create table public.onboarding_events (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.onboarding_projects(id),
  event_key text not null unique,
  kind text not null,
  revision integer not null,
  status text not null default 'pending' check (status in ('pending','delivered','failed')),
  created_at timestamptz not null default now()
);
create index onboarding_events_project_idx on public.onboarding_events(project_id);
alter table public.checklist_items add column onboarding_project_id uuid references public.onboarding_projects(id);
create index checklist_items_onboarding_idx on public.checklist_items(onboarding_project_id) where onboarding_project_id is not null;
alter table public.onboarding_projects enable row level security;
alter table public.onboarding_events enable row level security;
revoke all on public.onboarding_projects, public.onboarding_events from public, anon, authenticated;
grant select, insert, update, delete on public.onboarding_projects, public.onboarding_events to service_role;

create function public.onboarding_mutate(p_action text, p_id uuid, p_actor uuid, p_payload jsonb, p_revision integer default null)
returns public.onboarding_projects language plpgsql security invoker set search_path = '' as $$
declare
  v_project public.onboarding_projects;
  v_role text;
  v_client text;
  v_title text;
  v_step text;
  v_position integer := 0;
  v_brief jsonb;
begin
  select role into v_role from public.admin_users where user_id = p_actor;
  if p_action = 'create' then
    if v_role is null or v_role not in ('owner','admin','editor') then
      raise exception 'ONBOARDING_FORBIDDEN' using errcode = '42501';
    end if;
    if not exists(select 1 from public.clients where id = p_payload->>'client_id' and archived = false) then
      raise exception 'ONBOARDING_CLIENT_UNAVAILABLE' using errcode = 'P0002';
    end if;
    -- Serialize creation retries using the stable request ID.
    perform pg_advisory_xact_lock(hashtextextended(p_id::text, 0));
    select * into v_project from public.onboarding_projects where id = p_id;
    if found then
      if v_project.creation_payload <> p_payload or v_project.created_by <> p_actor then
        raise exception 'ONBOARDING_CONFLICT' using errcode = '40001';
      end if;
      return v_project;
    end if;
    insert into public.onboarding_projects(id,client_id,name,service,target_date,creation_payload,created_by)
    values(p_id,p_payload->>'client_id',p_payload->>'name',p_payload->>'service',
      nullif(p_payload->>'target_date','')::date,p_payload,p_actor) returning * into v_project;
    for v_step, v_title in select * from (values
      ('brief','Collect client brief'),('assets','Collect brand assets and content'),
      ('review','Review and approve brief'),('access','Confirm domain and integration access'),
      ('build','Create website and preview'),('qa','Complete quality and analytics checks'),
      ('approval','Obtain client website approval'),('launch','Approve and launch website')
    ) as steps(step,title) loop
      insert into public.checklist_items(id,client_id,title,category,status,priority,position,onboarding_project_id,due_date)
      values('onboarding:'||p_id::text||':'||v_step,v_project.client_id,
        v_project.name||' — '||v_title,'Onboarding','todo','medium',v_position,p_id,
        case when v_step = 'launch' then v_project.target_date else null end);
      v_position := v_position + 1;
    end loop;
  else
    select * into v_project from public.onboarding_projects where id = p_id for update;
    if not found then raise exception 'ONBOARDING_NOT_FOUND' using errcode = 'P0002'; end if;
    if p_action in ('save','submit') then
      select c.id into v_client from public.client_portal_users m
        join public.clients c on c.id = m.client_id
        where m.user_id = p_actor and not m.disabled and c.portal_enabled and not c.archived
          -- Supplied only by the server after auth.getUser(), never from client input.
          and lower(trim(c.portal_email)) = lower(trim(p_payload->>'authenticated_email'))
          and c.id = v_project.client_id;
      if v_client is null then raise exception 'ONBOARDING_FORBIDDEN' using errcode = '42501'; end if;
    elsif p_action in ('approve','request_changes') then
      if v_role is null or v_role not in ('owner','admin') then
        raise exception 'ONBOARDING_FORBIDDEN' using errcode = '42501';
      end if;
    else raise exception 'ONBOARDING_INVALID_ACTION' using errcode = '22023';
    end if;
    if p_revision is null or v_project.revision <> p_revision then
      raise exception 'ONBOARDING_CONFLICT' using errcode = '40001';
    end if;
    if p_action in ('save','submit') then
      if v_project.status not in ('collecting','changes_requested') then
        raise exception 'ONBOARDING_CONFLICT' using errcode = '40001';
      end if;
      v_brief := p_payload->'brief';
      if v_brief is null or jsonb_typeof(v_brief) <> 'object' or octet_length(v_brief::text) > 100000 then
        raise exception 'ONBOARDING_INVALID_BRIEF' using errcode = '22023';
      end if;
      if p_action = 'submit' and (
        coalesce(length(trim(v_brief->>'business')),0) = 0 or
        coalesce(length(trim(v_brief->>'audience')),0) = 0 or
        coalesce(length(trim(v_brief->>'goals')),0) = 0 or
        coalesce(length(trim(v_brief->>'pages')),0) = 0
      ) then raise exception 'ONBOARDING_INCOMPLETE_BRIEF' using errcode = '22023'; end if;
      update public.onboarding_projects set brief = v_brief,
        status = case when p_action = 'submit' then 'submitted' else status end,
        revision = revision + 1, updated_at = now() where id = p_id returning * into v_project;
      if p_action = 'submit' then
        update public.checklist_items set done=true,status='done',completed_at=now(),updated_at=now()
        where id='onboarding:'||p_id::text||':brief';
      end if;
    else
      if v_project.status <> 'submitted' then
        raise exception 'ONBOARDING_CONFLICT' using errcode = '40001';
      end if;
      if p_action = 'request_changes' and coalesce(length(trim(p_payload->>'note')),0) = 0 then
        raise exception 'ONBOARDING_REVIEW_NOTE_REQUIRED' using errcode = '22023';
      end if;
      update public.onboarding_projects set
        status = case when p_action = 'approve' then 'approved' else 'changes_requested' end,
        review_note = left(p_payload->>'note',4000),revision=revision+1,updated_at=now()
        where id=p_id returning * into v_project;
      update public.checklist_items set done=(p_action='approve'),
        status=case when p_action='approve' then 'done' else 'todo' end,
        completed_at=case when p_action='approve' then now() else null end,updated_at=now()
        where id='onboarding:'||p_id::text||':review';
      if p_action='request_changes' then
        update public.checklist_items set done=false,status='todo',completed_at=null,updated_at=now()
          where id='onboarding:'||p_id::text||':brief';
      end if;
    end if;
  end if;
  if p_action <> 'save' then
    insert into public.onboarding_events(project_id,event_key,kind,revision)
      values(p_id,p_id::text||':'||v_project.revision::text||':'||p_action,p_action,v_project.revision);
    insert into public.crm_activities(entity_type,entity_id,action,detail,created_by)
      values('client',v_project.client_id,'onboarding_'||p_action,v_project.name||' — '||v_project.status,p_actor);
  end if;
  return v_project;
end $$;
revoke all on function public.onboarding_mutate(text,uuid,uuid,jsonb,integer) from public,anon,authenticated;
grant execute on function public.onboarding_mutate(text,uuid,uuid,jsonb,integer) to service_role;
commit;

