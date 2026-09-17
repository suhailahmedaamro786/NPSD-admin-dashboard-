'use client';

import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabase';

const ADMIN_EMAIL = 'suhailahmedaamro786@gmail.com';
type TabName = 'requests' | 'students' | 'parents' | 'classes' | 'attendance' | 'exams' | 'results' | 'announcements' | 'cards';

type Student = { id: string; student_id: string; full_name: string; father_name?: string | null; active?: boolean; class_id?: string | null; classes?: { name: string; section: string } | null };
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

  useEffect(() => { loadCore(); loadOperations(); }, []);

  const filteredReq = useMemo(() => requests.filter(r => (filter === 'all' || r.status === filter) && `${r.full_name} ${r.student_id} ${r.father_name}`.toLowerCase().includes(query.toLowerCase())), [requests, filter, query]);
  const studentMap = useMemo(() => Object.fromEntries(students.map(s => [s.id, s])), [students]);
  const classMap = useMemo(() => Object.fromEntries(classes.map(c => [c.id, c])), [classes]);

  async function review(r: any, approve: boolean) {
    const note = prompt(approve ? 'Optional approval note' : 'Reason / note for rejection', r.admin_note || '');
    if (note === null) return;
    setBusy(true); setError('');
    const { error: e } = await supabase().rpc('approve_access_request', { p_request_id: r.id, p_approve: approve, p_note: note || null });
    if (e) setError(e.message); else { setNotice(approve ? `${r.student_id} approved.` : `${r.student_id} rejected.`); await loadCore(); }
    setBusy(false);
  }

  async function addAttendance(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault(); setError(''); setNotice('');
    const fd = new FormData(e.currentTarget);
    const payload = { student_id: String(fd.get('student_id')), attendance_date: String(fd.get('attendance_date')), status: String(fd.get('status')), note: String(fd.get('note') || '') || null };
    const { error: er } = await supabase().from('attendance').upsert(payload, { onConflict: 'student_id,attendance_date' });
    if (er) setError(er.message); else { setNotice('Attendance saved.'); e.currentTarget.reset(); await loadOperations(); }
  }

  async function addExam(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault(); setError(''); setNotice(''); const fd = new FormData(e.currentTarget);
    const payload = { name: String(fd.get('name')), exam_date: String(fd.get('exam_date')) || null, class_id: String(fd.get('class_id')) || null, total_marks: Number(fd.get('total_marks') || 100), published: false };
    const { error: er } = await supabase().from('exams').insert(payload);
    if (er) setError(er.message); else { setNotice('Exam created as draft.'); e.currentTarget.reset(); await loadOperations(); }
  }

  async function toggleExam(id: number, published: boolean) {
    const { error: er } = await supabase().from('exams').update({ published: !published }).eq('id', id);
    if (er) setError(er.message); else { setNotice(!published ? 'Exam published.' : 'Exam moved back to draft.'); await loadOperations(); }
  }

  async function addResult(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault(); setError(''); setNotice(''); const fd = new FormData(e.currentTarget);
    const obtained = Number(fd.get('marks_obtained')); const total = Number(fd.get('total_marks'));
    if (!Number.isFinite(obtained) || !Number.isFinite(total) || total <= 0 || obtained < 0 || obtained > total) { setError('Marks must be between 0 and total marks.'); return; }
    const percentage = obtained * 100 / total;
    const grade = percentage >= 80 ? 'A+' : percentage >= 70 ? 'A' : percentage >= 60 ? 'B' : percentage >= 50 ? 'C' : percentage >= 40 ? 'D' : 'F';
    const passed = percentage >= 40;
    const payload = { student_id: String(fd.get('student_id')), exam_id: Number(fd.get('exam_id')), subject: String(fd.get('subject')), marks_obtained: obtained, total_marks: total, obtained, total, grade, pass: passed, published: false };
    const { error: er } = await supabase().from('results').insert(payload);
    if (er) setError(er.message); else { setNotice('Result saved as unpublished.'); e.currentTarget.reset(); await loadOperations(); }
  }

  async function publishResult(id: number, published: boolean) {
    const { error: er } = await supabase().from('results').update({ published: !published }).eq('id', id);
    if (er) setError(er.message); else { setNotice(!published ? 'Result published.' : 'Result unpublished.'); await loadOperations(); }
  }

  async function addAnnouncement(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault(); setError(''); setNotice(''); const fd = new FormData(e.currentTarget);
    const published = fd.get('published') === 'on';
    const payload = { title: String(fd.get('title')), body: String(fd.get('body')), published, published_at: published ? new Date().toISOString() : null, target_class_id: String(fd.get('target_class_id')) || null };
    const { error: er } = await supabase().from('announcements').insert(payload);
    if (er) setError(er.message); else { setNotice('Announcement saved.'); e.currentTarget.reset(); await loadOperations(); }
  }

  async function toggleAnnouncement(id: number, published: boolean) {
    const { error: er } = await supabase().from('announcements').update({ published: !published, published_at: !published ? new Date().toISOString() : null }).eq('id', id);
    if (er) setError(er.message); else { setNotice(!published ? 'Announcement published.' : 'Announcement unpublished.'); await loadOperations(); }
  }

  async function issueCard() {
    if (!cardStudent) { setError('Select a student first.'); return; }
    setError(''); setCardToken('');
    const { data, error: er } = await supabase().rpc('issue_student_card', { p_student_id: cardStudent });
    if (er) setError(er.message); else { setCardToken(data || ''); setNotice('Card issued. Save the QR token securely; it is returned only once.'); }
  }

  const nav: { id: TabName; label: string }[] = [
    { id: 'requests', label: '📥 Requests' }, { id: 'students', label: '👨‍🎓 Students' }, { id: 'parents', label: '👨‍👩‍👧 Parents' }, { id: 'classes', label: '🏫 Classes' },
    { id: 'attendance', label: '📅 Attendance' }, { id: 'exams', label: '📝 Exams' }, { id: 'results', label: '📊 Results' }, { id: 'announcements', label: '📢 Announcements' }, { id: 'cards', label: '🪪 Digital Cards' },
  ];

  return <main className="wrap">
    <header className="nav"><div><div className="brand">🛡️ NPSD Admin Control Center</div><div className="muted">Noble Public School Dadu • {user.email}</div></div><button className="btn secondary" onClick={() => supabase().auth.signOut().then(() => location.reload())}>Logout</button></header>
    <div className="grid stats"><Stat t="Pending Requests" v={requests.filter(x => x.status === 'pending').length} /><Stat t="Active Students" v={students.filter(x => x.active).length} /><Stat t="Parents" v={parents.length} /><Stat t="Classes" v={classes.length} /><Stat t="Today's Attendance" v={attendance.filter(x => x.attendance_date === new Date().toISOString().slice(0, 10)).length} /><Stat t="Published Results" v={results.filter(x => x.published).length} /></div>
    {error && <div className="alert">{error}</div>}{notice && <div className="success">{notice}</div>}
    <div className="tabs">{nav.map(n => <Tab key={n.id} active={tab === n.id} onClick={() => setTab(n.id)}>{n.label}</Tab>)}</div>

    {tab === 'requests' && <section className="card section"><SectionHead title="Student Registration Requests" sub="Approve or reject complete admission applications." refresh={loadCore} busy={busy} /><div className="toolbar"><select className="input search" value={filter} onChange={e => setFilter(e.target.value)}><option value="pending">Pending</option><option value="approved">Approved</option><option value="rejected">Rejected</option><option value="all">All</option></select><input className="input search" value={query} onChange={e => setQuery(e.target.value)} placeholder="Search student, ID or father name…" /></div><Table><thead><tr><th>Student</th><th>Student ID</th><th>Class</th><th>Family</th><th>Status</th><th>Action</th></tr></thead><tbody>{filteredReq.map(r => <tr key={r.id}><td><b>{r.full_name}</b><small>{r.dob} • {r.gender}</small></td><td>{r.student_id}</td><td>{r.classes ? `${r.classes.name}-${r.classes.section}` : '—'}</td><td>{r.father_name}<small>{r.phone || 'No phone'}</small></td><td><span className={`badge ${r.status}`}>{r.status}</span></td><td>{r.status === 'pending' ? <div className="rowActions"><button className="linkBtn ok" onClick={() => review(r, true)}>Approve</button><button className="linkBtn danger" onClick={() => review(r, false)}>Reject</button></div> : <button className="linkBtn" onClick={() => alert(`Request ${r.student_id}\nStatus: ${r.status}\nNote: ${r.admin_note || '—'}`)}>View</button>}</td></tr>)}{!filteredReq.length && <Empty cols={6} />}</tbody></Table></section>}

    {tab === 'students' && <section className="card section"><SectionHead title="Students" sub="Approved student records and account state." refresh={loadCore} busy={busy} /><Table><thead><tr><th>Name</th><th>ID</th><th>Class</th><th>Father</th><th>Status</th></tr></thead><tbody>{students.map(s => <tr key={s.id}><td><b>{s.full_name}</b></td><td>{s.student_id}</td><td>{s.classes ? `${s.classes.name}-${s.classes.section}` : '—'}</td><td>{s.father_name || '—'}</td><td><span className={`badge ${s.active ? 'approved' : 'rejected'}`}>{s.active ? 'Active' : 'Inactive'}</span></td></tr>)}</tbody></Table></section>}

    {tab === 'parents' && <section className="card section"><SectionHead title="Parents" sub="Parent accounts and approval state." refresh={loadCore} busy={busy} /><Table><thead><tr><th>Name</th><th>Phone</th><th>Status</th></tr></thead><tbody>{parents.map(p => <tr key={p.id}><td>{p.full_name}</td><td>{p.phone || '—'}</td><td><span className={`badge ${p.approved ? 'approved' : 'pending'}`}>{p.approved ? 'Approved' : 'Pending'}</span></td></tr>)}</tbody></Table></section>}

    {tab === 'classes' && <section className="card section"><SectionHead title="Classes & Sections" sub="Registration choices for academic year." refresh={loadCore} busy={busy} /><Table><thead><tr><th>Class</th><th>Section</th><th>Label</th><th>Academic Year</th></tr></thead><tbody>{classes.map(c => <tr key={c.id}><td>{c.name}</td><td>{c.section}</td><td><b>{c.name}-{c.section}</b></td><td>{c.academic_year || '—'}</td></tr>)}</tbody></Table></section>}

    {tab === 'attendance' && <section className="card section"><SectionHead title="Attendance Management" sub="Mark daily attendance and keep a searchable record." refresh={loadOperations} /><form onSubmit={addAttendance} className="formCard inlineForm"><SelectField name="student_id" label="Student" options={students.map(s => ({ value: s.id, label: `${s.student_id} — ${s.full_name}` }))} /><label>Date<input className="input" name="attendance_date" type="date" defaultValue={new Date().toISOString().slice(0, 10)} required /></label><label>Status<select className="input" name="status" defaultValue="present"><option value="present">Present</option><option value="absent">Absent</option><option value="late">Late</option></select></label><label>Note<input className="input" name="note" placeholder="Optional note" /></label><button className="btn full" type="submit">Save Attendance</button></form><Table><thead><tr><th>Date</th><th>Student</th><th>Status</th><th>Note</th></tr></thead><tbody>{attendance.map(a => <tr key={a.id}><td>{a.attendance_date}</td><td>{studentMap[a.student_id]?.full_name || a.student_id}</td><td><span className={`badge ${a.status}`}>{a.status}</span></td><td>{a.note || '—'}</td></tr>)}</tbody></Table></section>}

    {tab === 'exams' && <section className="card section"><SectionHead title="Exams" sub="Create exams, assign classes and publish them when ready." refresh={loadOperations} /><form onSubmit={addExam} className="formCard inlineForm"><label>Exam Name<input className="input" name="name" placeholder="Mid Term 2026" required /></label><label>Date<input className="input" name="exam_date" type="date" required /></label><SelectField name="class_id" label="Class" options={classes.map(c => ({ value: c.id, label: `${c.name}-${c.section}` }))} /><label>Total Marks<input className="input" name="total_marks" type="number" min="1" defaultValue="100" required /></label><button className="btn full" type="submit">Create Exam</button></form><Table><thead><tr><th>Exam</th><th>Date</th><th>Class</th><th>Total</th><th>Status</th><th>Action</th></tr></thead><tbody>{exams.map(e => <tr key={e.id}><td><b>{e.name}</b></td><td>{e.exam_date || '—'}</td><td>{classMap[e.class_id]?.name ? `${classMap[e.class_id].name}-${classMap[e.class_id].section}` : 'All'}</td><td>{e.total_marks || '—'}</td><td><span className={`badge ${e.published ? 'approved' : 'pending'}`}>{e.published ? 'Published' : 'Draft'}</span></td><td><button className="linkBtn" onClick={() => toggleExam(e.id, e.published)}>{e.published ? 'Unpublish' : 'Publish'}</button></td></tr>)}</tbody></Table></section>}

    {tab === 'results' && <section className="card section"><SectionHead title="Result Entry & Publishing" sub="Enter marks, calculate grades automatically, then publish." refresh={loadOperations} /><form onSubmit={addResult} className="formCard inlineForm"><SelectField name="student_id" label="Student" options={students.map(s => ({ value: s.id, label: `${s.student_id} — ${s.full_name}` }))} /><SelectField name="exam_id" label="Exam" options={exams.map(e => ({ value: String(e.id), label: e.name }))} /><label>Subject<input className="input" name="subject" placeholder="Mathematics" required /></label><label>Obtained<input className="input" name="marks_obtained" type="number" min="0" required /></label><label>Total<input className="input" name="total_marks" type="number" min="1" defaultValue="100" required /></label><button className="btn full" type="submit">Save Result</button></form><Table><thead><tr><th>Student</th><th>Exam</th><th>Subject</th><th>Marks</th><th>Grade</th><th>Status</th><th>Action</th></tr></thead><tbody>{results.map(r => <tr key={r.id}><td>{studentMap[r.student_id]?.full_name || r.student_id}</td><td>{exams.find(e => e.id === r.exam_id)?.name || r.exam_id}</td><td>{r.subject}</td><td>{r.marks_obtained ?? r.obtained} / {r.total_marks ?? r.total}</td><td><b>{r.grade || '—'}</b></td><td><span className={`badge ${r.published ? 'approved' : 'pending'}`}>{r.published ? 'Published' : 'Draft'}</span></td><td><button className="linkBtn" onClick={() => publishResult(r.id, r.published)}>{r.published ? 'Unpublish' : 'Publish'}</button></td></tr>)}</tbody></Table></section>}

    {tab === 'announcements' && <section className="card section"><SectionHead title="Announcements" sub="Publish school notices to the student/parent portal." refresh={loadOperations} /><form onSubmit={addAnnouncement} className="formCard"><label>Title<input className="input" name="title" placeholder="Parent Teacher Meeting" required /></label><label>Message<textarea className="input" name="body" rows={5} placeholder="Write announcement…" required /></label><SelectField name="target_class_id" label="Target Class (optional)" options={[{ value: '', label: 'All students' }, ...classes.map(c => ({ value: c.id, label: `${c.name}-${c.section}` }))]} /><label className="check"><input type="checkbox" name="published" /> Publish immediately</label><button className="btn" type="submit">Save Announcement</button></form><Table><thead><tr><th>Title</th><th>Target</th><th>Created</th><th>Status</th><th>Action</th></tr></thead><tbody>{announcements.map(n => <tr key={n.id}><td><b>{n.title}</b><small>{n.body.slice(0, 100)}{n.body.length > 100 ? '…' : ''}</small></td><td>{classMap[n.target_class_id]?.name ? `${classMap[n.target_class_id].name}-${classMap[n.target_class_id].section}` : 'All'}</td><td>{n.created_at ? new Date(n.created_at).toLocaleDateString() : '—'}</td><td><span className={`badge ${n.published ? 'approved' : 'pending'}`}>{n.published ? 'Published' : 'Draft'}</span></td><td><button className="linkBtn" onClick={() => toggleAnnouncement(n.id, n.published)}>{n.published ? 'Unpublish' : 'Publish'}</button></td></tr>)}</tbody></Table></section>}

    {tab === 'cards' && <section className="card section"><SectionHead title="Digital Student Cards" sub="Issue a secure QR token for an active student card." refresh={loadOperations} /><div className="card inner"><SelectField name="card_student" label="Student" value={cardStudent} onValue={setCardStudent} options={students.map(s => ({ value: s.id, label: `${s.student_id} — ${s.full_name}` }))} /><button className="btn" onClick={issueCard}>Issue / Re-issue Card</button>{cardToken && <div className="tokenBox"><b>One-time QR token</b><code>{cardToken}</code><p className="muted">Store this token in your secure card/QR generator. The database stores only its SHA-256 hash.</p></div>}</div><Table><thead><tr><th>Student</th><th>Class</th><th>Active</th><th>Action</th></tr></thead><tbody>{students.map(s => <tr key={s.id}><td>{s.student_id} — {s.full_name}</td><td>{s.classes ? `${s.classes.name}-${s.classes.section}` : '—'}</td><td>{s.active ? 'Yes' : 'No'}</td><td><button className="linkBtn" onClick={() => { setCardStudent(s.id); setCardToken(''); }}>Select</button></td></tr>)}</tbody></Table></section>}

    <footer className="muted footer">NPSD Admin • Operational modules enabled • RLS remains enforced by Supabase.</footer>
  </main>;
}

