import React, { useEffect, useState } from 'react';
import { Outlet, NavLink, useLocation, useNavigate } from 'react-router-dom';
import {
  Activity,
  AlertTriangle,
  Bell,
  BookOpen,
  CheckSquare,
  FileText,
  LogOut,
  Menu,
  Shield,
  SlidersHorizontal,
  Users,
  X,
} from 'lucide-react';
import RobotGuide from './RobotGuide';
import ThreeBackdrop from './ThreeBackdrop';

const NAV = [
  { to: '/', icon: Shield, label: 'Mission Control', exact: true },
  { to: '/alerts', icon: AlertTriangle, label: 'Alert Queue' },
  { to: '/invoices', icon: FileText, label: 'Invoices' },
  { to: '/suppliers', icon: Users, label: 'Suppliers' },
  { to: '/tasks', icon: CheckSquare, label: 'Tasks' },
  { to: '/audit', icon: BookOpen, label: 'Audit Trail' },
  { to: '/ops-center', icon: SlidersHorizontal, label: 'Ops Center' },
  { to: '/health', icon: Activity, label: 'Health Monitor', live: true },
];

const ROUTES = [
  { path: '/', title: 'Mission Control', crumb: 'Overview / dashboard' },
  { path: '/alerts', title: 'Alert Queue', crumb: 'Fraud / alert queue' },
  { path: '/invoices', title: 'Invoices', crumb: 'Fraud / invoices' },
  { path: '/suppliers', title: 'Suppliers', crumb: 'Fraud / suppliers' },
  { path: '/tasks', title: 'Tasks', crumb: 'Ops / meeting intelligence' },
  { path: '/audit', title: 'Audit Trail', crumb: 'Governance / audit logs' },
  { path: '/ops-center', title: 'Ops Center', crumb: 'Operations / control room' },
  { path: '/health', title: 'Health Monitor', crumb: 'Operations / health' },
];

const DESKTOP_BREAKPOINT = 900;

function getUser() {
  try {
    const token = localStorage.getItem('token');
    const savedName = (localStorage.getItem('user_name') || '').trim();
    const savedEmail = (localStorage.getItem('user_email') || '').trim();
    if (!token) return { email: savedEmail || 'admin@gensafe.com', name: savedName || 'GenSafe Admin' };
    const payload = JSON.parse(atob(token.split('.')[1]));
    const email = payload.email || savedEmail || 'admin@gensafe.com';
    let name = payload.name || savedName || '';
    if (!name) {
      if (String(email).toLowerCase() === 'admin@gensafe.com') {
        name = 'GenSafe Admin';
      } else {
        const local = String(email).split('@')[0] || 'admin';
        name = local
          .split(/[._-]/g)
          .filter(Boolean)
          .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
          .join(' ');
      }
    }
    return { email, name: name || 'GenSafe Admin' };
  } catch {
    return { email: 'admin@gensafe.com', name: 'GenSafe Admin' };
  }
}

function getRouteMeta(pathname) {
  return ROUTES.find((route) => {
    if (route.path === '/') return pathname === '/';
    return pathname === route.path || pathname.startsWith(`${route.path}/`);
  }) || ROUTES[0];
}

