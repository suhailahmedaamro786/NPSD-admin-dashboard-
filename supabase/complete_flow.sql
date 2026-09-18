-- NPSD COMPLETE REGISTRATION / APPROVAL FLOW
-- Full migration plus compatibility fixes.

create extension if not exists pgcrypto;
create sequence if not exists public.npsd_student_number_seq;

alter table public.students add column if not exists dob date;
alter table public.students add column if not exists gender text;
alter table public.students add column if not exists cnic_hash text;
alter table public.students add column if not exists guardian_cnic_hash text;
alter table public.students add column if not exists phone text;
alter table public.students add column if not exists whatsapp text;
alter table public.students add column if not exists email text;
alter table public.students add column if not exists address text;
alter table public.students add column if not exists city text;
alter table public.students add column if not exists admission_session text;
alter table public.students add column if not exists admission_date date;
alter table public.students add column if not exists previous_school text;
alter table public.students add column if not exists previous_class text;
alter table public.students add column if not exists emergency_name text;
alter table public.students add column if not exists emergency_phone text;
alter table public.students add column if not exists relationship text;
alter table public.students add column if not exists notes text;

create table if not exists public.access_requests(
 id uuid primary key default gen_random_uuid(),
 auth_user_id uuid unique references auth.users(id) on delete cascade,
 tracking_token text not null unique,
 student_id text not null unique default ('NPSD-'||to_char(current_date,'YYYY')||'-'||lpad(nextval('public.npsd_student_number_seq')::text,6,'0')),
 full_name text not null,
 father_name text not null,
 guardian_name text,
 dob date not null,
 gender text not null,
 cnic_hash text not null unique,
 guardian_cnic_hash text not null,
 phone text, whatsapp text, email text,
 address text not null, city text not null,
 admission_session text not null,
 class_id uuid references public.classes(id) on delete set null,
 section text,
 previous_school text, previous_class text,
 admission_date date,
 photo_url text,
 emergency_name text not null,
 emergency_phone text not null,
 relationship text not null,
 notes text,
 status text not null default 'pending' check(status in ('pending','approved','rejected')),
 admin_note text,
 reviewed_by uuid references auth.users(id) on delete set null,
 reviewed_at timestamptz,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);

create index if not exists access_requests_status_idx on public.access_requests(status,created_at desc);
create index if not exists access_requests_class_idx on public.access_requests(class_id);

alter table public.access_requests enable row level security;
drop policy if exists npsd_requests_admin on public.access_requests;
drop policy if exists npsd_requests_anon_insert on public.access_requests;
create policy npsd_requests_admin on public.access_requests for all to authenticated using(public.is_admin()) with check(public.is_admin());

-- Approval: tolerate legacy requests whose auth user was deleted.
create or replace function public.approve_access_request(p_request_id uuid, p_approve boolean, p_note text default null)
returns public.access_requests
language plpgsql
security definer
set search_path=public
as $$
declare
 r public.access_requests;
 v_user_id uuid;
