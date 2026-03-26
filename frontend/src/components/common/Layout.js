import React, { useState } from 'react';
import { Outlet, NavLink, useNavigate } from 'react-router-dom';
import { Shield, AlertTriangle, FileText, Users, CheckSquare, BookOpen, LogOut, Menu, X, Bell, SlidersHorizontal } from 'lucide-react';
import RobotGuide from './RobotGuide';
import ThreeBackdrop from './ThreeBackdrop';

const S = {
  app: {
    display:'flex',
    minHeight:'100vh',
    background:
      'radial-gradient(1200px 600px at 70% -20%, rgba(41,134,184,0.20), transparent 55%), radial-gradient(900px 500px at -10% 110%, rgba(76,41,167,0.28), transparent 55%), #0b0f16',
    position:'relative',
    overflow:'hidden',
  },
  sidebar: { width:220, background:'#12121a', borderRight:'1px solid #1e1e2e', display:'flex', flexDirection:'column', flexShrink:0, position:'relative', zIndex:2 },
  sidebarMob: { position:'fixed', inset:0, zIndex:50, display:'flex' },
  overlay: { flex:1, background:'rgba(0,0,0,0.6)' },
  logo: { padding:'20px 16px', borderBottom:'1px solid #1e1e2e', display:'flex', alignItems:'center', gap:10 },
  logoIcon: { width:32, height:32, background:'linear-gradient(135deg,#4B3CA7,#7C6FD4)', borderRadius:8, display:'flex', alignItems:'center', justifyContent:'center' },
  logoText: { fontSize:16, fontWeight:700, color:'#e2e8f0' },
  logoSub: { fontSize:10, color:'#6b7280', marginTop:1 },
  nav: { flex:1, padding:'12px 8px', display:'flex', flexDirection:'column', gap:2 },
  navLink: { display:'flex', alignItems:'center', gap:10, padding:'9px 12px', borderRadius:8, color:'#9ca3af', textDecoration:'none', fontSize:13, fontWeight:500, transition:'all .15s' },
  main: { flex:1, display:'flex', flexDirection:'column', overflow:'hidden', position:'relative', zIndex:2 },
  topbar: {
    background:'rgba(18,18,26,0.8)',
    borderBottom:'1px solid #1e1e2e',
    boxShadow:'0 10px 30px rgba(0,0,0,0.18)',
    backdropFilter:'blur(10px)',
    padding:'0 20px',
    height:56,
    display:'flex',
    alignItems:'center',
    justifyContent:'space-between',
    flexShrink:0,
  },
  content: { flex:1, overflow:'auto', padding:24, position:'relative' },
  userBadge: { display:'flex', alignItems:'center', gap:8, fontSize:13, color:'#9ca3af' },
  avatar: { width:30, height:30, borderRadius:'50%', background:'#2D1B6E', display:'flex', alignItems:'center', justifyContent:'center', fontSize:12, color:'#a78bfa', fontWeight:600 },
  fxOrbA: {
    position:'absolute',
    width:340,
    height:340,
    borderRadius:'50%',
    right:-120,
    top:-120,
    background:'radial-gradient(circle, rgba(35,219,255,0.18), rgba(35,219,255,0))',
    pointerEvents:'none',
  },
  fxOrbB: {
    position:'absolute',
    width:420,
    height:420,
    borderRadius:'50%',
    left:-180,
    bottom:-210,
    background:'radial-gradient(circle, rgba(118,88,228,0.20), rgba(118,88,228,0))',
    pointerEvents:'none',
  },
};

const NAV = [
  { to:'/', icon:Shield, label:'Dashboard', exact:true },
  { to:'/alerts', icon:AlertTriangle, label:'Alert Queue' },
  { to:'/invoices', icon:FileText, label:'Invoices' },
  { to:'/suppliers', icon:Users, label:'Suppliers' },
  { to:'/tasks', icon:CheckSquare, label:'Tasks' },
  { to:'/audit', icon:BookOpen, label:'Audit Trail' },
  { to:'/ops-center', icon:SlidersHorizontal, label:'Ops Center' },
];

