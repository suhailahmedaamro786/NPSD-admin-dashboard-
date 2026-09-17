'use client';

import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabase';

const ADMIN_EMAIL = 'suhailahmedaamro786@gmail.com';
type TabName = 'requests' | 'students' | 'parents' | 'classes' | 'attendance' | 'exams' | 'results' | 'announcements' | 'cards';

type Student = { id: string; student_id: string; full_name: string; father_name?: string | null; active?: boolean; class_id?: string | null; classes?: { name: string; section: string }[] | null };
type ClassRow = { id: string; name: string; section: string; academic_year?: string | null };

export default function Home() {
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => { supabase().auth.getUser().then(({ data }) => { setUser(data.user); setLoading(false); }); }, []);
  if (loading) return <main className="wrap"><div className="card">Loading admin dashboard…</div></main>;
  if (!user) return <Login />;
  if ((user.email || '').toLowerCase() !== ADMIN_EMAIL) return <AccessDenied />;
  return <Admin user={user} />;
}

function Admin({ user }: { user: any }) {
  const [tab, setTab] = useState<TabName>('requests');
  const [requests, setRequests] = useState<any[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [parents, setParents] = useState<any[]>([]);
  const [classes, setClasses] = useState<ClassRow[]>([]);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [filter, setFilter] = useState('pending');
  const [query, setQuery] = useState('');
  const [attendance, setAttendance] = useState<any[]>([]);
  const [exams, setExams] = useState<any[]>([]);
  const [results, setResults] = useState<any[]>([]);
  const [announcements, setAnnouncements] = useState<any[]>([]);
  const [cardStudent, setCardStudent] = useState('');
  const [cardToken, setCardToken] = useState('');

  async function loadCore() {
    setBusy(true); setError('');
    const s = supabase();
    const [r, st, pa, cl] = await Promise.all([
      s.from('access_requests').select('id,student_id,full_name,father_name,guardian_name,dob,gender,phone,city,admission_session,class_id,status,created_at,admin_note,classes(name,section)').order('created_at', { ascending: false }),
      s.from('students').select('id,student_id,full_name,father_name,active,class_id,classes(name,section)').order('full_name'),
      s.from('parents').select('id,full_name,phone,approved').order('full_name'),
      s.from('classes').select('id,name,section,academic_year').order('name').order('section'),
    ]);
    const firstError = r.error || st.error || pa.error || cl.error;
    if (firstError) setError(firstError.message);
    setRequests(r.data || []); setStudents(st.data || []); setParents(pa.data || []); setClasses(cl.data || []);
    setBusy(false);
  }

  async function loadOperations() {
    const s = supabase();
    const [a, e, r, n] = await Promise.all([
      s.from('attendance').select('id,student_id,attendance_date,status,note').order('attendance_date', { ascending: false }).limit(100),
      s.from('exams').select('id,name,exam_date,class_id,total_marks,published').order('exam_date', { ascending: false }).limit(100),
      s.from('results').select('id,student_id,exam_id,subject,marks_obtained,total_marks,obtained,total,grade,position,pass,published').order('id', { ascending: false }).limit(200),
      s.from('announcements').select('id,title,body,published,published_at,target_class_id,created_at').order('created_at', { ascending: false }).limit(100),
    ]);
    setAttendance(a.data || []); setExams(e.data || []); setResults(r.data || []); setAnnouncements(n.data || []);
    const err = a.error || e.error || r.error || n.error;
    if (err) setError(err.message);
  }

  useEffect(() => { void Promise.all([loadCore(), loadOperations()]); }, []);

  async function reviewRequest(id: string, action: 'approve' | 'reject') {
    setNotice(''); setError('');
    const { data, error } = await supabase().rpc('approve_access_request', { p_request_id: id, p_action: action });
    if (error) { setError(error.message); return; }
    setNotice(data?.message || `Request ${action}d.`);
    await Promise.all([loadCore(), loadOperations()]);
  }

  async function issueCard(studentId: string) {
    setNotice(''); setError(''); setCardToken('');
    const { data, error } = await supabase().rpc('issue_student_card', { p_student_id: studentId });
    if (error) { setError(error.message); return; }
    setCardToken(data?.token || '');
    setNotice('Student card issued successfully.');
  }

  async function togglePublished(table: 'exams' | 'results' | 'announcements', id: string, published: boolean) {
    const { error } = await supabase().from(table).update({ published: !published }).eq('id', id);
    if (error) { setError(error.message); return; }
    await loadOperations();
  }

  const filteredRequests = useMemo(() => {
    const q = query.trim().toLowerCase();
    return requests.filter((x) => (!filter || x.status === filter) && (!q || [x.full_name, x.student_id, x.phone, x.city].some((v) => String(v || '').toLowerCase().includes(q))));
  }, [requests, filter, query]);

  return (
    <main className="wrap">
      <header className="topbar"><div><h1>NPSD Admin Dashboard</h1><p>Manage students, approvals, academics and communication.</p></div><button onClick={() => void supabase().auth.signOut()}>Sign out</button></header>
      {error && <div className="alert error">{error}</div>}
      {notice && <div className="alert success">{notice}</div>}
      <nav className="tabs">
        {(['requests','students','parents','classes','attendance','exams','results','announcements','cards'] as TabName[]).map((name) => <button key={name} className={tab === name ? 'active' : ''} onClick={() => setTab(name)}>{name}</button>)}
      </nav>
      <section className="card">
        {busy ? <p>Loading dashboard…</p> : <>
          {tab === 'requests' && <><div className="toolbar"><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search name, student ID, phone…" /><select value={filter} onChange={(e) => setFilter(e.target.value)}><option value="pending">Pending</option><option value="approved">Approved</option><option value="rejected">Rejected</option><option value="">All</option></select></div><div className="tableWrap"><table><thead><tr><th>Name</th><th>Student ID</th><th>Class</th><th>Phone</th><th>Status</th><th>Action</th></tr></thead><tbody>{filteredRequests.map((x) => <tr key={x.id}><td>{x.full_name}</td><td>{x.student_id || '—'}</td><td>{x.classes?.name || '—'} {x.classes?.section || ''}</td><td>{x.phone}</td><td>{x.status}</td><td>{x.status === 'pending' && <><button onClick={() => void reviewRequest(x.id,'approve')}>Approve</button> <button onClick={() => void reviewRequest(x.id,'reject')}>Reject</button></>}</td></tr>)}</tbody></table></div></>}
          {tab === 'students' && <List title="Students" rows={students.map((x) => ({...x, class_name: x.classes?.[0] ? `${x.classes[0].name} ${x.classes[0].section}` : '—'}))} />}
          {tab === 'parents' && <List title="Parents" rows={parents} />}
          {tab === 'classes' && <List title="Classes" rows={classes} />}
          {tab === 'attendance' && <List title="Attendance" rows={attendance} />}
          {tab === 'exams' && <List title="Exams" rows={exams} actions={(x) => <button onClick={() => void togglePublished('exams', x.id, x.published)}>{x.published ? 'Unpublish' : 'Publish'}</button>} />}
          {tab === 'results' && <List title="Results" rows={results} actions={(x) => <button onClick={() => void togglePublished('results', x.id, x.published)}>{x.published ? 'Unpublish' : 'Publish'}</button>} />}
          {tab === 'announcements' && <List title="Announcements" rows={announcements} actions={(x) => <button onClick={() => void togglePublished('announcements', x.id, x.published)}>{x.published ? 'Unpublish' : 'Publish'}</button>} />}
          {tab === 'cards' && <div className="stack"><select value={cardStudent} onChange={(e) => setCardStudent(e.target.value)}><option value="">Select student</option>{students.map((x) => <option key={x.id} value={x.id}>{x.full_name} — {x.student_id}</option>)}</select><button disabled={!cardStudent} onClick={() => void issueCard(cardStudent)}>Issue / Generate Card</button>{cardToken && <div className="card"><strong>Card token:</strong> {cardToken}</div>}</div>}
        </>}
      </section>
    </main>
  );
}

function List({ title, rows, actions }: { title: string; rows: any[]; actions?: (row: any) => React.ReactNode }) {
  return <div><h2>{title}</h2><div className="tableWrap"><table><thead><tr>{Object.keys(rows[0] || {id:'',name:''}).slice(0,8).map((k) => <th key={k}>{k}</th>)}{actions && <th>Action</th>}</tr></thead><tbody>{rows.map((row, i) => <tr key={row.id || i}>{Object.entries(row).slice(0,8).map(([k,v]) => <td key={k}>{typeof v === 'object' ? JSON.stringify(v) : String(v ?? '—')}</td>)}{actions && <td>{actions(row)}</td>}</tr>)}</tbody></table></div></div>;
}

function Login() {
  const [email, setEmail] = useState(''); const [password, setPassword] = useState(''); const [error, setError] = useState('');
  async function submit(e: React.FormEvent) { e.preventDefault(); setError(''); const { error } = await supabase().auth.signInWithPassword({ email, password }); if (error) setError(error.message); else window.location.reload(); }
  return <main className="wrap"><div className="card narrow"><h1>Admin Login</h1><form onSubmit={submit}><input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Admin email" required /><input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Password" required /><button type="submit">Sign in</button>{error && <p className="errorText">{error}</p>}</form></div></main>;
}

function AccessDenied() { return <main className="wrap"><div className="card"><h1>Access denied</h1><p>This account is not authorized for the NPSD admin dashboard.</p></div></main>; }
