-- NPSD shared Supabase foundation
-- Run in Supabase SQL Editor after backing up any existing schema.
create extension if not exists pgcrypto;

create table if not exists public.profiles (
 id uuid primary key references auth.users(id) on delete cascade,
 full_name text,
 email text,
 role text not null default 'student' check(role in ('admin','student','parent')),
 approved boolean not null default false,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table if not exists public.classes (
 id uuid primary key default gen_random_uuid(), name text not null, section text not null,
 academic_year text, created_at timestamptz not null default now(), unique(name,section,academic_year)
);
create table if not exists public.students (
 id uuid primary key default gen_random_uuid(), user_id uuid unique references auth.users(id) on delete set null,
 student_id text not null unique, full_name text not null, father_name text, guardian_name text,
 photo_url text, class_id uuid references public.classes(id) on delete set null,
 active boolean not null default true, created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table if not exists public.parents (
 id uuid primary key default gen_random_uuid(), user_id uuid unique references auth.users(id) on delete cascade,
 full_name text not null, phone text, approved boolean not null default false, created_at timestamptz not null default now()
);
create table if not exists public.parent_student_links (
 parent_id uuid not null references public.parents(id) on delete cascade,
 student_id uuid not null references public.students(id) on delete cascade,
 relationship text, approved boolean not null default false, created_at timestamptz not null default now(),
 primary key(parent_id,student_id)
);
create table if not exists public.subjects (
 id uuid primary key default gen_random_uuid(), name text not null, code text unique, created_at timestamptz not null default now()
);
create table if not exists public.attendance (
 id uuid primary key default gen_random_uuid(), student_id uuid not null references public.students(id) on delete cascade,
 attendance_date date not null, status text not null check(status in ('present','absent','late')), note text,
 created_at timestamptz not null default now(), unique(student_id,attendance_date)
);
create table if not exists public.exams (
 id uuid primary key default gen_random_uuid(), name text not null, exam_date date, academic_year text,
 created_at timestamptz not null default now()
);
create table if not exists public.results (
 id uuid primary key default gen_random_uuid(), student_id uuid not null references public.students(id) on delete cascade,
 exam_id uuid not null references public.exams(id) on delete cascade, subject_id uuid references public.subjects(id) on delete set null,
 marks_obtained numeric(8,2), total_marks numeric(8,2), grade text, position integer, pass boolean,
 published boolean not null default false, created_at timestamptz not null default now(), unique(student_id,exam_id,subject_id)
);
create table if not exists public.result_documents (
 id uuid primary key default gen_random_uuid(), file_path text not null, file_name text not null,
 class_id uuid references public.classes(id) on delete set null,
 status text not null default 'pending' check(status in ('pending','processing','review','published','rejected')),
 uploaded_by uuid references auth.users(id) on delete set null, created_at timestamptz not null default now()
);
create table if not exists public.announcements (
 id uuid primary key default gen_random_uuid(), title text not null, body text not null,
 published boolean not null default false, published_at timestamptz, created_at timestamptz not null default now()
);
create table if not exists public.student_cards (
 id uuid primary key default gen_random_uuid(), student_id uuid not null unique references public.students(id) on delete cascade,
 qr_token_hash text unique, active boolean not null default true, created_at timestamptz not null default now()
);
create table if not exists public.audit_logs (
 id uuid primary key default gen_random_uuid(), actor_id uuid references auth.users(id) on delete set null,
 action text not null, entity_type text, entity_id uuid, metadata jsonb not null default '{}'::jsonb,
 created_at timestamptz not null default now()
);

create or replace function public.is_admin() returns boolean language sql stable security definer set search_path=public as $$
 select exists(select 1 from public.profiles where id=auth.uid() and role='admin' and approved=true)
$$;
create or replace function public.is_approved_user() returns boolean language sql stable security definer set search_path=public as $$
 select exists(select 1 from public.profiles where id=auth.uid() and approved=true)
$$;
create or replace function public.owns_student(p_student_id uuid) returns boolean language sql stable security definer set search_path=public as $$
 select exists(select 1 from public.students where id=p_student_id and user_id=auth.uid())
 or exists(select 1 from public.parent_student_links l join public.parents p on p.id=l.parent_id
           where l.student_id=p_student_id and l.approved=true and p.user_id=auth.uid() and p.approved=true)
$$;

alter table public.profiles enable row level security;
alter table public.classes enable row level security;
alter table public.students enable row level security;
alter table public.parents enable row level security;
alter table public.parent_student_links enable row level security;
alter table public.subjects enable row level security;
alter table public.attendance enable row level security;
alter table public.exams enable row level security;
alter table public.results enable row level security;
alter table public.result_documents enable row level security;
alter table public.announcements enable row level security;
alter table public.student_cards enable row level security;
alter table public.audit_logs enable row level security;

-- Drop only policies created by this schema so it can be safely re-run.
do $$ declare r record; begin
 for r in select policyname,tablename from pg_policies where schemaname='public' and policyname like 'npsd_%' loop
   execute format('drop policy if exists %I on public.%I',r.policyname,r.tablename);
 end loop; end $$;

create policy npsd_profiles_admin on public.profiles for all to authenticated using(public.is_admin()) with check(public.is_admin());
create policy npsd_profiles_self on public.profiles for select to authenticated using(id=auth.uid() and approved=true);
create policy npsd_classes_admin on public.classes for all to authenticated using(public.is_admin()) with check(public.is_admin());
create policy npsd_classes_read on public.classes for select to authenticated using(public.is_approved_user());
create policy npsd_students_admin on public.students for all to authenticated using(public.is_admin()) with check(public.is_admin());
create policy npsd_students_read on public.students for select to authenticated using(public.is_approved_user() and (user_id=auth.uid() or public.owns_student(id)));
create policy npsd_parents_admin on public.parents for all to authenticated using(public.is_admin()) with check(public.is_admin());
create policy npsd_parents_self on public.parents for select to authenticated using(user_id=auth.uid());
create policy npsd_links_admin on public.parent_student_links for all to authenticated using(public.is_admin()) with check(public.is_admin());
create policy npsd_links_parent on public.parent_student_links for select to authenticated using(exists(select 1 from public.parents p where p.id=parent_id and p.user_id=auth.uid() and p.approved=true));
create policy npsd_subjects_admin on public.subjects for all to authenticated using(public.is_admin()) with check(public.is_admin());
create policy npsd_subjects_read on public.subjects for select to authenticated using(public.is_approved_user());
create policy npsd_attendance_admin on public.attendance for all to authenticated using(public.is_admin()) with check(public.is_admin());
create policy npsd_attendance_read on public.attendance for select to authenticated using(public.is_approved_user() and public.owns_student(student_id));
create policy npsd_exams_admin on public.exams for all to authenticated using(public.is_admin()) with check(public.is_admin());
create policy npsd_exams_read on public.exams for select to authenticated using(public.is_approved_user());
create policy npsd_results_admin on public.results for all to authenticated using(public.is_admin()) with check(public.is_admin());
create policy npsd_results_read on public.results for select to authenticated using(public.is_approved_user() and published=true and public.owns_student(student_id));
create policy npsd_docs_admin on public.result_documents for all to authenticated using(public.is_admin()) with check(public.is_admin());
create policy npsd_ann_admin on public.announcements for all to authenticated using(public.is_admin()) with check(public.is_admin());
create policy npsd_ann_read on public.announcements for select to authenticated using(public.is_approved_user() and published=true);
create policy npsd_cards_admin on public.student_cards for all to authenticated using(public.is_admin()) with check(public.is_admin());
create policy npsd_cards_read on public.student_cards for select to authenticated using(public.is_approved_user() and public.owns_student(student_id));
create policy npsd_audit_admin on public.audit_logs for all to authenticated using(public.is_admin()) with check(public.is_admin());

create or replace function public.set_updated_at() returns trigger language plpgsql as $$ begin new.updated_at=now(); return new; end; $$;
drop trigger if exists npsd_profiles_updated on public.profiles;
create trigger npsd_profiles_updated before update on public.profiles for each row execute function public.set_updated_at();
drop trigger if exists npsd_students_updated on public.students;
create trigger npsd_students_updated before update on public.students for each row execute function public.set_updated_at();
