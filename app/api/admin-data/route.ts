import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const ADMIN_EMAIL = 'suhailahmedaamro786@gmail.com';

function getServerClient(url: string, key: string) {
  return createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

async function requireAdmin(request: NextRequest, admin: ReturnType<typeof getServerClient>) {
  const token = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '');
  if (!token) throw new Error('Authentication required.');

  const { data: userData, error: userError } = await admin.auth.getUser(token);
  const email = userData.user?.email?.toLowerCase();

  if (userError || !userData.user || email !== ADMIN_EMAIL) {
    throw new Error('Admin access required.');
  }

  return userData.user;
}

export async function GET(request: NextRequest) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  const dbKey = serviceKey || publishableKey;

  if (!url || !dbKey) {
    return NextResponse.json({ error: 'Supabase server configuration is missing.' }, { status: 500 });
  }

  const admin = getServerClient(url, dbKey);

  try {
    await requireAdmin(request, admin);
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Admin access required.' }, { status: 401 });
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
    requests: requests.data ?? [],
    students: students.data ?? [],
    classes: classes.data ?? [],
    attendance: attendance.data ?? [],
    exams: exams.data ?? [],
    results: results.data ?? [],
    announcements: announcements.data ?? [],
    errors,
  });
}

export async function POST(request: NextRequest) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceKey) {
    return NextResponse.json(
      { error: 'SUPABASE_SERVICE_ROLE_KEY is required for admission approval.' },
      { status: 500 }
    );
  }

  const admin = getServerClient(url, serviceKey);

  try {
    const adminUser = await requireAdmin(request, admin);
    const body = await request.json();
    const requestId = String(body?.requestId || '').trim();
    const action = String(body?.action || '').trim().toLowerCase();

    if (!requestId || !['approve', 'reject'].includes(action)) {
      return NextResponse.json({ error: 'Invalid admission review request.' }, { status: 400 });
    }

    const { data: admission, error: requestError } = await admin
      .from('access_requests')
      .select('*')
      .eq('id', requestId)
      .single();

    if (requestError || !admission) {
      return NextResponse.json({ error: requestError?.message || 'Admission request not found.' }, { status: 404 });
    }

    if (admission.status !== 'pending') {
      return NextResponse.json({ error: `Request is already ${admission.status}.` }, { status: 409 });
    }

    if (action === 'reject') {
      const { data: updated, error: updateError } = await admin
        .from('access_requests')
        .update({
          status: 'rejected',
          admin_note: body?.note || null,
          reviewed_by: adminUser.id,
          reviewed_at: new Date().toISOString(),
        })
        .eq('id', requestId)
        .select()
        .single();

      if (updateError) throw updateError;
      return NextResponse.json({ request: updated });
    }

    // Admission approval must not depend on the optional students.user_id FK.
    // Student login is verified from access_requests.auth_user_id by the
    // Student Portal, so the student record can safely keep user_id NULL.
    const studentPayload = {
      user_id: null,
      student_id: admission.student_id,
      full_name: admission.full_name,
      father_name: admission.father_name,
      class_id: admission.class_id,
      photo_url: admission.photo_url,
      dob: admission.dob,
      phone: admission.phone,
      address: admission.address || 'Not provided',
      active: true,
      student_cast: admission.student_cast,
      cnic: admission.cnic,
      cnic_hash: admission.cnic_hash,
      guardian_cnic_hash: admission.guardian_cnic_hash,
      gender: admission.gender,
      guardian_name: admission.guardian_name,
      whatsapp: admission.whatsapp,
      email: admission.email,
    };

    // Remove any legacy link first, then upsert without a user_id.
    const { error: clearUserError } = await admin
      .from('students')
      .update({ user_id: null })
      .eq('student_id', admission.student_id);

    if (clearUserError) throw clearUserError;

    const { error: studentError } = await admin
      .from('students')
      .upsert(studentPayload, { onConflict: 'student_id' });

    if (studentError) throw studentError;

    const { data: updated, error: updateError } = await admin
      .from('access_requests')
      .update({
        status: 'approved',
        admin_note: body?.note || null,
        reviewed_by: adminUser.id,
        reviewed_at: new Date().toISOString(),
      })
      .eq('id', requestId)
      .select()
      .single();

    if (updateError) throw updateError;

    return NextResponse.json({ request: updated, student_id: admission.student_id });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message || 'Unable to review admission request.' },
      { status: 500 }
    );
  }
}
