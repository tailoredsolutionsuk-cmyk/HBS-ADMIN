-- Apply after crm-outreach.sql. Drafts/reminders only, never automatic sends.
alter table public.crm_outreach_events drop constraint crm_outreach_events_event_type_check;
alter table public.crm_outreach_events add constraint crm_outreach_events_event_type_check check(event_type in ('outreach','meeting_booked','response_received','sequence_stopped'));
alter table public.crm_outreach_events add column sequence_step smallint;
alter table public.crm_outreach_events add constraint crm_outreach_sequence_step_check check(sequence_step is null or (event_type='outreach' and sequence_step in (1,3,7)));
create unique index crm_outreach_sequence_step_idx on public.crm_outreach_events(lead_id,sequence_step) where sequence_step is not null and voided_at is null;

create function public.crm_validate_outreach_sequence() returns trigger
language plpgsql security invoker set search_path=public,pg_temp as $$
declare started timestamptz; next_step integer;
begin
  perform pg_advisory_xact_lock(hashtextextended(new.lead_id::text,0));
  if new.sequence_step is null or exists(select 1 from public.crm_outreach_events where id=new.id) then return new; end if;
  select min(occurred_at) into started from public.crm_outreach_events where lead_id=new.lead_id and event_type='outreach' and voided_at is null;
  if started is null or now() >= started + interval '14 days'
    or exists(select 1 from public.crm_outreach_events where lead_id=new.lead_id and voided_at is null and event_type in ('meeting_booked','response_received','sequence_stopped'))
    or exists(select 1 from public.leads where id=new.lead_id and status in ('Won','Lost'))
    then raise exception using errcode='P0001',message='SEQUENCE_CLOSED'; end if;
  if exists(select 1 from public.crm_outreach_events where lead_id=new.lead_id and sequence_step=new.sequence_step and voided_at is null)
    then raise exception using errcode='23505',message='FOLLOW_UP_ALREADY_LOGGED'; end if;
  select min(day) into next_step from unnest(array[1,3,7]) day
    where not exists(select 1 from public.crm_outreach_events where lead_id=new.lead_id and sequence_step=day and voided_at is null);
  if new.sequence_step <> next_step or now() < started + make_interval(days=>new.sequence_step::integer)
    then raise exception using errcode='P0001',message='FOLLOW_UP_NOT_DUE'; end if;
  return new;
end;
$$;
revoke all on function public.crm_validate_outreach_sequence() from public,anon,authenticated;
grant execute on function public.crm_validate_outreach_sequence() to service_role;
create trigger crm_validate_outreach_sequence before insert on public.crm_outreach_events for each row execute function public.crm_validate_outreach_sequence();

create or replace function public.crm_outreach_dashboard(p_since timestamptz default null)
returns jsonb language sql stable security invoker set search_path=public,pg_temp as $$
  with active as (
    select * from public.crm_outreach_events where voided_at is null
  ), period_events as (
    select * from active where p_since is null or occurred_at >= p_since
  ), grouped as (
    select lead_id,count(*) filter(where event_type='outreach') as attempts,
      bool_or(event_type='meeting_booked') as booked,
      min(occurred_at) filter(where event_type='outreach') as first_outreach_at,
      max(occurred_at) filter(where event_type='outreach') as last_outreach_at
    from active group by lead_id
  )
  select jsonb_build_object(
    'totals',jsonb_build_object(
      'outreaches',(select count(*) from period_events where event_type='outreach'),
      'contactedLeads',(select count(distinct lead_id) from period_events where event_type='outreach'),
      'meetingsBooked',(select count(distinct lead_id) from period_events where event_type='meeting_booked')
    ),
    'byMethod',coalesce((select jsonb_object_agg(method,n) from (
      select method,count(*) as n from period_events where event_type='outreach' group by method
    ) m),'{}'::jsonb),
    'leadStats',coalesce((select jsonb_agg(jsonb_build_object(
      'leadId',g.lead_id,'attempts',g.attempts,'meetingBooked',g.booked,'lastOutreachAt',g.last_outreach_at,
      'firstOutreachAt',g.first_outreach_at,
      'firstMethod',(select method from active where lead_id=g.lead_id and event_type='outreach' order by occurred_at,id limit 1),
      'sequenceSteps',coalesce((select jsonb_agg(sequence_step order by sequence_step) from active where lead_id=g.lead_id and sequence_step is not null),'[]'::jsonb),
      'sequenceStatus',(select event_type from active where lead_id=g.lead_id and event_type in ('response_received','sequence_stopped') order by occurred_at desc,id desc limit 1),
      'bookingId',b.id,'bookingCreatedBy',b.created_by,'meetingAt',b.meeting_at,
      'history',coalesce((select jsonb_agg(to_jsonb(h) order by h.occurred_at desc,h.id desc) from (
        select id,event_type,method,notes,meeting_at,occurred_at,created_by,sequence_step from active
        where lead_id=g.lead_id order by occurred_at desc,id desc limit 5
      ) h),'[]'::jsonb)
    )) from grouped g left join active b on b.lead_id=g.lead_id and b.event_type='meeting_booked'),'[]'::jsonb)
  );
$$;
revoke all on function public.crm_outreach_dashboard(timestamptz) from public,anon,authenticated;
grant execute on function public.crm_outreach_dashboard(timestamptz) to service_role;

