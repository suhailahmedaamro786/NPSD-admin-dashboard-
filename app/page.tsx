'use client';

import { useEffect, useMemo, useState } from 'react';
import type React from 'react';
import { Bell, BookOpen, CalendarCheck, CheckCircle2, ChevronRight, GraduationCap, LayoutDashboard, LogOut, Megaphone, RefreshCw, Search, ShieldCheck, UserCheck, Users, XCircle } from 'lucide-react';
import { supabase } from '../lib/supabase';

const ADMIN_EMAIL = 'suhailahmedaamro786@gmail.com';
type TabName = 'overview' | 'requests' | 'students' | 'parents' | 'classes' | 'teachers' | 'attendance' | 'exams' | 'results' | 'announcements' | 'cards';
type Student = { id: string; student_id: string; full_name: string; father_name?: string | null; active?: boolean; class_id?: string | null; classes?: { name: string; section: string }[] | { name: string; section: string } | null };
type ClassRow = { id: string; name: string; section: string; academic_year?: string | null };

function classLabel(value: any) {
  const item = Array.isArray(value) ? value[0] : value;
  return item?.name ? `${item.name}${item.section ? ` — ${item.section}` : ''}` : '—';
}

export default function Home() {
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => { supabase().auth.getUser().then(({ data }) => { setUser(data.user); setLoading(false); }); }, []);
  if (loading) return <main className="shell"><div className="loadingCard">Loading NPSD Admin…</div></main>;
  if (!user) return <Login />;
  if ((user.email || '').toLowerCase() !== ADMIN_EMAIL) return <AccessDenied />;
  return <Admin user={user} />;
}

