import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const ADMIN_EMAIL = 'suhailahmedaamro786@gmail.com';

export async function GET(request: NextRequest) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  const dbKey = serviceKey || publishableKey;

  if (!url || !dbKey) {
    return NextResponse.json({ error: 'Supabase server configuration is missing.' }, { status: 500 });
  }

  const token = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '');
  if (!token) return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });

  const admin = createClient(url, dbKey, { auth: { autoRefreshToken: false, persistSession: false } });
  const { data: userData, error: userError } = await admin.auth.getUser(token);
  const email = userData.user?.email?.toLowerCase();
  if (userError || !userData.user || email !== ADMIN_EMAIL) {
    return NextResponse.json({ error: 'Admin access required.' }, { status: 403 });
  }

  const [requests, students, classes, attendance, exams, results, announcements] = await Promise.all([
    admin.from('access_requests').select('id,student_id,full_name,father_name,guardian_name,student_cast,dob,gender,cnic,cnic_hash,phone,city,admission_session,class_id,status,created_at,admin_note,photo_url,classes(name,section)').order('created_at', { ascending: false }),
    admin.from('students').select('id,student_id,full_name,father_name,active,class_id,classes(name,section)').order('full_name'),
    admin.from('classes').select('id,name,section,academic_year').order('name').order('section'),
    admin.from('attendance').select('id,student_id,attendance_date,status').order('attendance_date', { ascending: false }).limit(100),
    admin.from('exams').select('id,name,exam_date,class_id,total_marks,published').order('exam_date', { ascending: false }).limit(100),
    admin.from('results').select('id,student_id,exam_id,subject,marks_obtained,total_marks,obtained,total,grade,position,pass,published').order('id', { ascending: false }).limit(200),
    admin.from('announcements').select('id,title,body,published,published_at,target_class_id,created_at').order('created_at', { ascending: false }).limit(100),
  ]);

  const errors = [requests, students, classes, attendance, exams, results, announcements]
    .filter((x) => x.error)
    .map((x) => x.error?.message);

  return NextResponse.json({
    requests: requests.data ?? [], students: students.data ?? [], classes: classes.data ?? [],
    attendance: attendance.data ?? [], exams: exams.data ?? [], results: results.data ?? [], announcements: announcements.data ?? [],
    errors,
  });
}
