-- NPSD ADVANCED FEATURES MIGRATION
-- Run after complete_flow.sql in Supabase SQL Editor.
-- Idempotent: safe to run again.

create extension if not exists pgcrypto;

-- ------------------------------------------------------------
-- 1. Normalize class labels: 1-A ... 12-A
-- ------------------------------------------------------------
update public.classes
set name = regexp_replace(name, '^Class ', '')
where name ~ '^Class [0-9]+';

update public.classes
set section = coalesce(nullif(trim(section), ''), 'A')
where academic_year = '2026-27';

-- ------------------------------------------------------------
-- 2. Attendance enhancements
-- ------------------------------------------------------------
alter table public.attendance add column if not exists note text;
alter table public.attendance add column if not exists marked_by uuid references auth.users(id) on delete set null;
alter table public.attendance add column if not exists created_at timestamptz not null default now();
create index if not exists attendance_student_date_idx
  on public.attendance(student_id, attendance_date desc);

-- ------------------------------------------------------------
-- 3. Exam / result enhancements
-- ------------------------------------------------------------
alter table public.exams add column if not exists class_id uuid references public.classes(id) on delete set null;
alter table public.exams add column if not exists total_marks numeric;
alter table public.exams add column if not exists published boolean not null default false;
alter table public.exams add column if not exists created_by uuid references auth.users(id) on delete set null;

alter table public.results add column if not exists subject text;
alter table public.results add column if not exists marks_obtained numeric;
alter table public.results add column if not exists total_marks numeric;
alter table public.results add column if not exists pass boolean;
alter table public.results add column if not exists created_at timestamptz not null default now();
alter table public.results add column if not exists updated_at timestamptz not null default now();
alter table public.results add column if not exists published boolean not null default false;

-- Backfill modern result column names when legacy columns exist.
do $$
begin
  if exists (select 1 from information_schema.columns where table_schema='public' and table_name='results' and column_name='obtained') then
    update public.results set marks_obtained = coalesce(marks_obtained, obtained);
  end if;
  if exists (select 1 from information_schema.columns where table_schema='public' and table_name='results' and column_name='total') then
    update public.results set total_marks = coalesce(total_marks, total);
  end if;
end $$;

update public.results
set pass = case
  when marks_obtained is null or total_marks is null or total_marks = 0 then null
  else marks_obtained >= total_marks * 0.40
end
where pass is null;

create index if not exists results_student_published_idx
  on public.results(student_id, published);

-- ------------------------------------------------------------
-- 4. Subjects: keep the subject catalog ready for result entry
-- ------------------------------------------------------------
alter table public.subjects add column if not exists code text;
alter table public.subjects add column if not exists active boolean not null default true;
alter table public.subjects add column if not exists created_at timestamptz not null default now();

-- ------------------------------------------------------------
-- 5. Announcements enhancements
-- ------------------------------------------------------------
alter table public.announcements add column if not exists body text;
alter table public.announcements add column if not exists published_at timestamptz;
alter table public.announcements add column if not exists target_class_id uuid references public.classes(id) on delete set null;
alter table public.announcements add column if not exists created_by uuid references auth.users(id) on delete set null;

update public.announcements
set published_at = coalesce(published_at, created_at, now())
where published = true and published_at is null;

create index if not exists announcements_published_idx
  on public.announcements(published, published_at desc);

-- ------------------------------------------------------------
-- 6. Digital student cards + QR verification
-- ------------------------------------------------------------
alter table public.student_cards add column if not exists qr_token_hash text;
alter table public.student_cards add column if not exists active boolean not null default true;
alter table public.student_cards add column if not exists issued_at timestamptz not null default now();
alter table public.student_cards add column if not exists expires_at timestamptz;
create unique index if not exists student_cards_qr_hash_uidx
  on public.student_cards(qr_token_hash)
  where qr_token_hash is not null;

create or replace function public.issue_student_card(p_student_id uuid)
returns text
language plpgsql
security definer
set search_path=public
as $$
declare
  v_token text := encode(gen_random_bytes(24), 'hex');
begin
  if not public.is_admin() then
    raise exception 'Not authorized';
  end if;

  update public.student_cards
  set active=false
  where student_id=p_student_id;

  insert into public.student_cards(student_id, qr_token_hash, active, issued_at)
  values(p_student_id, encode(digest(v_token, 'sha256'), 'hex'), true, now())
  on conflict do nothing;

  return v_token;
end;
$$;

grant execute on function public.issue_student_card(uuid) to authenticated;

