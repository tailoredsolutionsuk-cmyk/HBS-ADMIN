-- Run against the migrated HBS database. All test rows are rolled back.
begin;
do $$
declare
 owner_uuid uuid; site_a uuid:=gen_random_uuid(); site_b uuid:=gen_random_uuid();
 job_a uuid:=gen_random_uuid(); job_b uuid:=gen_random_uuid(); token uuid:=gen_random_uuid();
 claimed public.builder_jobs; total integer;
begin
 select user_id into owner_uuid from public.admin_users where role in ('owner','admin') limit 1;
 if owner_uuid is null then raise exception 'An existing admin is required';end if;
 if has_table_privilege('anon','public.builder_jobs','SELECT') or has_table_privilege('authenticated','public.builder_jobs','INSERT')
 or has_table_privilege('anon','public.builder_metrics','SELECT') or has_function_privilege('authenticated','public.builder_claim_job(uuid,uuid)','EXECUTE')
 then raise exception 'Browser roles have builder access';end if;
 insert into public.builder_sites(id,owner_id,name,draft) values(site_a,owner_uuid,'Rollback-only test A','{}'),(site_b,owner_uuid,'Rollback-only test B','{}');
 select count(*) into total from public.builder_versions where site_id=site_a and revision=0;
 if total<>1 then raise exception 'Initial snapshot missing';end if;
 update public.builder_sites set revision=1,draft='{"revision":1}' where id=site_a;
 select count(*) into total from public.builder_versions where site_id=site_a;
 if total<>2 then raise exception 'Version snapshot missing';end if;
 begin
  update public.builder_sites set project_id='prj_2jlYsvVapKcqzZEbtP9wZNNZ9fL4' where id=site_a;
  raise exception 'CRM project was accepted';
 exception when check_violation then null;end;
 insert into public.builder_jobs(id,site_id,owner_id,revision,kind) values(job_a,site_a,owner_uuid,1,'preview');
 begin
  insert into public.builder_jobs(id,site_id,owner_id,revision,kind) values(gen_random_uuid(),site_a,owner_uuid,1,'publish');
  raise exception 'Concurrent site job was accepted';
 exception when unique_violation then null;end;
 select * into claimed from public.builder_claim_job(token,gen_random_uuid());
 if claimed.id is not null then raise exception 'Another owner claimed a job';end if;
 select * into claimed from public.builder_claim_job(token,owner_uuid);
 if claimed.id<>job_a or claimed.attempts<>1 or claimed.status<>'running' then raise exception 'Initial job claim failed';end if;
 select * into claimed from public.builder_claim_job(gen_random_uuid(),owner_uuid);
 if claimed.id is not null then raise exception 'A live lease was claimed twice';end if;
 update public.builder_jobs set lease_until=now()-interval '1 second' where id=job_a;
 select * into claimed from public.builder_claim_job(gen_random_uuid(),owner_uuid);
 if claimed.id<>job_a or claimed.attempts<>2 then raise exception 'Expired preview job was not recovered';end if;
 update public.builder_jobs set status='waiting',lease_token=null,lease_until=null,available_at=now() where id=job_a;
 select * into claimed from public.builder_claim_job(gen_random_uuid(),owner_uuid);
 if claimed.attempts<>2 then raise exception 'Polling incorrectly spent retry budget';end if;
 update public.builder_jobs set status='succeeded',lease_token=null where id=job_a;
 insert into public.builder_jobs(id,site_id,owner_id,revision,kind,status,attempts,lease_until) values(job_b,site_b,owner_uuid,0,'ai','running',1,now()-interval '1 second');
 select * into claimed from public.builder_claim_job(gen_random_uuid(),owner_uuid);
 if claimed.id is not null then raise exception 'A crashed paid AI call was repeated';end if;
 if (select status from public.builder_jobs where id=job_b)<>'failed' then raise exception 'Crashed AI job not surfaced';end if;
 perform public.builder_count_view(site_a,'home');perform public.builder_count_view(site_a,'home');
 if(select views from public.builder_metrics where site_id=site_a and page='home')<>2 then raise exception 'Atomic view increment failed';end if;
 if exists(select 1 from public.builder_metrics where site_id=site_b) then raise exception 'Metrics crossed websites';end if;
 if not public.builder_rate_limit('rollback-only-builder',1,60) or public.builder_rate_limit('rollback-only-builder',1,60) then raise exception 'Rate limit failed';end if;
end;
$$;
rollback;
select 'PASS: snapshots, protected targets, browser-denied access, job isolation/leases/retries, no AI double charge, per-site metrics and rate limits. Test rows rolled back.' as result;