function Admin({ user }: { user: any }) {
  const [tab, setTab] = useState<TabName>('overview');
  const [requests, setRequests] = useState<any[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [parents, setParents] = useState<any[]>([]);
  const [classes, setClasses] = useState<ClassRow[]>([]);
  const [attendance, setAttendance] = useState<any[]>([]);
  const [exams, setExams] = useState<any[]>([]);
  const [results, setResults] = useState<any[]>([]);
  const [announcements, setAnnouncements] = useState<any[]>([]);
  const [busy, setBusy] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [filter, setFilter] = useState('pending');
  const [query, setQuery] = useState('');
  const [cardStudent, setCardStudent] = useState('');
  const [cardToken, setCardToken] = useState('');
  const [dark, setDark] = useState(false);

  async function loadData(silent = false) {
    if (silent) setRefreshing(true); else setBusy(true);
    setError('');
    try {
      const { data: sessionData } = await supabase().auth.getSession();
      const token = sessionData.session?.access_token;
      if (!token) throw new Error('Admin session expired. Please sign in again.');
      const response = await fetch('/api/admin-data', { headers: { Authorization: `Bearer ${token}` }, cache: 'no-store' });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || 'Unable to load admin data.');
      setRequests(payload.requests || []); setStudents(payload.students || []); setParents(payload.parents || []); setClasses((payload.classes || []).slice().sort((a: ClassRow, b: ClassRow) => { const n = (v: string) => { const m = String(v || '').match(/(\\d+)/); return m ? Number(m[1]) : Number.MAX_SAFE_INTEGER; }; return n(a.name) - n(b.name) || String(a.section || '').localeCompare(String(b.section || '')); }));
      setAttendance(payload.attendance || []); setExams(payload.exams || []); setResults(payload.results || []); setAnnouncements(payload.announcements || []);
      if (payload.errors?.length) setError(payload.errors.join(' • '));
    } catch (e: any) { setError(e?.message || 'Unable to load dashboard.'); }
    finally { setBusy(false); setRefreshing(false); }
  }

  useEffect(() => { void loadData(); }, []);

  async function reviewRequest(id: string, action: 'approve' | 'reject') {
    setNotice(''); setError('');
    const { data, error } = await supabase().rpc('approve_access_request', { p_request_id: id, p_action: action });
    if (error) { setError(error.message); return; }
    setNotice(data?.message || `Request ${action}d.`);
    await loadData(true);
  }

  async function issueCard(studentId: string) {
    setNotice(''); setError(''); setCardToken('');
    const { data, error } = await supabase().rpc('issue_student_card', { p_student_id: studentId });
    if (error) { setError(error.message); return; }
    setCardToken(data?.token || ''); setNotice('Student card issued successfully.');
  }

  async function togglePublished(table: 'exams' | 'results' | 'announcements', id: string, published: boolean) {
    setError('');
    const { error } = await supabase().from(table).update({ published: !published }).eq('id', id);
    if (error) { setError(error.message); return; }
    await loadData(true);
  }

  const pending = requests.filter((x) => x.status === 'pending').length;
  const approved = requests.filter((x) => x.status === 'approved').length;
  const rejected = requests.filter((x) => x.status === 'rejected').length;
  const filteredRequests = useMemo(() => {
    const q = query.trim().toLowerCase();
    return requests.filter((x) => (!filter || x.status === filter) && (!q || [x.full_name, x.student_id, x.phone, x.city].some((v) => String(v || '').toLowerCase().includes(q))));
  }, [requests, filter, query]);

  const nav: { id: TabName; label: string; icon: React.ReactNode; count?: number }[] = [
    { id: 'overview', label: 'Overview', icon: <LayoutDashboard size={17} /> },
    { id: 'requests', label: 'Requests', icon: <UserCheck size={17} />, count: pending },
    { id: 'students', label: 'Students', icon: <GraduationCap size={17} />, count: students.length },
    { id: 'classes', label: 'Classes', icon: <BookOpen size={17} />, count: classes.length },
    { id: 'teachers', label: 'Teachers', icon: <Users size={17} /> },
    { id: 'attendance', label: 'Attendance', icon: <CalendarCheck size={17} /> },
    { id: 'exams', label: 'Exams', icon: <BookOpen size={17} /> },
    { id: 'results', label: 'Results', icon: <CheckCircle2 size={17} /> },
    { id: 'announcements', label: 'Announcements', icon: <Megaphone size={17} /> },
    { id: 'cards', label: 'Student Cards', icon: <ShieldCheck size={17} /> },
  ];

  return <main className={`appShell ${dark ? 'themeDark' : ''}`}>
    <aside className="sidebar">
      <div className="brand"><div className="brandMark">N</div><div><strong>NPSD</strong><span>Admin Portal</span></div></div>
      <div className="sideLabel">WORKSPACE</div>
      <nav>{nav.map((item) => <button key={item.id} className={tab === item.id ? 'sideItem active' : 'sideItem'} onClick={() => setTab(item.id)}>{item.icon}<span>{item.label}</span>{item.count !== undefined && <b>{item.count}</b>}</button>)}</nav>
      <div className="sideBottom"><div className="secure"><ShieldCheck size={16}/><span>Secure admin session</span></div><button className="signOut" onClick={() => void supabase().auth.signOut()}><LogOut size={16}/> Sign out</button></div>
    </aside>

    <section className="mainArea">
      <header className="header"><div><p className="eyebrow">NOBLE PUBLIC SCHOOL DADU</p><h1>{nav.find((x) => x.id === tab)?.label || 'Dashboard'}</h1><p className="sub">Manage students, approvals, academics and communication.</p></div><div className="headerActions"><button className="iconButton" title={dark ? 'Light theme' : 'Dark theme'} onClick={() => setDark(v => !v)}>{dark ? '☀️' : '🌙'}</button><button className="iconButton" title="Refresh" onClick={() => void loadData(true)} disabled={refreshing}><RefreshCw size={17} className={refreshing ? 'spin' : ''}/></button><div className="adminAvatar">A</div><div className="adminInfo"><strong>Administrator</strong><span>{user.email}</span></div></div></header>
      {error && <div className="alert error"><XCircle size={18}/><span>{error}</span><button onClick={() => setError('')}>×</button></div>}
      {notice && <div className="alert success"><CheckCircle2 size={18}/><span>{notice}</span><button onClick={() => setNotice('')}>×</button></div>}

      {busy ? <div className="loadingCard"><RefreshCw className="spin" size={22}/> Loading dashboard data…</div> : <>
        {tab === 'overview' && <Overview pending={pending} approved={approved} rejected={rejected} students={students.length} requests={requests} setTab={setTab} attendance={attendance} results={results} classes={classes} />}
        {tab === 'requests' && <RequestView rows={filteredRequests} filter={filter} setFilter={setFilter} query={query} setQuery={setQuery} reviewRequest={reviewRequest} />}
        {tab === 'students' && <DataTable title="Students" subtitle="Registered and approved students" rows={students.map((x) => ({ Student: x.full_name, 'Student ID': x.student_id, Father: x.father_name || '—', Class: classLabel(x.classes), Status: x.active === false ? 'Inactive' : 'Active' }))} />}
        {tab === 'classes' && <DataTable title="Classes" subtitle="Academic classes and sections" rows={classes.map((x) => ({ Class: x.name, Section: x.section, 'Academic Year': x.academic_year || '—' }))} />}
        {tab === 'teachers' && <TeacherView classes={classes} setError={setError} setNotice={setNotice} />}
        {tab === 'attendance' && <DataTable title="Attendance" subtitle="Latest 100 attendance records" rows={attendance.map((x) => ({ Student: x.student_id, Date: x.attendance_date, Status: x.status }))} />}
        {tab === 'exams' && <DataTable title="Exams" subtitle="Exam schedule and publishing" rows={exams.map((x) => ({ Name: x.name, Date: x.exam_date, 'Total Marks': x.total_marks, Published: x.published ? 'Yes' : 'No' }))} actions={(x) => <button className="smallBtn" onClick={() => { const row = exams.find((e) => e.name === x.Name && e.exam_date === x.Date); if (row) void togglePublished('exams', row.id, row.published); }}>{x.Published === 'Yes' ? 'Unpublish' : 'Publish'}</button>} />}
        {tab === 'results' && <DataTable title="Results" subtitle="Student results and publishing" rows={results.map((x) => ({ Student: x.student_id, Subject: x.subject, Marks: `${x.marks_obtained ?? x.obtained ?? '—'} / ${x.total_marks ?? x.total ?? '—'}`, Grade: x.grade || '—', Published: x.published ? 'Yes' : 'No' }))} />}
        {tab === 'announcements' && <DataTable title="Announcements" subtitle="School communication" rows={announcements.map((x) => ({ Title: x.title, Published: x.published ? 'Yes' : 'No', Date: x.created_at ? new Date(x.created_at).toLocaleDateString() : '—' }))} />}
        {tab === 'cards' && <CardView students={students} cardStudent={cardStudent} setCardStudent={setCardStudent} issueCard={issueCard} cardToken={cardToken} />}
      </>}
    </section>
  </main>;
}

