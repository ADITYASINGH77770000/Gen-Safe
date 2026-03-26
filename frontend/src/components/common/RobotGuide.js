import React, { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Bot, ChevronRight, Minimize2, Sparkles, Volume2 } from 'lucide-react';
import './robot-guide.css';

const FEATURES = [
  {
    key: 'dashboard',
    path: '/',
    label: 'Dashboard',
    title: 'Mission Control',
    help: 'See open alerts, fraud trends, and current pipeline health in one place.',
    nextPath: '/invoices',
    nextLabel: 'Open Invoices',
  },
  {
    key: 'invoices',
    path: '/invoices',
    label: 'Invoices',
    title: 'Invoice Intelligence',
    help: 'Upload invoice files to trigger OCR, risk analysis, and autonomous decisioning.',
    nextPath: '/alerts',
    nextLabel: 'Review Alerts',
  },
  {
    key: 'alerts',
    path: '/alerts',
    label: 'Alerts',
    title: 'Alert Resolution',
    help: 'Open each alert, inspect evidence, and resolve as true positive or false positive.',
    nextPath: '/audit',
    nextLabel: 'Open Audit Trail',
  },
  {
    key: 'suppliers',
    path: '/suppliers',
    label: 'Suppliers',
    title: 'Supplier Risk Profile',
    help: 'Track supplier history, baseline behavior, and suspicious account changes.',
    nextPath: '/tasks',
    nextLabel: 'Go to Tasks',
  },
  {
    key: 'tasks',
    path: '/tasks',
    label: 'Tasks',
    title: 'Meeting Intelligence',
    help: 'Paste meeting transcripts and auto-generate action items with owners and priorities.',
    nextPath: '/dashboard',
    nextLabel: 'Back to Dashboard',
  },
  {
    key: 'audit',
    path: '/audit',
    label: 'Audit',
    title: 'Decision Traceability',
    help: 'Validate every agent decision by trace ID with timing and evidence snapshots.',
    nextPath: '/ops-center',
    nextLabel: 'Open Ops Center',
  },
  {
    key: 'ops-center',
    path: '/ops-center',
    label: 'Ops Center',
    title: 'Operations Hub',
    help: 'Manage integrations, audit integrity, security posture, webhook simulations, and escalation controls.',
    nextPath: '/invoices',
    nextLabel: 'Back to Invoices',
  },
];

function prettyName(name, email) {
  const raw = (name || '').trim();
  if (raw && raw.toLowerCase() !== 'admin') return raw;
  const local = String(email || 'admin').split('@')[0] || 'admin';
  return local
    .split(/[._-]/g)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function findFeature(pathname) {
  if (pathname === '/') return FEATURES[0];
  return FEATURES.find((f) => pathname.startsWith(f.path)) || FEATURES[0];
}

export default function RobotGuide({ userName, userEmail }) {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const [open, setOpen] = useState(true);
  const [announcement, setAnnouncement] = useState('');

  const person = useMemo(() => prettyName(userName, userEmail), [userName, userEmail]);
  const feature = useMemo(() => findFeature(pathname), [pathname]);

  useEffect(() => {
    const sessionKey = `robot_welcome_${person}`;
    const seen = sessionStorage.getItem(sessionKey);
    const forceWelcome = sessionStorage.getItem('robot_force_welcome') === '1';
    if (!seen || forceWelcome) {
      setOpen(true);
      setAnnouncement(`Hi ${person}, welcome to GenSafe. I will guide you through each feature as you navigate.`);
      sessionStorage.setItem(sessionKey, '1');
      sessionStorage.removeItem('robot_force_welcome');
      return;
    }
    setAnnouncement(`You are in ${feature.label}. ${feature.help}`);
  }, [person, feature]);

  useEffect(() => {
    setOpen(true);
  }, [pathname]);

  const goFeature = (path) => {
    if (path !== pathname) navigate(path);
  };

  return (
    <div className={`robot-guide ${open ? 'open' : 'closed'}`}>
      {open && (
        <div className="robot-card">
          <div className="robot-card-head">
            <div className="robot-card-title">
              <Sparkles size={14} />
              <span>AI Guide Active</span>
            </div>
            <button
              className="robot-icon-btn"
              onClick={() => setOpen(false)}
              title="Minimize assistant"
            >
              <Minimize2 size={14} />
            </button>
          </div>

          <p className="robot-headline">{feature.title}</p>
          <p className="robot-help">{feature.help}</p>

          <div className="robot-announce">
            <Volume2 size={13} />
            <span>{announcement}</span>
          </div>

          <div className="robot-features">
            {FEATURES.map((item) => (
              <button
                key={item.key}
                className={`robot-chip ${pathname === item.path || (item.path !== '/' && pathname.startsWith(item.path)) ? 'active' : ''}`}
                onClick={() => goFeature(item.path)}
              >
                {item.label}
              </button>
            ))}
          </div>

          <button className="robot-action" onClick={() => navigate(feature.nextPath)}>
            {feature.nextLabel}
            <ChevronRight size={14} />
          </button>
        </div>
      )}

      <button
        className="robot-stage"
        onClick={() => setOpen((v) => !v)}
        title="Open AI assistant guide"
      >
        <div className="robot-glow" />
        <div className="robot-figure">
          <div className="robot-halo" />
          <div className="robot-head">
            <div className="robot-face-texture" />
            <div className="robot-eye left" />
            <div className="robot-eye right" />
          </div>
          <div className="robot-neck" />
          <div className="robot-chest">
            <div className="robot-core" />
          </div>
          <div className="robot-arms">
            <span />
            <span />
          </div>
        </div>
        {!open && (
          <div className="robot-badge">
            <Bot size={12} />
            <span>Guide</span>
          </div>
        )}
      </button>
    </div>
  );
}
