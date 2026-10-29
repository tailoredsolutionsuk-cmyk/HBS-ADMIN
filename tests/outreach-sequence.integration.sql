begin;
do $$
declare lead uuid; initial uuid := gen_random_uuid(); first_follow uuid := gen_random_uuid(); snapshot jsonb; stats jsonb;
begin
  select id into lead from public.leads where status not in ('Won','Lost') limit 1;
  if lead is null then raise exception 'Need one open lead for rollback-only assertions'; end if;
  insert into public.crm_outreach_events(id,lead_id,event_type,method,occurred_at) values(initial,lead,'outreach','email',now()-interval '8 days');
  begin
    insert into public.crm_outreach_events(id,lead_id,event_type,method,sequence_step) values(gen_random_uuid(),lead,'outreach','email',3);
    raise exception 'Out-of-order follow-up accepted';
  exception when raise_exception then if sqlerrm <> 'FOLLOW_UP_NOT_DUE' then raise; end if; end;
  insert into public.crm_outreach_events(id,lead_id,event_type,method,sequence_step) values(first_follow,lead,'outreach','email',1);
  begin
    insert into public.crm_outreach_events(id,lead_id,event_type,method,sequence_step) values(gen_random_uuid(),lead,'outreach','email',1);
    raise exception 'Duplicate follow-up accepted';
  exception when unique_violation then null; end;
  insert into public.crm_outreach_events(id,lead_id,event_type,method,sequence_step) values(gen_random_uuid(),lead,'outreach','email',3),(gen_random_uuid(),lead,'outreach','email',7);
  snapshot := public.crm_outreach_dashboard(null);
  select value into stats from jsonb_array_elements(snapshot->'leadStats') where value->>'leadId'=lead::text;
  if stats->'sequenceSteps' <> '[1,3,7]'::jsonb then raise exception 'Sequence progress missing'; end if;
  insert into public.crm_outreach_events(id,lead_id,event_type) values(gen_random_uuid(),lead,'response_received');
  update public.crm_outreach_events set voided_at=now() where id=first_follow;
  begin
    insert into public.crm_outreach_events(id,lead_id,event_type,method,sequence_step) values(gen_random_uuid(),lead,'outreach','email',1);
    raise exception 'Follow-up after response accepted';
  exception when raise_exception then if sqlerrm <> 'SEQUENCE_CLOSED' then raise; end if; end;
  update public.crm_outreach_events set voided_at=now() where lead_id=lead and event_type='response_received';
  update public.crm_outreach_events set occurred_at=now()-interval '15 days' where id=initial;
  begin
    insert into public.crm_outreach_events(id,lead_id,event_type,method,sequence_step) values(gen_random_uuid(),lead,'outreach','email',1);
    raise exception 'Follow-up after day 14 accepted';
  exception when raise_exception then if sqlerrm <> 'SEQUENCE_CLOSED' then raise; end if; end;
  update public.crm_outreach_events set occurred_at=now() where id=initial;
  begin
    insert into public.crm_outreach_events(id,lead_id,event_type,method,sequence_step) values(gen_random_uuid(),lead,'outreach','email',1);
    raise exception 'Early follow-up accepted';
  exception when raise_exception then if sqlerrm <> 'FOLLOW_UP_NOT_DUE' then raise; end if; end;
  if has_function_privilege('anon','public.crm_validate_outreach_sequence()','EXECUTE') or has_function_privilege('authenticated','public.crm_validate_outreach_sequence()','EXECUTE') then raise exception 'Sequence trigger exposed'; end if;
end;
$$;
rollback;