create or replace function public.verify_student_card(p_token text)
returns table(
  student_id uuid,
  roll_no text,
  full_name text,
  class_name text,
  section text,
  active boolean
)
language sql
security definer
set search_path=public
as $$
  select s.id, s.student_id, s.full_name, c.name, c.section, sc.active
  from public.student_cards sc
  join public.students s on s.id=sc.student_id
  left join public.classes c on c.id=s.class_id
  where sc.qr_token_hash=encode(digest(p_token, 'sha256'), 'hex')
    and sc.active=true
    and (sc.expires_at is null or sc.expires_at > now())
    and s.active=true
  limit 1;
$$;

grant execute on function public.verify_student_card(text) to anon, authenticated;

-- ------------------------------------------------------------
-- 7. Attendance analytics helper
-- ------------------------------------------------------------
create or replace function public.student_attendance_summary(p_student_id uuid)
returns table(total_days bigint, present_days bigint, absent_days bigint, late_days bigint, percentage numeric)
language sql
security definer
set search_path=public
as $$
  select
    count(*)::bigint,
    count(*) filter (where status='present')::bigint,
    count(*) filter (where status='absent')::bigint,
    count(*) filter (where status='late')::bigint,
    case when count(*)=0 then 0
         else round((count(*) filter (where status='present'))::numeric * 100 / count(*), 2)
    end
  from public.attendance
  where student_id=p_student_id;
$$;

grant execute on function public.student_attendance_summary(uuid) to authenticated;

-- ------------------------------------------------------------
-- 8. Result analytics helper
-- ------------------------------------------------------------
create or replace function public.student_result_summary(p_student_id uuid)
returns table(subject text, obtained numeric, total numeric, percentage numeric, grade text, pass boolean)
language sql
security definer
set search_path=public
as $$
  select
    r.subject,
    coalesce(r.marks_obtained, 0),
    coalesce(r.total_marks, 0),
    case when coalesce(r.total_marks,0)=0 then 0
         else round(coalesce(r.marks_obtained,0) * 100 / r.total_marks, 2)
    end,
    r.grade,
    r.pass
  from public.results r
  where r.student_id=p_student_id and r.published=true
  order by r.id desc;
$$;

grant execute on function public.student_result_summary(uuid) to authenticated;

-- ------------------------------------------------------------
-- 9. Admin analytics view
-- ------------------------------------------------------------
create or replace view public.npsd_admin_stats as
select
  (select count(*) from public.access_requests where status='pending') as pending_requests,
  (select count(*) from public.students where active=true) as active_students,
  (select count(*) from public.parents where approved=true) as approved_parents,
  (select count(*) from public.classes where academic_year='2026-27') as classes,
  (select count(*) from public.attendance where attendance_date=current_date) as attendance_today,
  (select count(*) from public.exams where published=true) as published_exams,
  (select count(*) from public.announcements where published=true) as published_announcements;

-- ------------------------------------------------------------
-- 10. RLS: students/parents can read only their own related records;
-- admins can manage operational data.
-- ------------------------------------------------------------
alter table public.student_cards enable row level security;

drop policy if exists student_cards_self on public.student_cards;
create policy student_cards_self on public.student_cards
for select to authenticated
using (
  exists (
    select 1 from public.students s
    where s.id=student_cards.student_id and s.user_id=auth.uid()
  )
  or exists (
    select 1
    from public.parent_student_links pcl
    join public.parents p on p.id=pcl.parent_id
    where pcl.student_id=student_cards.student_id
      and p.user_id=auth.uid()
      and pcl.approved=true
  )
  or public.is_admin()
);

drop policy if exists admin_attendance_all on public.attendance;
create policy admin_attendance_all on public.attendance
for all to authenticated using(public.is_admin()) with check(public.is_admin());

drop policy if exists admin_exams_all on public.exams;
create policy admin_exams_all on public.exams
for all to authenticated using(public.is_admin()) with check(public.is_admin());

drop policy if exists admin_results_all on public.results;
create policy admin_results_all on public.results
for all to authenticated using(public.is_admin()) with check(public.is_admin());

drop policy if exists admin_announcements_all on public.announcements;
create policy admin_announcements_all on public.announcements
for all to authenticated using(public.is_admin()) with check(public.is_admin());

create index if not exists students_class_active_idx on public.students(class_id, active);
create index if not exists parent_links_parent_approved_idx on public.parent_student_links(parent_id, approved);

select name, section, academic_year, name || '-' || section as class_label
from public.classes
where academic_year='2026-27'
order by nullif(regexp_replace(name, '[^0-9]', '', 'g'),'')::int nulls last, section;