function Overview({ pending, approved, rejected, students, requests, setTab, attendance, results, classes }: any) {
  const present = attendance.filter((a:any)=>a.status==='present').length;
  const attendanceRate = attendance.length ? Math.round((present / attendance.length) * 100) : 0;
  const publishedResults = results.filter((r:any)=>r.published).length;
  return <div className="content"><div className="statsGrid"><Stat icon={<UserCheck/>} label="Pending Requests" value={pending} tone="amber" /><Stat icon={<GraduationCap/>} label="Students" value={students} tone="blue" /><Stat icon={<CheckCircle2/>} label="Approved" value={approved} tone="green" /><Stat icon={<CalendarCheck/>} label="Attendance Rate" value={`${attendanceRate}%`} tone="green" /></div><div className="statsGrid analyticsGrid"><Stat icon={<BookOpen/>} label="Classes" value={classes.length} tone="blue" /><Stat icon={<CheckCircle2/>} label="Published Results" value={publishedResults} tone="green" /><Stat icon={<XCircle/>} label="Rejected Requests" value={rejected} tone="red" /><Stat icon={<Megaphone/>} label="Attendance Records" value={attendance.length} tone="amber" /></div>
    <div className="sectionGrid"><section className="panel"><div className="panelHead"><div><h2>Recent applications</h2><p>Latest student registration requests</p></div><button className="textBtn" onClick={() => setTab('requests')}>View all <ChevronRight size={15}/></button></div><div className="recentList">{requests.slice(0, 6).map((x: any) => <div className="recentRow" key={x.id}><div className="personAvatar">{String(x.full_name || '?').charAt(0).toUpperCase()}</div><div className="person"><strong>{x.full_name}</strong><span>{x.student_id || 'ID pending'} · {classLabel(x.classes)}</span></div><Status value={x.status}/></div>)}{!requests.length && <Empty text="No registration requests yet."/>}</div></section>
      <section className="panel quick"><div className="panelHead"><div><h2>Quick actions</h2><p>Common admin tasks</p></div></div><button onClick={() => setTab('requests')}><UserCheck/><span><strong>Review applications</strong><small>Approve or reject new requests</small></span><ChevronRight/></button><button onClick={() => setTab('cards')}><ShieldCheck/><span><strong>Issue student card</strong><small>Generate a digital card token</small></span><ChevronRight/></button><button onClick={() => setTab('announcements')}><Bell/><span><strong>Announcements</strong><small>Manage school communication</small></span><ChevronRight/></button></section></div></div>;
}

