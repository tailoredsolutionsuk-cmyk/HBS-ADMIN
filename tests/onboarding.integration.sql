-- Transaction-only integration tests. All fixtures and mutations are rolled back.
begin;
set local request.jwt.claim.role = 'service_role';
do $test$
declare
  a uuid := gen_random_uuid(); u uuid := gen_random_uuid(); other_user uuid := gen_random_uuid();
  viewer uuid := gen_random_uuid(); project uuid := gen_random_uuid();
  client text := 'onboarding-test-'||gen_random_uuid()::text;
  other_client text := 'onboarding-test-'||gen_random_uuid()::text;
  p jsonb; result public.onboarding_projects; blocked boolean;
  good_brief jsonb := '{"business":"Test business","audience":"Test audience","goals":"Test goals","pages":"Home and contact"}';
begin
  insert into auth.users(id,email) values (a,a::text||'@example.invalid'),(u,u::text||'@example.invalid'),(other_user,other_user::text||'@example.invalid'),(viewer,viewer::text||'@example.invalid');
  insert into public.admin_users(user_id,email,role) values(a,a::text||'@example.invalid','owner'),(viewer,viewer::text||'@example.invalid','viewer');
  insert into public.clients(id,business_name,short_name,portal_enabled,portal_email) values
    (client,'Onboarding test','Test',true,u::text||'@example.invalid'),
    (other_client,'Other test','Other',true,other_user::text||'@example.invalid');
  insert into public.client_portal_users(user_id,client_id,email) values(u,client,u::text||'@example.invalid'),(other_user,other_client,other_user::text||'@example.invalid');
  p := jsonb_build_object('client_id',client,'name','Integration test','service','Website','target_date',null);
  execute 'set local role service_role';
  result := public.onboarding_mutate('create',project,a,p);
  if result.status <> 'collecting' then raise exception 'FAIL create'; end if;
  result := public.onboarding_mutate('create',project,a,p);
  if (select count(*) from public.checklist_items where onboarding_project_id=project) <> 8 then raise exception 'FAIL duplicate checklist'; end if;
  if (select count(*) from public.onboarding_events where project_id=project) <> 1 then raise exception 'FAIL duplicate event'; end if;
  blocked := false;
  begin perform public.onboarding_mutate('create',project,a,p||'{"name":"Changed"}'); exception when serialization_failure then blocked:=true; end;
  if not blocked then raise exception 'FAIL conflicting creation'; end if;
  blocked := false;
  begin perform public.onboarding_mutate('create',gen_random_uuid(),viewer,p); exception when insufficient_privilege then blocked:=true; end;
  if not blocked then raise exception 'FAIL viewer can create'; end if;
  blocked := false;
  begin perform public.onboarding_mutate('submit',project,other_user,jsonb_build_object('brief',good_brief,'authenticated_email',u::text||'@example.invalid'),0); exception when insufficient_privilege then blocked:=true; end;
  if not blocked then raise exception 'FAIL cross-client write'; end if;
  blocked := false;
  begin perform public.onboarding_mutate('submit',project,u,jsonb_build_object('brief','{}'::jsonb,'authenticated_email',u::text||'@example.invalid'),0); exception when invalid_parameter_value then blocked:=true; end;
  if not blocked then raise exception 'FAIL incomplete submission'; end if;
  result := public.onboarding_mutate('save',project,u,jsonb_build_object('brief','{"business":"Draft"}'::jsonb,'authenticated_email',u::text||'@example.invalid'),0);
  if result.revision <> 1 then raise exception 'FAIL draft revision'; end if;
  blocked := false;
  begin perform public.onboarding_mutate('submit',project,u,jsonb_build_object('brief',good_brief,'authenticated_email',u::text||'@example.invalid'),0); exception when serialization_failure then blocked:=true; end;
  if not blocked then raise exception 'FAIL stale revision'; end if;
  result := public.onboarding_mutate('submit',project,u,jsonb_build_object('brief',good_brief,'authenticated_email',u::text||'@example.invalid'),1);
  if result.status <> 'submitted' or not (select done from public.checklist_items where id='onboarding:'||project::text||':brief') then raise exception 'FAIL submit task'; end if;
  blocked := false;
  begin perform public.onboarding_mutate('approve',project,u,'{}',2); exception when insufficient_privilege then blocked:=true; end;
  if not blocked then raise exception 'FAIL client can approve'; end if;
  result := public.onboarding_mutate('request_changes',project,a,'{"note":"Please expand the brief."}',2);
  if result.status <> 'changes_requested' or (select done from public.checklist_items where id='onboarding:'||project::text||':brief') then raise exception 'FAIL request changes'; end if;
  update public.clients set portal_enabled=false where id=client;
  blocked := false;
  begin perform public.onboarding_mutate('save',project,u,jsonb_build_object('brief',good_brief,'authenticated_email',u::text||'@example.invalid'),3); exception when insufficient_privilege then blocked:=true; end;
  if not blocked then raise exception 'FAIL revoked access'; end if;
  update public.clients set portal_enabled=true where id=client;
  result := public.onboarding_mutate('submit',project,u,jsonb_build_object('brief',good_brief,'authenticated_email',u::text||'@example.invalid'),3);
  result := public.onboarding_mutate('approve',project,a,'{"note":"Approved"}',4);
  if result.status <> 'approved' or result.revision <> 5 or not (select done from public.checklist_items where id='onboarding:'||project::text||':review') then raise exception 'FAIL approval'; end if;
  blocked := false;
  begin perform public.onboarding_mutate('save',project,u,jsonb_build_object('brief',good_brief,'authenticated_email',u::text||'@example.invalid'),5); exception when serialization_failure then blocked:=true; end;
  if not blocked then raise exception 'FAIL approved edit'; end if;
  if has_table_privilege('anon','public.onboarding_projects','SELECT') or has_table_privilege('authenticated','public.onboarding_projects','SELECT') then raise exception 'FAIL browser table grants'; end if;
  if has_function_privilege('authenticated','public.onboarding_mutate(text,uuid,uuid,jsonb,integer)','EXECUTE') or has_function_privilege('anon','public.onboarding_mutate(text,uuid,uuid,jsonb,integer)','EXECUTE') then raise exception 'FAIL browser RPC grants'; end if;
  if not has_function_privilege('service_role','public.onboarding_mutate(text,uuid,uuid,jsonb,integer)','EXECUTE') then raise exception 'FAIL service RPC grant'; end if;
end $test$;
rollback;
select 'PASS: creation, idempotency, permissions, cross-client isolation, revisions, brief lifecycle and revoked access; all fixtures rolled back' as result;