export default function Layout() {
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();
  const user = (() => {
    try {
      const token = localStorage.getItem('token');
      const savedName = (localStorage.getItem('user_name') || '').trim();
      const savedEmail = (localStorage.getItem('user_email') || '').trim();
      if (!token) {
        return { email: savedEmail || 'admin@gensafe.com', name: savedName || 'Admin' };
      }
      const payload = JSON.parse(atob(token.split('.')[1]));
      const email = payload.email || savedEmail || 'admin@gensafe.com';
      let name = payload.name || savedName || '';
      if (!name) {
        const local = String(email).split('@')[0] || 'admin';
        name = local
          .split(/[._-]/g)
          .filter(Boolean)
          .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
          .join(' ');
      }
      return { email, name: name || 'Admin' };
    } catch {
      return { email: 'admin@gensafe.com', name: 'Admin' };
    }
  })();

  const logout = () => {
    Object.keys(sessionStorage).forEach((key) => {
      if (key.startsWith('robot_welcome_') || key.startsWith('robot_')) {
        sessionStorage.removeItem(key);
      }
    });
    localStorage.removeItem('token');
    localStorage.removeItem('user_name');
    localStorage.removeItem('user_email');
    navigate('/login');
  };

  const SidebarContent = () => (
    <>
      <div style={S.logo}>
        <div style={S.logoIcon}><Shield size={16} color="#fff" /></div>
        <div><div style={S.logoText}>GenSafe B2B</div><div style={S.logoSub}>AI Fraud Detection</div></div>
      </div>
      <nav style={S.nav}>
        {NAV.map(({ to, icon: Icon, label, exact }) => (
          <NavLink key={to} to={to} end={exact} style={({ isActive }) => ({
            ...S.navLink,
            background: isActive ? 'rgba(75,60,167,0.2)' : 'transparent',
            color: isActive ? '#a78bfa' : '#9ca3af',
            borderLeft: isActive ? '2px solid #7C6FD4' : '2px solid transparent',
          })}>
            <Icon size={15} />{label}
          </NavLink>
        ))}
      </nav>
      <div style={{ padding:'12px 8px', borderTop:'1px solid #1e1e2e' }}>
        <button onClick={logout} style={{ ...S.navLink, width:'100%', border:'none', cursor:'pointer', background:'transparent' }}>
          <LogOut size={15} />Logout
        </button>
      </div>
    </>
  );

  return (
    <div style={S.app} className="gs-shell">
      <ThreeBackdrop />
      <div style={S.fxOrbA} />
      <div style={S.fxOrbB} />
      {/* Desktop sidebar */}
      <div style={{ ...S.sidebar, display:'flex' }} className="desktop-sidebar gs-sidebar"><SidebarContent /></div>

      {/* Mobile sidebar overlay */}
      {open && (
        <div style={S.sidebarMob}>
          <div style={{ width:220, ...S.sidebar }}><SidebarContent /></div>
          <div style={S.overlay} onClick={() => setOpen(false)} />
        </div>
      )}

      <div style={S.main} className="gs-main">
        <div style={S.topbar} className="gs-topbar">
          <button onClick={() => setOpen(!open)} style={{ background:'none', border:'none', color:'#9ca3af', cursor:'pointer', padding:4 }}>
            {open ? <X size={20}/> : <Menu size={20}/>}
          </button>
          <div style={S.userBadge}>
            <Bell size={16} />
            <div style={S.avatar}>{user.name[0].toUpperCase()}</div>
            <span style={{ fontSize:12 }}>{user.name}</span>
          </div>
        </div>
        <div style={S.content} className="gs-content">
          <div className="gs-page-shell"><Outlet /></div>
        </div>
      </div>
      <RobotGuide userName={user.name} userEmail={user.email} />
    </div>
  );
}