function RequestView({ rows, filter, setFilter, query, setQuery, reviewRequest }: any) {
  return <div className="content"><div className="pageIntro"><div><h2>Registration requests</h2><p>Review applications submitted from the student portal.</p></div><div className="filterPills">{[['pending','Pending'],['approved','Approved'],['rejected','Rejected'],['','All']].map(([v,l]) => <button key={v} className={filter === v ? 'selected' : ''} onClick={() => setFilter(v)}>{l}</button>)}</div></div><div className="tableToolbar"><div className="searchBox"><Search size={17}/><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search name, student ID, phone or city…" /></div><span className="resultCount">{rows.length} request{rows.length === 1 ? '' : 's'}</span></div><div className="dataPanel"><div className="tableWrap"><table><thead><tr><th>Applicant</th><th>Student ID</th><th>Class</th><th>Contact</th><th>Status</th><th>Action</th></tr></thead><tbody>{rows.map((x: any) => <tr key={x.id}><td><div className="tablePerson"><div className="personAvatar small">{String(x.full_name || '?').charAt(0).toUpperCase()}</div><div><strong>{x.full_name}</strong><small>{x.father_name || x.guardian_name || 'Guardian not provided'}</small></div></div></td><td><strong className="mono">{x.student_id || '—'}</strong></td><td>{classLabel(x.classes)}</td><td><strong>{x.phone || '—'}</strong><small>{x.city || ''}</small></td><td><Status value={x.status}/></td><td>{x.status === 'pending' ? <div className="rowActions"><button className="approveBtn" onClick={() => void reviewRequest(x.id, 'approve')}><CheckCircle2 size={14}/> Approve</button><button className="rejectBtn" onClick={() => void reviewRequest(x.id, 'reject')}><XCircle size={14}/> Reject</button></div> : <button className="smallBtn" onClick={() => window.print()}>View / Print Details</button>}</td></tr>)}</tbody></table>{!rows.length && <Empty text="No requests match this filter."/>}</div></div></div>;
}

function DataTable({ title, subtitle, rows, actions }: { title: string; subtitle: string; rows: any[]; actions?: (row: any) => React.ReactNode }) {
  const columns = Object.keys(rows[0] || { Name: '' });
  return <div className="content"><div className="pageIntro"><div><h2>{title}</h2><p>{subtitle}</p></div></div><div className="dataPanel"><div className="tableWrap"><table><thead><tr>{columns.map((c) => <th key={c}>{c}</th>)}{actions && <th>Action</th>}</tr></thead><tbody>{rows.map((row, i) => <tr key={row.id || i}>{columns.map((c) => <td key={c}>{c === 'Status' || c === 'Published' ? <Status value={String(row[c])} /> : String(row[c] ?? '—')}</td>)}{actions && <td>{actions(row)}</td>}</tr>)}</tbody></table>{!rows.length && <Empty text={`No ${title.toLowerCase()} found.`}/>}</div></div></div>;
}

function TeacherView({ classes, setError, setNotice }: { classes: ClassRow[]; setError: (v: string) => void; setNotice: (v: string) => void }) {
 const [rows,setRows]=useState<any[]>([]); const [saving,setSaving]=useState(false);
 const [form,setForm]=useState({full_name:'',employee_id:'',cnic:'',phone:'',email:'',password:'',department:'',class_id:'',subject:'',is_class_teacher:false});
 const load=async()=>{const {data:s}=await supabase().auth.getSession();const t=s.session?.access_token;if(!t)return;const r=await fetch('/api/admin-teachers',{headers:{Authorization:'Bearer '+t},cache:'no-store'});const p=await r.json();if(!r.ok)return setError(p.error||'Unable to load teachers');setRows(p.teachers||[])};
 useEffect(()=>{void load()},[]);
 async function submit(e:React.FormEvent){e.preventDefault();setSaving(true);setError('');setNotice('');try{const {data:s}=await supabase().auth.getSession();const t=s.session?.access_token;if(!t)throw new Error('Admin session expired');const r=await fetch('/api/admin-teachers',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+t},body:JSON.stringify(form)});const p=await r.json();if(!r.ok)throw new Error(p.error||'Unable to create teacher');setNotice('Teacher account created successfully.');setForm({full_name:'',employee_id:'',cnic:'',phone:'',email:'',password:'',department:'',class_id:'',subject:'',is_class_teacher:false});await load()}catch(e:any){setError(e?.message||'Unable to create teacher')}finally{setSaving(false)}}
 return <div className="content"><div className="pageIntro"><div><h2>Teacher Management</h2><p>Create secure teacher login accounts and assign class/subject.</p></div></div><div className="sectionGrid"><section className="panel"><div className="panelHead"><div><h2>Add Teacher</h2><p>Password is handled by Supabase Auth.</p></div></div><form className="teacherForm" onSubmit={submit}>
 <input placeholder="Full name" value={form.full_name} onChange={e=>setForm({...form,full_name:e.target.value})} required/><input placeholder="Employee ID" value={form.employee_id} onChange={e=>setForm({...form,employee_id:e.target.value})} required/>
 <input placeholder="CNIC (13 digits)" inputMode="numeric" maxLength={13} value={form.cnic} onChange={e=>setForm({...form,cnic:e.target.value.replace(/\D/g,'').slice(0,13)})}/><input placeholder="Phone (11 digits)" inputMode="numeric" maxLength={11} value={form.phone} onChange={e=>setForm({...form,phone:e.target.value.replace(/\D/g,'').slice(0,11)})}/>
 <input type="email" placeholder="Teacher email" value={form.email} onChange={e=>setForm({...form,email:e.target.value})} required/><input type="password" minLength={8} placeholder="Temporary password (8+)" value={form.password} onChange={e=>setForm({...form,password:e.target.value})} required/>
 <input placeholder="Department" value={form.department} onChange={e=>setForm({...form,department:e.target.value})}/><select value={form.class_id} onChange={e=>setForm({...form,class_id:e.target.value})}><option value="">Assign class (optional)</option>{classes.map(c=><option key={c.id} value={c.id}>{c.name} — {c.section}</option>)}</select>
 <input placeholder="Subject" value={form.subject} onChange={e=>setForm({...form,subject:e.target.value})}/><label className="checkLine"><input type="checkbox" checked={form.is_class_teacher} onChange={e=>setForm({...form,is_class_teacher:e.target.checked})}/> Class teacher</label>
 <button className="primaryBtn" disabled={saving}>{saving?'Creating…':'Create Teacher Account'}</button></form></section><section className="panel"><div className="panelHead"><div><h2>Teacher Accounts</h2><p>{rows.length} registered</p></div></div><div className="recentList">{rows.map(t=><div className="recentRow" key={t.id}><div className="personAvatar">{String(t.full_name||'?').charAt(0).toUpperCase()}</div><div className="person"><strong>{t.full_name}</strong><span>{t.employee_id} · {t.email}</span><small>{t.class_name||'No class'}{t.subject?' · '+t.subject:''}</small></div><Status value={t.active===false?'Inactive':'Active'}/></div>)}{!rows.length&&<Empty text="No teachers created yet."/>}</div></section></div></div>;
}