begin
 if not public.is_admin() then raise exception 'Not authorized'; end if;
 select * into r from public.access_requests where id=p_request_id for update;
 if not found then raise exception 'Request not found'; end if;

 if p_approve then
   if r.auth_user_id is not null and exists (select 1 from auth.users u where u.id=r.auth_user_id) then
     v_user_id := r.auth_user_id;
   else
     v_user_id := null;
   end if;

   insert into public.students(
     user_id,student_id,full_name,father_name,guardian_name,photo_url,class_id,active,
     dob,gender,cnic_hash,guardian_cnic_hash,phone,whatsapp,email,address,city,
     admission_session,admission_date,previous_school,previous_class,
     emergency_name,emergency_phone,relationship,notes
   )
   values(
     v_user_id,r.student_id,r.full_name,r.father_name,r.guardian_name,r.photo_url,r.class_id,true,
     r.dob,r.gender,r.cnic_hash,r.guardian_cnic_hash,r.phone,r.whatsapp,r.email,
     coalesce(nullif(trim(r.address),''),'Not provided'),
     coalesce(nullif(trim(r.city),''),'Not provided'),
     r.admission_session,r.admission_date,r.previous_school,r.previous_class,
     coalesce(nullif(trim(r.emergency_name),''),'Not provided'),
     coalesce(nullif(trim(r.emergency_phone),''),'Not provided'),
     coalesce(nullif(trim(r.relationship),''),'Not provided'),r.notes
   )
   on conflict (student_id) do update set
     user_id=excluded.user_id,active=true,full_name=excluded.full_name,class_id=excluded.class_id;

   if v_user_id is not null then
     update public.profiles
     set full_name=r.full_name,role='student',approved=true,updated_at=now()
     where id=v_user_id;
   end if;

   update public.access_requests
   set status='approved',admin_note=p_note,reviewed_by=auth.uid(),reviewed_at=now(),updated_at=now()
   where id=r.id returning * into r;
 else
   if r.auth_user_id is not null then
     update public.profiles set approved=false where id=r.auth_user_id;
   end if;
   update public.access_requests
   set status='rejected',admin_note=p_note,reviewed_by=auth.uid(),reviewed_at=now(),updated_at=now()
   where id=r.id returning * into r;
 end if;

 insert into public.audit_logs(actor_id,action,entity_type,entity_id,metadata)
 values(auth.uid(),case when p_approve then 'approve_access_request' else 'reject_access_request' end,
 'access_request',r.id,jsonb_build_object('student_id',r.student_id));
 return r;
end;
$$;

grant execute on function public.approve_access_request(uuid,boolean,text) to authenticated;

create or replace function public.approve_access_request(p_action text, p_request_id uuid)
returns public.access_requests language sql security definer set search_path=public as $$
 select public.approve_access_request(p_request_id,lower(trim(p_action))='approve',null);
$$;
grant execute on function public.approve_access_request(text,uuid) to authenticated;

create or replace function public.approve_access_request(p_request_id uuid, p_action text)
returns public.access_requests language sql security definer set search_path=public as $$
 select public.approve_access_request(p_request_id,lower(trim(p_action))='approve',null);
$$;
grant execute on function public.approve_access_request(uuid,text) to authenticated;

create or replace function public.set_access_request_updated_at() returns trigger language plpgsql as $$
begin new.updated_at=now(); return new; end; $$;
drop trigger if exists npsd_access_requests_updated on public.access_requests;
create trigger npsd_access_requests_updated before update on public.access_requests for each row execute function public.set_access_request_updated_at();

drop policy if exists npsd_classes_public_read on public.classes;
create policy npsd_classes_public_read on public.classes for select to anon using(true);

insert into public.classes(name,section,academic_year)
select 'Class ' || n, 'A', '2026-27'
from generate_series(1,12) as n
where not exists (select 1 from public.classes c where c.name='Class ' || n and c.academic_year='2026-27');

-- Existing students compatibility.
alter table public.students add column if not exists guardian_name text;
alter table public.students add column if not exists dob date;
alter table public.students add column if not exists gender text;
alter table public.students add column if not exists cnic_hash text;
alter table public.students add column if not exists guardian_cnic_hash text;
alter table public.students add column if not exists phone text;
alter table public.students add column if not exists whatsapp text;
alter table public.students add column if not exists email text;
alter table public.students add column if not exists address text;
alter table public.students add column if not exists city text;
alter table public.students add column if not exists admission_session text;
alter table public.students add column if not exists admission_date date;
alter table public.students add column if not exists previous_school text;
alter table public.students add column if not exists previous_class text;
alter table public.students add column if not exists emergency_name text;
alter table public.students add column if not exists emergency_phone text;
alter table public.students add column if not exists relationship text;
alter table public.students add column if not exists notes text;

-- Repair legacy pending requests.
update public.access_requests
set
 address=coalesce(nullif(trim(address),''),'Not provided'),
 city=coalesce(nullif(trim(city),''),'Not provided'),
 emergency_name=coalesce(nullif(trim(emergency_name),''),'Not provided'),
 emergency_phone=coalesce(nullif(trim(emergency_phone),''),'Not provided'),
 relationship=coalesce(nullif(trim(relationship),''),'Not provided')
where address is null or city is null or emergency_name is null or emergency_phone is null or relationship is null;
