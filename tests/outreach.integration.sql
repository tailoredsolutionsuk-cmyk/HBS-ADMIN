-- Exercises the real aggregation and constraints, then rolls back every test entry.
begin isolation level repeatable read;
do $$
declare
  target_lead uuid;
  staff_id uuid;
  call_one uuid := gen_random_uuid();
  baseline jsonb;
  baseline_day jsonb;
  result jsonb;
begin
  select id into target_lead from public.leads order by id limit 1;
  select user_id into staff_id from public.admin_users order by created_at limit 1;
  if target_lead is null or staff_id is null then raise exception 'A test lead and staff account are required'; end if;
  baseline := public.crm_outreach_dashboard(null);
  baseline_day := public.crm_outreach_dashboard(now()-interval '1 day');
  insert into public.crm_outreach_events(id,lead_id,event_type,method,created_by)
    values(call_one,target_lead,'outreach','call',staff_id),
      (gen_random_uuid(),target_lead,'outreach','call',staff_id);
  insert into public.crm_outreach_events(id,lead_id,event_type,method,created_by,occurred_at)
    values(gen_random_uuid(),target_lead,'outreach','email',staff_id,now()-interval '10 days');
  insert into public.crm_outreach_events(id,lead_id,event_type,created_by)
    values(gen_random_uuid(),target_lead,'meeting_booked',staff_id);
  result := public.crm_outreach_dashboard(null);
  if (result#>>'{totals,outreaches}')::int <> (baseline#>>'{totals,outreaches}')::int+3 then raise exception 'Repeated attempts or meeting separation failed'; end if;
  if (result#>>'{byMethod,call}')::int <> coalesce((baseline#>>'{byMethod,call}')::int,0)+2 then raise exception 'Method totals failed'; end if;
  if (result#>>'{totals,meetingsBooked}')::int <> (baseline#>>'{totals,meetingsBooked}')::int+1 then raise exception 'Meeting total failed'; end if;
  result := public.crm_outreach_dashboard(now()-interval '1 day');
  if (result#>>'{totals,outreaches}')::int <> (baseline_day#>>'{totals,outreaches}')::int+2 then raise exception 'The reporting period included the older email'; end if;
  if exists(select 1 from jsonb_array_elements(result->'leadStats') s where s->>'leadId'=target_lead::text and (s->>'attempts')::int < 3) then raise exception 'Lifetime history lost outside reporting period'; end if;
  begin
    insert into public.crm_outreach_events(id,lead_id,event_type,created_by) values(gen_random_uuid(),target_lead,'meeting_booked',staff_id);
    raise exception 'A booking was counted twice';
  exception when unique_violation then null;
  end;
  begin
    insert into public.crm_outreach_events(id,lead_id,event_type,method,created_by) values(call_one,target_lead,'outreach','call',staff_id);
    raise exception 'A duplicate event ID was accepted';
  exception when unique_violation then null;
  end;
  update public.crm_outreach_events set voided_at=now(),voided_by=staff_id where id=call_one;
  result := public.crm_outreach_dashboard(null);
  if (result#>>'{totals,outreaches}')::int <> (baseline#>>'{totals,outreaches}')::int+2 then raise exception 'Undo did not update totals'; end if;
  if not exists(select 1 from public.crm_outreach_events where id=call_one and voided_at is not null) then raise exception 'Undo removed audit history'; end if;
  if has_table_privilege('anon','public.crm_outreach_events','select') or has_table_privilege('authenticated','public.crm_outreach_events','insert') then raise exception 'Direct browser access is exposed'; end if;
  if has_function_privilege('anon','public.crm_outreach_dashboard(timestamptz)','execute') or has_function_privilege('authenticated','public.crm_outreach_dashboard(timestamptz)','execute') then raise exception 'Direct browser RPC access is exposed'; end if;
  if not has_function_privilege('service_role','public.crm_outreach_dashboard(timestamptz)','execute') then raise exception 'Server aggregation grant missing'; end if;
end;
$$;
rollback;
select 'Outreach aggregation, uniqueness, undo and access checks passed; all test entries rolled back.' as verification;