function CardView({ students, cardStudent, setCardStudent, issueCard, cardToken }: any) {
  return <div className="content"><div className="pageIntro"><div><h2>Digital student cards</h2><p>Issue a card token for an approved student.</p></div></div><div className="cardGenerator"><div className="generatorIcon"><ShieldCheck size={28}/></div><h3>Generate student card</h3><p>Select a student to issue their card.</p><select value={cardStudent} onChange={(e) => setCardStudent(e.target.value)}><option value="">Select student</option>{students.map((x: Student) => <option key={x.id} value={x.id}>{x.full_name} — {x.student_id}</option>)}</select><button className="primaryBtn" disabled={!cardStudent} onClick={() => void issueCard(cardStudent)}>Issue / Generate Card</button>{cardToken && <div className="tokenBox"><strong>Card issued</strong><span>{cardToken}</span></div>}</div></div>;
}

function Stat({ icon, label, value, tone }: any) { return <div className={`statCard ${tone}`}><div className="statIcon">{icon}</div><div><span>{label}</span><strong>{value}</strong></div></div>; }
function Status({ value }: { value: string }) { const v = value.toLowerCase(); return <span className={`status ${v.includes('approved') || v === 'active' || v === 'yes' ? 'green' : v.includes('reject') || v === 'inactive' || v === 'no' ? 'red' : v.includes('pending') ? 'amber' : 'neutral'}`}>{value}</span>; }
function Empty({ text }: { text: string }) { return <div className="empty"><Search size={22}/><p>{text}</p></div>; }

function Login() { const [email, setEmail] = useState(''); const [password, setPassword] = useState(''); const [error, setError] = useState(''); async function submit(e: React.FormEvent) { e.preventDefault(); setError(''); const { error } = await supabase().auth.signInWithPassword({ email, password }); if (error) setError(error.message); else window.location.reload(); } return <main className="authPage"><div className="authCard"><div className="authLogo">N</div><p className="eyebrow">NPSD ADMINISTRATION</p><h1>Welcome back</h1><p className="sub">Sign in to manage the school portal.</p><form onSubmit={submit}><label>Email<input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Admin email" required /></label><label>Password<input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" required /></label><button className="primaryBtn" type="submit">Sign in securely</button>{error && <p className="loginError">{error}</p>}</form></div></main>; }
function AccessDenied() { return <main className="authPage"><div className="authCard"><div className="authLogo">!</div><h1>Access denied</h1><p className="sub">This account is not authorized for the NPSD admin dashboard.</p></div></main>; }
