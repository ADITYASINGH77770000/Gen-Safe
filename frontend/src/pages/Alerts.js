import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AlertTriangle, ArrowRight, Clock } from 'lucide-react';
import { alertApi } from '../services/api';

const RISK_COLORS = { critical: 'var(--red)', high: 'var(--amber)', medium: 'var(--violet)', low: 'var(--green)', unknown: 'var(--text-secondary)' };

const FILTERS = [
  { key: '', label: 'ALL' },
  { key: 'open', label: 'OPEN' },
  { key: 'resolved', label: 'RESOLVED' },
  { key: 'false_positive', label: 'FALSE POSITIVE' },
];

function relativeTime(value) {
  if (!value) return 'n/a';
  const diff = Date.now() - new Date(value).getTime();
  const mins = Math.max(1, Math.floor(diff / 60000));
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

function RiskPill({ level }) {
  const color = RISK_COLORS[level] || RISK_COLORS.unknown;
  return (
    <span className="pill" style={{ background: `${color}18`, color, border: `1px solid ${color}40` }}>
      {level || 'unknown'}
    </span>
  );
}

function StatusPill({ status }) {
  const map = {
    open: { bg: 'rgba(0,212,255,0.08)', fg: 'var(--cyan)', border: 'rgba(0,212,255,0.18)' },
    resolved: { bg: 'rgba(0,232,135,0.08)', fg: 'var(--green)', border: 'rgba(0,232,135,0.18)' },
    false_positive: { bg: 'rgba(255,184,0,0.08)', fg: 'var(--amber)', border: 'rgba(255,184,0,0.18)' },
  };
  const tone = map[status] || { bg: 'rgba(255,255,255,0.04)', fg: 'var(--text-secondary)', border: 'var(--border)' };
  return (
    <span className="pill" style={{ background: tone.bg, color: tone.fg, border: `1px solid ${tone.border}` }}>
      {String(status || 'open').replace('_', ' ')}
    </span>
  );
}

export default function Alerts() {
  const [alerts, setAlerts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('');
  const navigate = useNavigate();

  const load = (status = '') => {
    setLoading(true);
    alertApi
      .list({ status: status || undefined, limit: 100 })
      .then((r) => setAlerts(r.data.alerts || []))
      .catch(console.error)
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
  }, []);

  const openCount = useMemo(() => alerts.filter((item) => item.status === 'open').length, [alerts]);

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 20, gap: 16, flexWrap: 'wrap' }}>
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 800, color: 'var(--text-primary)' }}>ALERT QUEUE</h1>
          <div className="jet-mono" style={{ fontSize: 11, color: 'var(--text-dim)', marginTop: 8 }}>
            {alerts.length} total alerts
          </div>
        </div>
        <div
          className="pill"
          style={{
            background: 'rgba(255,58,92,0.12)',
            color: 'var(--red)',
            border: '1px solid rgba(255,58,92,0.24)',
          }}
        >
          {openCount} OPEN
        </div>
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 16 }}>
        {FILTERS.map((item) => {
          const active = filter === item.key;
          return (
            <button
              key={item.key || 'all'}
              onClick={() => {
                setFilter(item.key);
                load(item.key);
              }}
              style={{
                height: 34,
                padding: '0 14px',
                borderRadius: 999,
                border: active ? '1px solid var(--cyan)' : '1px solid var(--border)',
                background: active ? 'var(--cyan)' : 'var(--bg-surface)',
                color: active ? 'var(--bg-deep)' : 'var(--text-secondary)',
                cursor: 'pointer',
                fontSize: 12,
                fontWeight: 600,
                letterSpacing: 0.4,
                transition: 'all 160ms ease',
              }}
            >
              {item.label}
            </button>
          );
        })}
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {loading ? (
          <div className="panel" style={{ padding: 30, textAlign: 'center', color: 'var(--text-dim)' }}>
            Loading alerts...
          </div>
        ) : alerts.length === 0 ? (
          <div className="panel" style={{ padding: 30, textAlign: 'center', color: 'var(--text-dim)' }}>
            No alerts found. Submit invoices via the Invoices page to see AI detection results.
          </div>
        ) : (
          alerts.map((alert) => {
            const color = RISK_COLORS[alert.risk_level] || RISK_COLORS.unknown;
            const score = Math.round(alert.risk_score || 0);
            const critical = (alert.risk_level || '').toLowerCase() === 'critical';
            return (
              <div
                key={alert.alert_id}
                onClick={() => navigate(`/alerts/${alert.alert_id}`)}
                className="panel panel-hover"
                style={{
                  padding: 18,
                  borderLeft: `3px solid ${color}`,
                  cursor: 'pointer',
                  position: 'relative',
                  overflow: 'hidden',
                  boxShadow: critical ? `0 0 0 1px rgba(255,58,92,0.22), 0 0 24px rgba(255,58,92,0.12)` : undefined,
                }}
              >
                <div style={{ display: 'grid', gridTemplateColumns: '56px 1.8fr 1fr auto', gap: 16, alignItems: 'center' }}>
                  <div
                    style={{
                      width: 46,
                      height: 46,
                      borderRadius: '50%',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      background: `radial-gradient(circle, ${color}33, ${color}08 72%)`,
                      border: `1px solid ${color}40`,
                      color,
                      fontFamily: 'JetBrains Mono, monospace',
                      fontWeight: 700,
                      fontSize: 18,
                    }}
                  >
                    {score}
                  </div>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 15, color: 'var(--text-primary)', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {alert.supplier_name || 'Unknown Supplier'}
                    </div>
                    <div className="jet-mono" style={{ fontSize: 11, color: 'var(--text-dim)', marginTop: 6 }}>
                      {alert.invoice_number} - {alert.created_at?.slice(0, 10)} - {relativeTime(alert.created_at)}
                    </div>
                  </div>
                  <div style={{ justifySelf: 'end', textAlign: 'right' }}>
                    <div className="jet-mono" style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-primary)' }}>
                      {Number(alert.amount || 0).toLocaleString()} {alert.currency}
                    </div>
                    <div className="jet-mono" style={{ fontSize: 11, color: 'var(--text-dim)', marginTop: 4 }}>
                      Traceable risk record
                    </div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6 }}>
                      <RiskPill level={alert.risk_level} />
                      <StatusPill status={alert.status} />
                    </div>
                    <ArrowRight size={16} color="var(--cyan)" />
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