export default function Layout() {
  const [isDesktop, setIsDesktop] = useState(() => (typeof window === 'undefined' ? true : window.innerWidth > DESKTOP_BREAKPOINT));
  const [desktopSidebarVisible, setDesktopSidebarVisible] = useState(true);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();
  const user = getUser();
  const routeMeta = getRouteMeta(location.pathname);

  useEffect(() => {
    const handleResize = () => setIsDesktop(window.innerWidth > DESKTOP_BREAKPOINT);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  useEffect(() => {
    if (isDesktop) setMobileNavOpen(false);
  }, [isDesktop]);

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

  const toggleNavigation = () => {
    if (isDesktop) {
      setDesktopSidebarVisible((current) => !current);
      return;
    }
    setMobileNavOpen((current) => !current);
  };

  const closeMobileSidebar = () => {
    if (!isDesktop) setMobileNavOpen(false);
  };

  const openAdminWorkspace = () => navigate('/ops-center');
  const openMissionControl = () => navigate('/');

  const SidebarContent = () => (
    <>
      <div
        style={{
          height: 72,
          padding: '0 18px',
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          borderBottom: '1px solid var(--border)',
        }}
      >
        <button
          type="button"
          onClick={openMissionControl}
          title="Open Mission Control"
          style={{
            flex: 1,
            minWidth: 0,
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            padding: 0,
            background: 'transparent',
            border: 'none',
            color: 'inherit',
            cursor: 'pointer',
            textAlign: 'left',
          }}
        >
          <div
            style={{
              width: 38,
              height: 38,
              borderRadius: 12,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              background: 'radial-gradient(circle, rgba(0,212,255,0.18), rgba(124,111,255,0.14))',
              border: '1px solid rgba(0,212,255,0.28)',
              boxShadow: '0 0 24px rgba(0,212,255,0.12)',
            }}
          >
            <Shield size={17} color="var(--cyan)" />
          </div>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontFamily: 'Orbitron, sans-serif', fontSize: 17, fontWeight: 700, color: 'var(--text-primary)', lineHeight: 1 }}>
              GEN<span style={{ color: 'var(--cyan)' }}>SAFE</span>
            </div>
            <div
              className="jet-mono"
              style={{
                marginTop: 4,
                fontSize: 9,
                letterSpacing: 2,
                color: 'var(--text-dim)',
              }}
            >
              B2B FRAUD INTELLIGENCE
            </div>
          </div>
        </button>
      </div>

      <nav style={{ flex: 1, padding: '14px 10px', display: 'flex', flexDirection: 'column', gap: 4 }}>
        {NAV.map(({ to, icon: Icon, label, exact, live }) => (
          <NavLink
            key={to}
            to={to}
            end={exact}
            style={({ isActive }) => ({
              display: 'flex',
              alignItems: 'center',
              gap: 12,
              height: 44,
              padding: '0 12px',
              borderRadius: 12,
              textDecoration: 'none',
              fontSize: 13,
              fontWeight: 500,
              color: isActive ? 'var(--cyan)' : 'var(--text-secondary)',
              borderLeft: isActive ? '2px solid var(--cyan)' : '2px solid transparent',
              background: isActive ? 'linear-gradient(90deg, rgba(0,212,255,0.1), transparent)' : 'transparent',
              transition: 'all 160ms ease',
            })}
            onClick={closeMobileSidebar}
          >
            <Icon size={18} style={{ flexShrink: 0, color: 'currentColor' }} />
            <span style={{ flex: 1 }}>{label}</span>
            {live && <span className="pulse-dot" style={{ width: 8, height: 8 }} aria-hidden="true" />}
          </NavLink>
        ))}
      </nav>

      <div style={{ padding: 16, borderTop: '1px solid var(--border)' }}>
        <div
          className="glass-panel"
          style={{
            padding: 12,
            marginBottom: 12,
          }}
        >
          <div className="jet-mono" style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 10, color: 'var(--green)', letterSpacing: 1.4 }}>
            <span className="pulse-dot" />
            SYSTEM ONLINE
          </div>
          <button
            type="button"
            onClick={openAdminWorkspace}
            title={user.name}
            style={{
              width: '100%',
              marginTop: 10,
              padding: 0,
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              background: 'transparent',
              border: 'none',
              color: 'inherit',
              cursor: 'pointer',
              textAlign: 'left',
            }}
          >
            <div
              style={{
                width: 34,
                height: 34,
                borderRadius: '50%',
                background: 'linear-gradient(135deg, rgba(0,212,255,0.18), rgba(124,111,255,0.22))',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 12,
                fontWeight: 700,
                color: 'var(--text-primary)',
                border: '1px solid var(--border)',
              }}
            >
              {user.name?.[0]?.toUpperCase() || 'A'}
            </div>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 13, color: 'var(--text-primary)', fontWeight: 600, lineHeight: 1.2, wordBreak: 'break-word' }}>
                {user.name}
              </div>
              <div className="jet-mono" style={{ fontSize: 10, color: 'var(--text-dim)', wordBreak: 'break-word', marginTop: 2 }}>
                {user.email}
              </div>
            </div>
          </button>
        </div>

        <button
          onClick={logout}
          style={{
            width: '100%',
            height: 42,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 8,
            borderRadius: 12,
            border: '1px solid rgba(255,58,92,0.2)',
            background: 'rgba(255,58,92,0.08)',
            color: '#ff8fa3',
            cursor: 'pointer',
            fontSize: 13,
            fontWeight: 600,
            transition: 'all 180ms ease',
          }}
        >
          <LogOut size={15} />
          Logout
        </button>
      </div>
    </>
  );

  return (
    <div
      className="gs-shell"
      style={{
        display: 'flex',
        minHeight: '100vh',
        background: 'var(--bg-base)',
        position: 'relative',
      }}
    >
      <ThreeBackdrop />
      <div
        className="desktop-sidebar gs-sidebar"
        style={{
          width: isDesktop && desktopSidebarVisible ? 240 : 0,
          background: 'var(--bg-surface)',
          borderRight: '1px solid var(--border)',
          display: isDesktop && desktopSidebarVisible ? 'flex' : 'none',
          flexDirection: 'column',
          flexShrink: 0,
          position: 'relative',
          zIndex: 2,
        }}
      >
        {isDesktop && desktopSidebarVisible && <SidebarContent />}
      </div>

      {!isDesktop && mobileNavOpen && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 50, display: 'flex' }}>
          <div
            style={{
              width: 240,
              background: 'var(--bg-surface)',
              borderRight: '1px solid var(--border)',
              display: 'flex',
              flexDirection: 'column',
            }}
          >
            <SidebarContent />
          </div>
          <button
            onClick={() => setMobileNavOpen(false)}
            aria-label="Close navigation"
            style={{ flex: 1, border: 'none', background: 'rgba(0,0,0,0.62)' }}
          />
        </div>
      )}

      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', position: 'relative', zIndex: 2 }}>
        <header
          className="gs-topbar glass-panel"
          style={{
            height: 58,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '0 18px',
            flexShrink: 0,
            borderRadius: 0,
            borderLeft: 'none',
            borderRight: 'none',
            borderTop: 'none',
            background: 'var(--bg-glass)',
            backdropFilter: 'blur(16px)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 14, minWidth: 0 }}>
            <button
              onClick={toggleNavigation}
              style={{
                background: 'transparent',
                border: '1px solid var(--border)',
                borderRadius: 10,
                color: 'var(--text-secondary)',
                cursor: 'pointer',
                padding: 7,
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
              aria-label={isDesktop ? 'Show or hide sidebar' : 'Toggle navigation'}
            >
              {(isDesktop ? desktopSidebarVisible : mobileNavOpen) ? <X size={18} /> : <Menu size={18} />}
            </button>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {routeMeta.title}
              </div>
              <div className="jet-mono" style={{ fontSize: 11, color: 'var(--text-dim)', marginTop: 2 }}>
                {routeMeta.crumb}
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div
              className="pill"
              style={{
                color: 'var(--green)',
                background: 'rgba(0,232,135,0.1)',
                border: '1px solid rgba(0,232,135,0.22)',
              }}
            >
              <span className="pulse-dot" />
              <span className="jet-mono" style={{ fontSize: 10 }}>PIPELINE ACTIVE</span>
            </div>
            <button
              style={{
                position: 'relative',
                width: 36,
                height: 36,
                borderRadius: '50%',
                border: '1px solid var(--border)',
                background: 'var(--bg-surface)',
                color: 'var(--text-secondary)',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
              }}
              aria-label="Notifications"
            >
              <Bell size={16} />
              <span
                style={{
                  position: 'absolute',
                  top: -1,
                  right: -1,
                  width: 14,
                  height: 14,
                  borderRadius: '50%',
                  background: 'var(--red)',
                  color: '#fff',
                  fontSize: 9,
                  fontWeight: 700,
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  boxShadow: '0 0 12px rgba(255,58,92,0.28)',
                }}
              >
                3
              </span>
            </button>
            <button
              type="button"
              onClick={openAdminWorkspace}
              title={user.name}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                padding: 0,
                background: 'transparent',
                border: 'none',
                color: 'inherit',
                cursor: 'pointer',
                textAlign: 'left',
              }}
            >
              <div
                style={{
                  width: 32,
                  height: 32,
                  borderRadius: '50%',
                  background: 'linear-gradient(135deg, rgba(0,212,255,0.18), rgba(124,111,255,0.22))',
                  border: '1px solid var(--border)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: 'var(--text-primary)',
                  fontSize: 12,
                  fontWeight: 700,
                }}
              >
                {user.name?.[0]?.toUpperCase() || 'A'}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', lineHeight: 1.15, alignItems: 'flex-start' }}>
                <span style={{ fontSize: 12, color: 'var(--text-primary)', fontWeight: 600, wordBreak: 'break-word' }}>{user.name}</span>
                <span className="jet-mono" style={{ fontSize: 10, color: 'var(--text-dim)' }}>
                  Analyst / Admin
                </span>
              </div>
            </button>
          </div>
        </header>

        <main
          className="gs-content"
          style={{
            flex: 1,
            overflow: 'auto',
            padding: 22,
            position: 'relative',
          }}
        >
          <div className="gs-page-shell">
            <Outlet />
          </div>
        </main>
      </div>

      <RobotGuide userName={user.name} userEmail={user.email} />
    </div>
  );
}
