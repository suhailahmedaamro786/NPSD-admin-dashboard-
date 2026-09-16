'use client';
import {useEffect,useState} from 'react';
import {supabase} from '../lib/supabase';

const ADMIN_EMAIL='suhailahmedaamro786@gmail.com';

type Stats={students:number;parents:number;pending:number;announcements:number};

export default function Home(){
  const [user,setUser]=useState<any>(null);
  const [loading,setLoading]=useState(true);
  const [stats,setStats]=useState<Stats>({students:0,parents:0,pending:0,announcements:0});
  const [error,setError]=useState('');

  useEffect(()=>{
    let active=true;
    supabase().auth.getUser().then(async({data})=>{
      if(!active)return;
      setUser(data.user);
      setLoading(false);
      if(data.user?.email?.toLowerCase()===ADMIN_EMAIL) loadStats();
    });
    return()=>{active=false};
  },[]);

  async function loadStats(){
    const db=supabase();
    const [students,parents,pending,announcements]=await Promise.all([
      db.from('students').select('id',{count:'exact',head:true}),
      db.from('parents').select('id',{count:'exact',head:true}),
      db.from('results').select('id',{count:'exact',head:true}).eq('published',false),
      db.from('announcements').select('id',{count:'exact',head:true}).eq('published',true)
    ]);
    const firstError=[students.error,parents.error,pending.error,announcements.error].find(Boolean);
    if(firstError){setError(firstError.message);return;}
    setStats({
      students:students.count??0,
      parents:parents.count??0,
      pending:pending.count??0,
      announcements:announcements.count??0
    });
  }

  if(loading)return <main className="wrap"><div className="card">Loading admin session...</div></main>;
  if(!user)return <Login/>;
  if((user.email||'').toLowerCase()!==ADMIN_EMAIL)return <AccessDenied/>;

  return <main className="wrap">
    <div className="nav">
      <div>
        <div className="brand">🛡️ NPSD Admin Dashboard</div>
        <div className="muted">Noble Public School Dadu • Control Center</div>
        <div className="muted">Admin: {user.email}</div>
      </div>
      <button className="btn" onClick={()=>supabase().auth.signOut().then(()=>location.reload())}>Logout</button>
    </div>

    <div className="grid">
      <Stat t="Students" value={stats.students}/>
      <Stat t="Parents" value={stats.parents}/>
      <Stat t="Pending Results" value={stats.pending}/>
      <Stat t="Published Announcements" value={stats.announcements}/>
    </div>

    {error&&<div className="card section"><b>Database status</b><p className="muted">{error}</p><button className="btn" onClick={loadStats}>Retry</button></div>}

    <div className="card section">
      <h2>Administration</h2>
      <p className="muted">Manage the complete school portal from one secure dashboard.</p>
      <div className="grid section">
        <Module n="Students & Parents" d="Create students, parent accounts and family links."/>
        <Module n="Attendance" d="Record daily attendance and monitor percentages."/>
        <Module n="Exams & Results" d="Create exams and manage subject marks."/>
        <Module n="Result Review" d="Review imported results before publishing."/>
        <Module n="Announcements" d="Publish school notices to approved users."/>
        <Module n="Digital Cards" d="Generate student cards and verification QR."/>
        <Module n="Audit Logs" d="Track important administrative actions."/>
        <Module n="Settings" d="Portal configuration and security controls."/>
      </div>
    </div>
  </main>
}

function Stat({t,value}:{t:string;value:number}){return <div className="card"><div className="muted">{t}</div><div className="stat">{value}</div><span className="badge">Live</span></div>}
function Module({n,d}:{n:string;d:string}){return <div className="card"><b>{n}</b><p className="muted">{d}</p><span className="badge">Module ready</span></div>}

function Login(){
  const[e,setE]=useState('');const[p,setP]=useState('');const[x,setX]=useState('');const[busy,setBusy]=useState(false);
  async function go(a:any){a.preventDefault();setX('');if(e.trim().toLowerCase()!==ADMIN_EMAIL){setX('Access Denied: This account is not authorized.');return}setBusy(true);const{error}=await supabase().auth.signInWithPassword({email:ADMIN_EMAIL,password:p});setBusy(false);if(error)setX('Access Denied: Invalid admin credentials.');else location.reload()}
  async function google(){setX('');setBusy(true);const{error}=await supabase().auth.signInWithOAuth({provider:'google',options:{redirectTo:`${window.location.origin}/auth/callback`}});if(error){setBusy(false);setX(error.message)}}
  return <main className="wrap"><div className="card login"><h1>NPSD Admin</h1><p className="muted">Authorized administrator only</p><form onSubmit={go}><label>Admin Email</label><input className="input" type="email" required value={e} onChange={a=>setE(a.target.value)} placeholder={ADMIN_EMAIL}/><label>Password</label><input className="input" type="password" required value={p} onChange={a=>setP(a.target.value)}/>{x&&<p>{x}</p>}<button className="btn" disabled={busy}>{busy?'Signing in...':'Sign in'}</button></form><div className="section"><button className="btn" type="button" disabled={busy} onClick={google}>Continue with Google</button><p className="muted">Google sign-in is checked against the authorized admin email after authentication.</p></div></div></main>
}

function AccessDenied(){useEffect(()=>{supabase().auth.signOut()},[]);return <main className="wrap"><div className="card login"><h1>Access Denied</h1><p className="muted">This account is not authorized to use the NPSD Admin Dashboard.</p></div></main>}
