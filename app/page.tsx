'use client';

import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabase';

const ADMIN_EMAIL = 'suhailahmedaamro786@gmail.com';
type Student = { id:string; student_id:string; full_name:string; father_name:string|null; guardian_name:string|null; photo_url:string|null; class_id:string|null; active:boolean; classes?: {name:string;section:string}|null };
type ClassRow = { id:string; name:string; section:string; academic_year:string|null };

export default function Home(){
  const [user,setUser]=useState<any>(null); const [loading,setLoading]=useState(true);
  useEffect(()=>{supabase().auth.getUser().then(({data})=>{setUser(data.user);setLoading(false)})},[]);
  if(loading)return <main className="wrap"><div className="card">Loading admin dashboard...</div></main>;
  if(!user)return <Login/>;
  if((user.email||'').toLowerCase()!==ADMIN_EMAIL)return <AccessDenied/>;
  return <Admin user={user}/>;
}

function Admin({user}:{user:any}){
  const [students,setStudents]=useState<Student[]>([]); const [classes,setClasses]=useState<ClassRow[]>([]);
  const [stats,setStats]=useState({students:0,parents:0,pending:0,announcements:0}); const [busy,setBusy]=useState(true);
  const [error,setError]=useState(''); const [query,setQuery]=useState(''); const [showForm,setShowForm]=useState(false); const [editing,setEditing]=useState<Student|null>(null);
  const load=async()=>{setBusy(true);setError(''); const s=supabase();
    const [{data:st,error:se},{data:cl,error:ce},{count:pc},{count:rc},{count:ac}]=await Promise.all([
      s.from('students').select('id,student_id,full_name,father_name,guardian_name,photo_url,class_id,active,classes(name,section)').order('full_name'),
      s.from('classes').select('id,name,section,academic_year').order('name').order('section'),
      s.from('parents').select('id',{count:'exact',head:true}),
      s.from('result_documents').select('id',{count:'exact',head:true}).in('status',['pending','processing','review']),
      s.from('announcements').select('id',{count:'exact',head:true})
    ]);
    if(se||ce){setError(se?.message||ce?.message||'Could not load data.');}
    setStudents((st||[]) as Student[]); setClasses(cl||[]); setStats({students:st?.length||0,parents:pc||0,pending:rc||0,announcements:ac||0}); setBusy(false);
  };
  useEffect(()=>{load()},[]);
  const filtered=useMemo(()=>students.filter(x=>`${x.full_name} ${x.student_id} ${x.father_name||''}`.toLowerCase().includes(query.toLowerCase())),[students,query]);
  async function removeStudent(id:string){if(!confirm('Deactivate this student?'))return; const {error}=await supabase().from('students').update({active:false}).eq('id',id); if(error)setError(error.message); else load();}
  return <main className="wrap">
    <div className="nav"><div><div className="brand">🛡️ NPSD Admin Dashboard</div><div className="muted">Noble Public School Dadu</div><div className="muted">Admin: {user.email}</div></div><button className="btn secondary" onClick={()=>supabase().auth.signOut().then(()=>location.reload())}>Logout</button></div>
    <div className="grid stats"><Stat t="Students" v={stats.students}/><Stat t="Parents" v={stats.parents}/><Stat t="Pending Results" v={stats.pending}/><Stat t="Announcements" v={stats.announcements}/></div>
    {error&&<div className="alert">{error}</div>}
    <section className="card section">
      <div className="sectionHead"><div><h2>Students & Parents</h2><p className="muted">Manage student records and prepare parent links.</p></div><button className="btn" onClick={()=>{setEditing(null);setShowForm(true)}}>＋ Add Student</button></div>
      <div className="toolbar"><input className="input search" value={query} onChange={e=>setQuery(e.target.value)} placeholder="Search name, student ID or father name..."/><button className="btn secondary" onClick={load} disabled={busy}>{busy?'Loading...':'Refresh'}</button></div>
      <div className="tableWrap"><table><thead><tr><th>Student</th><th>ID</th><th>Class</th><th>Father / Guardian</th><th>Status</th><th>Actions</th></tr></thead><tbody>{filtered.map(st=><tr key={st.id}><td><b>{st.full_name}</b></td><td>{st.student_id}</td><td>{st.classes?`${st.classes.name} — ${st.classes.section}`:'Unassigned'}</td><td>{st.father_name||st.guardian_name||'—'}</td><td><span className={`badge ${st.active?'ok':'off'}`}>{st.active?'Active':'Inactive'}</span></td><td><button className="linkBtn" onClick={()=>{setEditing(st);setShowForm(true)}}>Edit</button>{st.active&&<button className="linkBtn danger" onClick={()=>removeStudent(st.id)}>Deactivate</button>}</td></tr>)}{!filtered.length&&<tr><td colSpan={6} className="empty">No students found.</td></tr>}</tbody></table></div>
    </section>
    <section className="grid section modules"><Module n="Attendance" d="Daily, monthly and percentage tracking"/><Module n="Exams & Results" d="Marks, grades, position and publishing"/><Module n="Result Review" d="PDF import and manual review queue"/><Module n="Announcements" d="Publish school notices"/><Module n="Digital Cards" d="Student card and QR verification"/><Module n="Audit Logs" d="Track administrator actions"/></section>
    {showForm&&<StudentForm classes={classes} student={editing} onClose={()=>setShowForm(false)} onSaved={()=>{setShowForm(false);load()}}/>}
  </main>
}

