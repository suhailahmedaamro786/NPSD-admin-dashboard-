-- NPSD PRODUCTION ERP FOUNDATION
-- Run AFTER the existing NPSD core/teacher migrations.
-- Student + Teacher + Admin only. No parent portal.
-- Idempotent migration for advanced ERP modules.

create extension if not exists pgcrypto;

-- SUBJECT CATALOG
create table if not exists public.subjects (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  code text,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

-- TIMETABLE
create table if not exists public.timetable_entries (
  id uuid primary key default gen_random_uuid(),
  class_id uuid not null references public.classes(id) on delete cascade,
  teacher_id uuid references public.teachers(id) on delete set null,
  subject_id uuid references public.subjects(id) on delete set null,
  day_of_week smallint not null check (day_of_week between 1 and 7),
  start_time time not null,
  end_time time not null,
  room text,
  academic_year text default '2026-27',
  created_at timestamptz not null default now(),
  check (end_time > start_time)
);

-- HOMEWORK / ASSIGNMENTS
create table if not exists public.homework (
  id uuid primary key default gen_random_uuid(),
  class_id uuid not null references public.classes(id) on delete cascade,
  teacher_id uuid references public.teachers(id) on delete set null,
  subject_id uuid references public.subjects(id) on delete set null,
  title text not null,
  description text,
  due_date date,
  attachment_url text,
  published boolean not null default true,
  created_at timestamptz not null default now()
);

-- STUDY MATERIAL
create table if not exists public.study_materials (
  id uuid primary key default gen_random_uuid(),
  class_id uuid references public.classes(id) on delete cascade,
  teacher_id uuid references public.teachers(id) on delete set null,
  subject_id uuid references public.subjects(id) on delete set null,
  title text not null,
  description text,
  file_url text,
  published boolean not null default true,
  created_at timestamptz not null default now()
);

-- FEES
create table if not exists public.fee_structures (
  id uuid primary key default gen_random_uuid(),
  class_id uuid references public.classes(id) on delete cascade,
  title text not null,
  amount numeric(12,2) not null check (amount >= 0),
  frequency text not null default 'monthly',
  academic_year text default '2026-27',
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.student_fees (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.students(id) on delete cascade,
  fee_structure_id uuid references public.fee_structures(id) on delete set null,
  billing_month date not null,
  amount_due numeric(12,2) not null check (amount_due >= 0),
  amount_paid numeric(12,2) not null default 0 check (amount_paid >= 0),
  due_date date,
  status text not null default 'unpaid' check (status in ('unpaid','partial','paid','waived')),
  created_at timestamptz not null default now(),
  unique(student_id, billing_month, fee_structure_id)
);

create table if not exists public.fee_payments (
  id uuid primary key default gen_random_uuid(),
  student_fee_id uuid not null references public.student_fees(id) on delete cascade,
  amount numeric(12,2) not null check (amount > 0),
  payment_method text default 'cash',
  receipt_no text unique,
  paid_at timestamptz not null default now(),
  recorded_by uuid references auth.users(id) on delete set null,
  note text
);

-- LIBRARY
create table if not exists public.library_books (
  id uuid primary key default gen_random_uuid(),
  isbn text,
  title text not null,
  author text,
  category text,
  total_copies integer not null default 1 check (total_copies >= 0),
  available_copies integer not null default 1 check (available_copies >= 0),
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.library_loans (
  id uuid primary key default gen_random_uuid(),
  book_id uuid not null references public.library_books(id) on delete cascade,
  student_id uuid not null references public.students(id) on delete cascade,
  issued_at timestamptz not null default now(),
  due_date date,
  returned_at timestamptz,
  fine numeric(12,2) not null default 0,
  issued_by uuid references auth.users(id) on delete set null
);

-- TRANSPORT
create table if not exists public.transport_routes (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  pickup_points text,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.transport_vehicles (
  id uuid primary key default gen_random_uuid(),
  registration_no text unique not null,
  vehicle_type text,
  driver_name text,
  driver_phone text,
  capacity integer,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.student_transport (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.students(id) on delete cascade,
  route_id uuid references public.transport_routes(id) on delete set null,
  vehicle_id uuid references public.transport_vehicles(id) on delete set null,
  pickup_point text,
  active boolean not null default true,
  unique(student_id)
);

-- DOCUMENTS
create table if not exists public.student_documents (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.students(id) on delete cascade,
  document_type text not null,
  title text not null,
  file_url text,
  issued_at date,
  created_at timestamptz not null default now()
);

-- PROMOTION / TRANSFER
create table if not exists public.student_promotions (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.students(id) on delete cascade,
  from_class_id uuid references public.classes(id) on delete set null,
  to_class_id uuid references public.classes(id) on delete set null,
  academic_year text,
  promoted_at timestamptz not null default now(),
  promoted_by uuid references auth.users(id) on delete set null,
  note text
);

create table if not exists public.transfer_certificates (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.students(id) on delete cascade,
  certificate_no text unique,
  reason text,
  issued_at date not null default current_date,
  issued_by uuid references auth.users(id) on delete set null,
  document_url text
);

-- NOTIFICATIONS
create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  body text,
  type text default 'info',
  read_at timestamptz,
  created_at timestamptz not null default now()
);

-- INDEXES
create index if not exists timetable_class_day_idx on public.timetable_entries(class_id, day_of_week, start_time);
create index if not exists homework_class_due_idx on public.homework(class_id, due_date desc);
create index if not exists materials_class_idx on public.study_materials(class_id);
create index if not exists fees_student_month_idx on public.student_fees(student_id, billing_month desc);
create index if not exists loans_student_idx on public.library_loans(student_id, returned_at);
create index if not exists documents_student_idx on public.student_documents(student_id);
create index if not exists promotions_student_idx on public.student_promotions(student_id, promoted_at desc);
create index if not exists notifications_user_idx on public.notifications(user_id, created_at desc);

-- BASIC RLS
alter table public.timetable_entries enable row level security;
alter table public.homework enable row level security;
alter table public.study_materials enable row level security;
alter table public.fee_structures enable row level security;
alter table public.student_fees enable row level security;
alter table public.fee_payments enable row level security;
alter table public.library_books enable row level security;
alter table public.library_loans enable row level security;
alter table public.transport_routes enable row level security;
alter table public.transport_vehicles enable row level security;
alter table public.student_transport enable row level security;
alter table public.student_documents enable row level security;
alter table public.student_promotions enable row level security;
alter table public.transfer_certificates enable row level security;
alter table public.notifications enable row level security;

-- Admin policies (drop/recreate makes this migration repeatable)
drop policy if exists admin_timetable_all on public.timetable_entries;
create policy admin_timetable_all on public.timetable_entries for all to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists admin_homework_all on public.homework;
create policy admin_homework_all on public.homework for all to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists admin_materials_all on public.study_materials;
create policy admin_materials_all on public.study_materials for all to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists admin_fees_all on public.fee_structures;
create policy admin_fees_all on public.fee_structures for all to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists admin_student_fees_all on public.student_fees;
create policy admin_student_fees_all on public.student_fees for all to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists admin_fee_payments_all on public.fee_payments;
create policy admin_fee_payments_all on public.fee_payments for all to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists admin_books_all on public.library_books;
create policy admin_books_all on public.library_books for all to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists admin_loans_all on public.library_loans;
create policy admin_loans_all on public.library_loans for all to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists admin_transport_all on public.transport_routes;
create policy admin_transport_all on public.transport_routes for all to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists admin_vehicles_all on public.transport_vehicles;
create policy admin_vehicles_all on public.transport_vehicles for all to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists admin_student_transport_all on public.student_transport;
create policy admin_student_transport_all on public.student_transport for all to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists admin_documents_all on public.student_documents;
create policy admin_documents_all on public.student_documents for all to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists admin_promotions_all on public.student_promotions;
create policy admin_promotions_all on public.student_promotions for all to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists admin_transfer_all on public.transfer_certificates;
create policy admin_transfer_all on public.transfer_certificates for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- Student read policies
drop policy if exists student_homework_read on public.homework;
create policy student_homework_read on public.homework for select to authenticated
using (exists (select 1 from public.students s where s.user_id=auth.uid() and s.class_id=homework.class_id));

drop policy if exists student_materials_read on public.study_materials;
create policy student_materials_read on public.study_materials for select to authenticated
using (exists (select 1 from public.students s where s.user_id=auth.uid() and s.class_id=study_materials.class_id));

drop policy if exists student_timetable_read on public.timetable_entries;
create policy student_timetable_read on public.timetable_entries for select to authenticated
using (exists (select 1 from public.students s where s.user_id=auth.uid() and s.class_id=timetable_entries.class_id));

drop policy if exists student_notifications_read on public.notifications;
create policy student_notifications_read on public.notifications for select to authenticated
using (user_id=auth.uid());

drop policy if exists student_documents_read on public.student_documents;
create policy student_documents_read on public.student_documents for select to authenticated
using (exists (select 1 from public.students s where s.id=student_documents.student_id and s.user_id=auth.uid()));

drop policy if exists student_transport_read on public.student_transport;
create policy student_transport_read on public.student_transport for select to authenticated
using (exists (select 1 from public.students s where s.id=student_transport.student_id and s.user_id=auth.uid()));

drop policy if exists student_library_loans_read on public.library_loans;
create policy student_library_loans_read on public.library_loans for select to authenticated
using (exists (select 1 from public.students s where s.id=library_loans.student_id and s.user_id=auth.uid()));

drop policy if exists student_fees_read on public.student_fees;
create policy student_fees_read on public.student_fees for select to authenticated
using (exists (select 1 from public.students s where s.id=student_fees.student_id and s.user_id=auth.uid()));

-- Teacher operational read policies
drop policy if exists teacher_homework_manage on public.homework;
create policy teacher_homework_manage on public.homework for all to authenticated
using (exists (select 1 from public.teachers t where t.id=homework.teacher_id and t.user_id=auth.uid() and t.active=true))
with check (exists (select 1 from public.teachers t where t.id=homework.teacher_id and t.user_id=auth.uid() and t.active=true));

drop policy if exists teacher_materials_manage on public.study_materials;
create policy teacher_materials_manage on public.study_materials for all to authenticated
using (exists (select 1 from public.teachers t where t.id=study_materials.teacher_id and t.user_id=auth.uid() and t.active=true))
with check (exists (select 1 from public.teachers t where t.id=study_materials.teacher_id and t.user_id=auth.uid() and t.active=true));

drop policy if exists teacher_timetable_read on public.timetable_entries;
create policy teacher_timetable_read on public.timetable_entries for select to authenticated
using (exists (select 1 from public.teachers t where t.id=timetable_entries.teacher_id and t.user_id=auth.uid() and t.active=true));

-- Notification insert for admin only
drop policy if exists admin_notifications_all on public.notifications;
create policy admin_notifications_all on public.notifications for all to authenticated using (public.is_admin()) with check (public.is_admin());

select 'NPSD production ERP foundation installed' as status;