function SectionHead({ title, sub, refresh, busy }: { title: string; sub: string; refresh?: () => void; busy?: boolean }) { return <div className="sectionHead"><div><h2>{title}</h2><p className="muted">{sub}</p></div>{refresh && <button className="btn secondary" onClick={refresh} disabled={busy}>{busy ? 'Loading…' : 'Refresh'}</button>}</div>; }
function Tab({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) { return <button className={`tab ${active ? 'active' : ''}`} onClick={onClick}>{children}</button>; }
function Stat({ t, v }: { t: string; v: number }) { return <div className="card"><div className="muted">{t}</div><div className="stat">{v}</div></div>; }
function Table({ children }: { children: React.ReactNode }) { return <div className="tableWrap"><table>{children}</table></div>; }
function Empty({ cols }: { cols: number }) { return <tr><td colSpan={cols} className="empty">No records found.</td></tr>; }
function SelectField({ name, label, options, value, onValue }: { name: string; label: string; options: { value: string; label: string }[]; value?: string; onValue?: (v: string) => void }) { return <label>{label}<select className="input" name={name} value={value} onChange={e => onValue?.(e.target.value)} required={options.some(o => o.value !== '')}>{options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}</select></label>; }
function Login() { const [e, setE] = useState(''); const [p, setP] = useState(''); const [x, setX] = useState(''); const [busy, setBusy] = useState(false); async function go(a: React.FormEvent) { a.preventDefault(); setX(''); if (e.trim().toLowerCase() !== ADMIN_EMAIL) { setX('Access Denied: This account is not authorized.'); return; } setBusy(true); const { error } = await supabase().auth.signInWithPassword({ email: ADMIN_EMAIL, password: p }); setBusy(false); if (error) setX('Access Denied: Invalid admin credentials.'); else location.reload(); } return <main className="wrap"><div className="login card"><h1>NPSD Admin</h1><p className="muted">Authorized administrator only</p><form onSubmit={go}><label>Email<input className="input" type="email" required value={e} onChange={a => setE(a.target.value)} /></label><label>Password<input className="input" type="password" required value={p} onChange={a => setP(a.target.value)} /></label>{x && <div className="alert">{x}</div>}<button className="btn full" disabled={busy}>{busy ? 'Signing in…' : 'Sign in'}</button></form></div></main>; }
function AccessDenied() { useEffect(() => { supabase().auth.signOut(); }, []); return <main className="wrap"><div className="login card"><h1>Access Denied</h1><p className="muted">This account is not authorized to use the NPSD Admin Dashboard.</p></div></main>; }