function StudentForm({classes,student,onClose,onSaved}:{classes:ClassRow[];student:Student|null;onClose:()=>void;onSaved:()=>void}){
 const [form,setForm]=useState({student_id:student?.student_id||'',full_name:student?.full_name||'',father_name:student?.father_name||'',guardian_name:student?.guardian_name||'',class_id:student?.class_id||'',photo_url:student?.photo_url||'',active:student?.active??true}); const [saving,setSaving]=useState(false); const [error,setError]=useState('');
 const set=(k:string,v:any)=>setForm(x=>({...x,[k]:v}));
 async function save(e:any){e.preventDefault();setSaving(true);setError('');const payload={...form,father_name:form.father_name||null,guardian_name:form.guardian_name||null,class_id:form.class_id||null,photo_url:form.photo_url||null};const q=student?supabase().from('students').update(payload).eq('id',student.id):supabase().from('students').insert(payload);const {error}=await q;setSaving(false);if(error)setError(error.message);else onSaved();}
 return <div className="modal"><div className="modalCard"><div className="sectionHead"><div><h2>{student?'Edit Student':'Add Student'}</h2><p className="muted">Student record is protected by Supabase RLS.</p></div><button className="iconBtn" onClick={onClose}>×</button></div><form onSubmit={save}><label>Student ID / Roll No<input className="input" required value={form.student_id} onChange={e=>set('student_id',e.target.value)} /></label><label>Full Name<input className="input" required value={form.full_name} onChange={e=>set('full_name',e.target.value)} /></label><div className="two"><label>Father Name<input className="input" value={form.father_name} onChange={e=>set('father_name',e.target.value)} /></label><label>Guardian Name<input className="input" value={form.guardian_name} onChange={e=>set('guardian_name',e.target.value)} /></label></div><label>Class / Section<select className="input" value={form.class_id} onChange={e=>set('class_id',e.target.value)}><option value="">Unassigned</option>{classes.map(c=><option key={c.id} value={c.id}>{c.name} — {c.section}{c.academic_year?` (${c.academic_year})`:''}</option>)}</select></label><label>Photo URL (optional)<input className="input" value={form.photo_url} onChange={e=>set('photo_url',e.target.value)} placeholder="https://..." /></label>{student&&<label className="check"><input type="checkbox" checked={form.active} onChange={e=>set('active',e.target.checked)}/> Active student</label>}{error&&<div className="alert">{error}</div>}<div className="actions"><button type="button" className="btn secondary" onClick={onClose}>Cancel</button><button className="btn" disabled={saving}>{saving?'Saving...':student?'Save Changes':'Create Student'}</button></div></form></div></div>
}
function Stat({t,v}:{t:string;v:number}){return <div className="card"><div className="muted">{t}</div><div className="stat">{v}</div></div>}
function Module({n,d}:{n:string;d:string}){return <div className="card module"><b>{n}</b><p className="muted">{d}</p><span className="badge">Coming next</span></div>}
function Login(){const[e,setE]=useState('');const[p,setP]=useState('');const[x,setX]=useState('');const[busy,setBusy]=useState(false);async function go(a:any){a.preventDefault();setX('');if(e.trim().toLowerCase()!==ADMIN_EMAIL){setX('Access Denied: This account is not authorized.');return}setBusy(true);const{error}=await supabase().auth.signInWithPassword({email:ADMIN_EMAIL,password:p});setBusy(false);if(error)setX('Access Denied: Invalid admin credentials.');else location.reload()}async function google(){setX('');setBusy(true);const{error}=await supabase().auth.signInWithOAuth({provider:'google',options:{redirectTo:`${window.location.origin}/auth/callback`}});if(error){setBusy(false);setX(error.message)}}return <main className="wrap"><div className="card login"><h1>NPSD Admin</h1><p className="muted">Authorized administrator only</p><form onSubmit={go}><label>Admin Email</label><input className="input" type="email" required value={e} onChange={a=>setE(a.target.value)} placeholder={ADMIN_EMAIL}/><label>Password</label><input className="input" type="password" required value={p} onChange={a=>setP(a.target.value)}/>{x&&<p>{x}</p>}<button className="btn" disabled={busy}>{busy?'Signing in...':'Sign in'}</button></form><div className="section"><button className="btn full" type="button" disabled={busy} onClick={google}>Continue with Google</button><p className="muted">Google sign-in is checked against the authorized admin email after authentication.</p></div></div></main>}
function AccessDenied(){useEffect(()=>{supabase().auth.signOut()},[]);return <main className="wrap"><div className="card login"><h1>Access Denied</h1><p className="muted">This account is not authorized to use the NPSD Admin Dashboard.</p></div></main>}
