-- NPSD simplified admission + student photo migration
-- Student-only portal: no parent portal.
-- Run after the core NPSD schema.

alter table public.access_requests add column if not exists student_cast text;
alter table public.access_requests add column if not exists cnic text;
alter table public.access_requests add column if not exists photo_url text;
alter table public.students add column if not exists student_cast text;
alter table public.students add column if not exists cnic text;
alter table public.students add column if not exists photo_url text;

create unique index if not exists access_requests_cnic_hash_unique
on public.access_requests(cnic_hash);

insert into storage.buckets (id,name,public)
values ('student-photos','student-photos',true)
on conflict (id) do update set public=true;

drop policy if exists "NPSD public student photos read" on storage.objects;
create policy "NPSD public student photos read"
on storage.objects for select
to public
using (bucket_id='student-photos');

create or replace function public.approve_access_request(
  p_request_id uuid,
  p_approve boolean,
  p_note text default null
)
returns public.access_requests
language plpgsql
security definer
set search_path=public
as $$
declare r public.access_requests;
begin
  if not public.is_admin() then raise exception 'Not authorized'; end if;

  select * into r
  from public.access_requests
  where id=p_request_id
  for update;

  if not found then raise exception 'Request not found'; end if;

  if p_approve then
    insert into public.students(
      user_id,student_id,full_name,father_name,photo_url,class_id,active,
      dob,gender,cnic_hash,guardian_cnic_hash,admission_session,student_cast,cnic
    )
    values(
      r.auth_user_id,r.student_id,r.full_name,r.father_name,r.photo_url,r.class_id,true,
      r.dob,r.gender,r.cnic_hash,r.guardian_cnic_hash,r.admission_session,r.student_cast,r.cnic
    )
    on conflict (student_id) do update set
      user_id=excluded.user_id,
      active=true,
      full_name=excluded.full_name,
      father_name=excluded.father_name,
      photo_url=excluded.photo_url,
      class_id=excluded.class_id,
      dob=excluded.dob,
      gender=excluded.gender,
      cnic_hash=excluded.cnic_hash,
      admission_session=excluded.admission_session,
      student_cast=excluded.student_cast,
      cnic=excluded.cnic;

    update public.profiles
    set full_name=r.full_name,role='student',approved=true,updated_at=now()
    where id=r.auth_user_id;

    update public.access_requests
    set status='approved',admin_note=p_note,reviewed_by=auth.uid(),reviewed_at=now(),updated_at=now()
    where id=r.id returning * into r;
  else
    update public.profiles
    set approved=false,updated_at=now()
    where id=r.auth_user_id;

    update public.access_requests
    set status='rejected',admin_note=p_note,reviewed_by=auth.uid(),reviewed_at=now(),updated_at=now()
    where id=r.id returning * into r;
  end if;

  insert into public.audit_logs(actor_id,action,entity_type,entity_id,metadata)
  values(
    auth.uid(),
    case when p_approve then 'approve_access_request' else 'reject_access_request' end,
    'access_request',
    r.id,
    jsonb_build_object('student_id',r.student_id)
  );

  return r;
end;
$$;

grant execute on function public.approve_access_request(uuid,boolean,text) to authenticated;

select table_name,column_name,data_type
from information_schema.columns
where table_schema='public'
and table_name in ('access_requests','students')
and column_name in ('student_cast','cnic','photo_url')
order by table_name,column_name;
