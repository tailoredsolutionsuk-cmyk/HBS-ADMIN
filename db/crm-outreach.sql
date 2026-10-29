-- HBS admin-only outreach ledger. The authenticated server checks staff roles.
-- Browsers and client portal users have no direct access to this table or RPC.
create table public.crm_outreach_events (
  id uuid primary key,
  lead_id uuid not null references public.leads(id) on delete restrict,
  event_type text not null check (event_type in ('outreach','meeting_booked')),
  method text check (method in ('call','email','whatsapp','linkedin','other')),
  notes text not null default '' check (length(notes) <= 2000),
  meeting_at timestamptz,
  occurred_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  voided_at timestamptz,
  voided_by uuid references auth.users(id) on delete set null,
  check (event_type <> 'outreach' or (method is not null and meeting_at is null))
);
create index crm_outreach_events_lead_idx on public.crm_outreach_events (lead_id,occurred_at desc) where voided_at is null;
create index crm_outreach_events_period_idx on public.crm_outreach_events (occurred_at desc) where voided_at is null;
create index crm_outreach_events_created_by_idx on public.crm_outreach_events (created_by);
create index crm_outreach_events_voided_by_idx on public.crm_outreach_events (voided_by);
-- A lead can have one current introductory meeting booking. Undo preserves its audit trail.
create unique index crm_outreach_events_booking_idx on public.crm_outreach_events (lead_id) where event_type='meeting_booked' and voided_at is null;
alter table public.crm_outreach_events enable row level security;
revoke all on public.crm_outreach_events from public,anon,authenticated;
grant select,insert,update on public.crm_outreach_events to service_role;

create function public.crm_outreach_dashboard(p_since timestamptz default null)
returns jsonb language sql stable security invoker set search_path=public,pg_temp as $$
  with active as (
    select * from public.crm_outreach_events where voided_at is null
  ), period_events as (
    select * from active where p_since is null or occurred_at >= p_since
  ), grouped as (
    select lead_id,count(*) filter(where event_type='outreach') as attempts,
      bool_or(event_type='meeting_booked') as booked,
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
      'bookingId',b.id,'bookingCreatedBy',b.created_by,'meetingAt',b.meeting_at,
      'history',coalesce((select jsonb_agg(to_jsonb(h) order by h.occurred_at desc,h.id desc) from (
        select id,event_type,method,notes,meeting_at,occurred_at,created_by from active
        where lead_id=g.lead_id order by occurred_at desc,id desc limit 5
      ) h),'[]'::jsonb)
    )) from grouped g left join active b on b.lead_id=g.lead_id and b.event_type='meeting_booked'),'[]'::jsonb)
  );
$$;
revoke all on function public.crm_outreach_dashboard(timestamptz) from public,anon,authenticated;
grant execute on function public.crm_outreach_dashboard(timestamptz) to service_role;
