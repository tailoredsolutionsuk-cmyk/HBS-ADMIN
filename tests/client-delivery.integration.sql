-- Run only on an isolated Supabase test database after both client-delivery migrations.
-- The transaction leaves no test client, user, proposal, review or audit rows behind.
begin;
do $test$
declare
  actor uuid := gen_random_uuid();
  reviewer uuid := gen_random_uuid();
  client text := 'delivery-test-' || gen_random_uuid()::text;
  project uuid := gen_random_uuid();
  packet uuid;
  ai_run uuid;
  blocked boolean;
begin
  insert into auth.users(id,email) values
    (actor,actor::text || '@example.invalid'),
    (reviewer,reviewer::text || '@example.invalid');
  insert into public.clients(id,business_name,short_name) values(client,'Synthetic Motors','Synthetic');
  insert into public.onboarding_projects
    (id,client_id,name,service,status,revision,brief,creation_payload,created_by)
  values(project,client,'Synthetic website and Meta Ads','Website and Meta Ads','approved',2,
    '{"business":"Synthetic Motors","audience":"Local drivers","goals":"Enquiries","pages":"Home and contact"}',
    jsonb_build_object('client_id',client,'name','Synthetic website and Meta Ads','service','Website and Meta Ads'),actor);

  insert into public.onboarding_meta_proposals(project_id,source_brief_revision,draft,created_by,updated_by)
  values(project,2,'{"landingPage":"https://preview.example.invalid","primaryText":"Draft"}',actor,actor);
  if (select count(*) from public.onboarding_meta_proposal_versions where project_id=project) <> 1 then
    raise exception 'FAIL initial proposal snapshot';
  end if;
  update public.onboarding_meta_proposals set reviewed_revision=0,review_decision='approved',
    review_note='Checked',reviewed_by=actor,reviewed_at=now() where project_id=project;
  if (select count(*) from public.onboarding_meta_reviews where project_id=project) <> 1 then
    raise exception 'FAIL owner review audit';
  end if;
  blocked := false;
  begin
    update public.onboarding_meta_proposals set draft='{"primaryText":"Changed without revision"}' where project_id=project;
  exception when serialization_failure then blocked := true;
  end;
  if not blocked then raise exception 'FAIL unversioned proposal edit'; end if;
  update public.onboarding_meta_proposals set revision=1,updated_by=actor,
    draft='{"landingPage":"https://preview.example.invalid","primaryText":"Revised"}' where project_id=project;
  if (select count(*) from public.onboarding_meta_proposal_versions where project_id=project) <> 2 then
    raise exception 'FAIL revised proposal snapshot';
  end if;

  insert into public.onboarding_meta_ai_runs(project_id,source_brief_revision,requested_by,model,input_sha256)
  values(project,2,actor,'gpt-test',repeat('a',64)) returning id into ai_run;
  update public.onboarding_meta_ai_runs set status='succeeded',input_tokens=100,output_tokens=20,
    completed_at=now() where id=ai_run;
  if not exists(select 1 from public.onboarding_meta_ai_runs where id=ai_run and status='succeeded'
    and input_tokens=100 and output_tokens=20) then raise exception 'FAIL AI audit'; end if;

  insert into public.onboarding_review_packets(project_id,brief_revision,site_revision,preview_deployment,
    preview_url,proposal_revision,qa_note,released_by)
  values(project,2,1,'dpl_synthetic','https://preview.example.invalid',1,'Checked four pages',actor)
  returning id into packet;
  insert into public.onboarding_client_reviews(packet_id,decision,feedback,reviewed_by)
  values(packet,'changes_requested','Change the headline',reviewer),(packet,'approved','Looks good',reviewer);
  if (select decision from public.onboarding_client_reviews where packet_id=packet
      order by event_no desc limit 1) <> 'approved' then raise exception 'FAIL latest client decision'; end if;
  blocked := false;
  begin
    insert into public.onboarding_review_packets(project_id,brief_revision,site_revision,preview_deployment,
      preview_url,proposal_revision,qa_note,released_by)
    values(project,2,1,'dpl_synthetic','https://preview.example.invalid',1,'Duplicate',actor);
  exception when unique_violation then blocked := true;
  end;
  if not blocked then raise exception 'FAIL duplicate review packet'; end if;
  if has_table_privilege('anon','public.onboarding_meta_proposals','SELECT')
    or has_table_privilege('anon','public.onboarding_review_packets','SELECT')
    or has_table_privilege('authenticated','public.onboarding_meta_proposals','SELECT')
    or has_table_privilege('authenticated','public.onboarding_meta_ai_runs','INSERT')
    or has_table_privilege('authenticated','public.onboarding_review_packets','SELECT')
    or has_table_privilege('authenticated','public.onboarding_client_reviews','INSERT') then
    raise exception 'FAIL browser table grants';
  end if;
  if exists(select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace
    where n.nspname='public' and c.relname in ('onboarding_meta_proposals','onboarding_meta_proposal_versions',
      'onboarding_meta_reviews','onboarding_meta_ai_runs','onboarding_review_packets','onboarding_client_reviews')
      and not c.relrowsecurity) then raise exception 'FAIL delivery RLS'; end if;
end $test$;
rollback;
select 'PASS: versioned proposals, review and AI audits, client decision order, packet idempotency and browser-denied grants; fixtures rolled back' as result;
