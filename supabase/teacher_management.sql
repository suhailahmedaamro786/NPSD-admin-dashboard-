-- NPSD Admin: Teacher Management
-- Run this once in Supabase SQL Editor. It is additive and does not delete existing data.
create table if not exists public.teachers (
  id uuid primary key default gen_random_uuid(),
  user_id uuid unique not null references auth.users(id) on delete cascade,
  employee_id text unique not null,
  full_name text not null,
  cnic text,
  phone text,
  email text not null,
  designation text default 'Teacher',
  department text,
  joining_date date,
  active boolean not null default true,
  created_at timestamptz not null default now()
);
create table if not exists public.teacher_class_assignments (
  id uuid primary key default gen_random_uuid(),
  teacher_id uuid not null references public.teachers(id) on delete cascade,
  class_id uuid not null,
  subject text,
  academic_year text,
  is_class_teacher boolean not null default false,
  active boolean not null default true,
  created_at timestamptz not null default now()
);
create index if not exists teachers_user_id_idx on public.teachers(user_id);
create index if not exists teacher_assignments_teacher_idx on public.teacher_class_assignments(teacher_id);
create index if not exists teacher_assignments_class_idx on public.teacher_class_assignments(class_id);
alter table public.teachers enable row level security;
alter table public.teacher_class_assignments enable row level security;
drop policy if exists "teachers_self_read" on public.teachers;
create policy "teachers_self_read" on public.teachers for select to authenticated using (user_id=auth.uid());
drop policy if exists "teacher_assignments_self_read" on public.teacher_class_assignments;
create policy "teacher_assignments_self_read" on public.teacher_class_assignments for select to authenticated using (teacher_id in (select id from public.teachers where user_id=auth.uid()));
