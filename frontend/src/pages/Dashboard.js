import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowUpRight,
  CheckCircle,
  Clock,
  DollarSign,
  Shield,
  TrendingUp,
} from 'lucide-react';
import {
  BarChart,
  Bar,
  Cell,
  PieChart,
  Pie,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  CartesianGrid,
} from 'recharts';
import { dashboardApi, opsApi } from '../services/api';
import { useNavigate } from 'react-router-dom';

const RISK_COLORS = {
  critical: '#ff3a5c',
  high: '#ffb800',
  medium: '#7c6fff',
  low: '#00e887',
};

const CHART_TIP = {
  background: 'var(--bg-elevated)',
  border: '1px solid var(--border-active)',
  borderRadius: 10,
  color: 'var(--text-primary)',
  fontSize: 12,
  fontFamily: 'JetBrains Mono, monospace',
};

function formatTime() {
  return new Intl.DateTimeFormat('en-US', {
    dateStyle: 'medium',
    timeStyle: 'medium',
  }).format(new Date());
}

function useAnimatedValue(value, duration = 800) {
  const [shown, setShown] = useState(0);
  useEffect(() => {
    const start = performance.now();
    let raf = 0;
    const step = (now) => {
      const progress = Math.min(1, (now - start) / duration);
      setShown(Math.round(Number(value || 0) * progress));
      if (progress < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [duration, value]);
  return shown;
}

function StatCard({ icon: Icon, label, value, sub, color = '#a78bfa', warning = false }) {
  const animated = useAnimatedValue(value);
  return (
    <div className="panel panel-hover" style={{ padding: 20, borderLeft: warning ? '3px solid var(--red)' : `3px solid ${color}` }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
        <div style={{ minWidth: 0 }}>
          <div className="jet-mono" style={{ fontSize: 10, letterSpacing: 1.6, color: 'var(--text-dim)', textTransform: 'uppercase', marginBottom: 8 }}>
            {label}
          </div>
          <div
            className="countup"
            style={{
              fontSize: 36,
              fontWeight: 700,
              color: warning ? 'var(--red)' : 'var(--text-primary)',
              textShadow: warning ? '0 0 18px rgba(255,58,92,0.18)' : 'none',
              lineHeight: 1,
            }}
          >
            {typeof value === 'string' ? value : animated}
          </div>
          {sub && <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 8 }}>{sub}</div>}
        </div>
        <div
          style={{
            width: 40,
            height: 40,
            borderRadius: 12,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: `${color}18`,
            color,
            boxShadow: `0 0 20px ${color}18`,
          }}
        >
          <Icon size={18} />
        </div>
      </div>
    </div>
  );
}

function RiskBadge({ level }) {
  const color = RISK_COLORS[level] || 'var(--text-secondary)';
  return (
    <span
      className="pill"
      style={{
        background: `${color}18`,
        color,
        border: `1px solid ${color}40`,
        textTransform: 'uppercase',
      }}
    >
      {level || 'unknown'}
    </span>
  );
}

function relativeTime(value) {
  if (!value) return 'n/a';
  const date = new Date(value);
  const diff = Date.now() - date.getTime();
  const mins = Math.max(1, Math.floor(diff / 60000));
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

export default function Dashboard() {
  const [data, setData] = useState(null);
  const [health, setHealth] = useState(null);
  const [loading, setLoading] = useState(true);
  const [now, setNow] = useState(formatTime());
  const navigate = useNavigate();

  useEffect(() => {
    const timer = setInterval(() => setNow(formatTime()), 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    Promise.all([dashboardApi.summary(), opsApi.health()])
      .then(([summaryRes, healthRes]) => {
        setData(summaryRes.data);
        setHealth(healthRes.data);
      })
      .catch(async () => {
        try {
          const fallback = await dashboardApi.summary();
          setData(fallback.data);
        } catch (error) {
          console.error(error);
        }
      })
      .finally(() => setLoading(false));
  }, []);

  const riskPie = useMemo(() => Object.entries(data?.risk_breakdown || {}).map(([name, value]) => ({ name, value })), [data]);
  const trend = useMemo(
    () => (data?.weekly_trend || []).map((row) => ({ day: row.day?.slice(5) || '', invoices: row.invoices, flagged: row.flagged || 0 })),
    [data]
  );
  const healthStatus = health?.status || 'unknown';
  const healthTone = healthStatus === 'critical' ? 'var(--red)' : healthStatus === 'warning' ? 'var(--amber)' : 'var(--green)';

  if (loading) return <div style={{ color: 'var(--text-secondary)', textAlign: 'center', padding: 60, fontSize: 14 }}>Loading mission control...</div>;
  if (!data) return <div style={{ color: 'var(--red)', textAlign: 'center', padding: 60 }}>Failed to load. Is the backend running?</div>;

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 24, gap: 16, flexWrap: 'wrap' }}>
        <div>
          <h1 style={{ fontSize: 26, fontWeight: 800, color: 'var(--text-primary)', letterSpacing: 0.4 }}>MISSION CONTROL</h1>
          <div className="jet-mono" style={{ fontSize: 12, color: 'var(--text-dim)', marginTop: 8 }}>
            {now}
          </div>
        </div>
        <div
          className="pill"
          style={{
            background: 'rgba(0,232,135,0.1)',
            color: 'var(--green)',
            border: '1px solid rgba(0,232,135,0.22)',
          }}
        >
          <span className="pulse-dot" />
          PIPELINE: LIVE
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: 14, marginBottom: 24 }}>
        <StatCard icon={FileTextIcon} label="Total Invoices" value={data.total_invoices || 0} sub="All-time processed" color="var(--violet)" />
        <StatCard icon={AlertTriangle} label="Open Alerts" value={data.open_alerts || 0} sub="Needs analyst review" color="var(--red)" warning={(data.open_alerts || 0) > 0} />
        <StatCard icon={DollarSign} label="Value Protected" value={Math.round(data.value_protected || 0)} sub="Blocked payments" color="var(--green)" />
        <StatCard icon={TrendingUp} label="Autonomy Rate" value={data.autonomous_rate || 85} sub="Tasks handled by agents" color="var(--cyan)" />
        <StatCard icon={Shield} label="False Positive Rate" value={data.false_positive_rate || 0} sub="Last 30 days" color="var(--amber)" />
        {health && (
          <StatCard
            icon={healthStatus === 'critical' ? AlertTriangle : healthStatus === 'warning' ? Clock : CheckCircle}
            label="Pipeline Health"
            value={String(healthStatus).toUpperCase()}
            sub={`Queue ${health.metrics?.queue_depth ?? 0} - Failed24h ${health.metrics?.failed_jobs_last_24h ?? 0}`}
            color={healthTone}
          />
        )}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 0.9fr', gap: 16, marginBottom: 24 }}>
        <div className="panel" style={{ padding: 20 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <h3 style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)' }}>INVOICE VOLUME</h3>
            <div className="jet-mono" style={{ fontSize: 11, color: 'var(--text-dim)' }}>Last 7 days</div>
          </div>
          {trend.length > 0 ? (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={trend}>
                <CartesianGrid vertical={false} stroke="var(--border)" strokeDasharray="3 3" />
                <XAxis dataKey="day" tick={{ fill: 'var(--text-dim)', fontSize: 11 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fill: 'var(--text-dim)', fontSize: 11 }} axisLine={false} tickLine={false} />
                <Tooltip contentStyle={CHART_TIP} />
                <Bar dataKey="invoices" fill="rgba(124,111,255,0.72)" radius={[4, 4, 0, 0]} name="Total" isAnimationActive />
                <Bar dataKey="flagged" fill="rgba(255,58,92,0.85)" radius={[4, 4, 0, 0]} name="Flagged" isAnimationActive />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div style={{ height: 220, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-dim)', fontSize: 13 }}>
              Submit invoices to see trend data
            </div>
          )}
        </div>

        <div className="panel" style={{ padding: 20 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <h3 style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)' }}>RISK DISTRIBUTION</h3>
            <div className="jet-mono" style={{ fontSize: 11, color: 'var(--text-dim)' }}>Alerts by severity</div>
          </div>
          {riskPie.length > 0 ? (
            <ResponsiveContainer width="100%" height={220}>
              <PieChart>
                <Pie data={riskPie} dataKey="value" nameKey="name" cx="50%" cy="48%" innerRadius={55} outerRadius={92} isAnimationActive>
                  {riskPie.map((entry) => (
                    <Cell key={entry.name} fill={RISK_COLORS[entry.name] || 'var(--text-secondary)'} />
                  ))}
                </Pie>
                <Tooltip contentStyle={CHART_TIP} />
              </PieChart>
            </ResponsiveContainer>
          ) : (
            <div style={{ height: 220, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-dim)', fontSize: 13 }}>
              No risk data yet
            </div>
          )}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, marginTop: 6 }}>
            {Object.keys(RISK_COLORS).map((key) => (
              <div key={key} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 11, color: 'var(--text-secondary)' }}>
                <span style={{ width: 8, height: 8, borderRadius: 2, background: RISK_COLORS[key] }} />
                <span style={{ textTransform: 'uppercase', letterSpacing: 0.8 }}>{key}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="panel" style={{ padding: 20 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <h3 style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)' }}>RECENT ALERTS</h3>
            <span className="pulse-dot" />
          </div>
          <button onClick={() => navigate('/alerts')} style={{ fontSize: 12, color: 'var(--cyan)', background: 'none', border: 'none', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
            View all <ArrowUpRight size={14} />
          </button>
        </div>
        {(data.recent_alerts || []).length === 0 ? (
          <div style={{ textAlign: 'center', padding: 32, color: 'var(--text-dim)', fontSize: 13 }}>No alerts yet. Submit an invoice to see results.</div>
        ) : (
          <div style={{ overflow: 'hidden', borderRadius: 14, border: '1px solid var(--border)' }}>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: '90px 1.6fr 1.1fr 120px 110px 110px',
                gap: 10,
                padding: '12px 16px',
                background: 'rgba(0,212,255,0.04)',
                color: 'var(--text-dim)',
                fontSize: 10,
                letterSpacing: 1.4,
                textTransform: 'uppercase',
              }}
            >
              <div>Risk</div>
              <div>Invoice</div>
              <div>Supplier</div>
              <div style={{ textAlign: 'right' }}>Amount</div>
              <div>Time</div>
              <div>Status</div>
            </div>
            {data.recent_alerts.map((row, index) => (
              <div
                key={row.alert_id}
                onClick={() => navigate(`/alerts/${row.alert_id}`)}
                style={{
                  display: 'grid',
                  gridTemplateColumns: '90px 1.6fr 1.1fr 120px 110px 110px',
                  gap: 10,
                  alignItems: 'center',
                  padding: '14px 16px',
                  background: index % 2 === 0 ? 'var(--bg-surface)' : 'var(--bg-deep)',
                  borderTop: '1px solid var(--border)',
                  cursor: 'pointer',
                  transition: 'background 120ms ease',
                }}
                onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--bg-elevated)'; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = index % 2 === 0 ? 'var(--bg-surface)' : 'var(--bg-deep)'; }}
              >
                <div>
                  <RiskBadge level={row.risk_level || 'low'} />
                </div>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 13, color: 'var(--text-primary)', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {row.invoice_number}
                  </div>
                  <div className="jet-mono" style={{ fontSize: 11, color: 'var(--text-dim)' }}>
                    {row.alert_id?.slice(0, 12)}...
                  </div>
                </div>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 13, color: 'var(--text-primary)', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {row.supplier_name || 'Unknown Supplier'}
                  </div>
                  <div className="jet-mono" style={{ fontSize: 11, color: 'var(--text-dim)' }}>
                    {relativeTime(row.created_at)}
                  </div>
                </div>
                <div className="jet-mono" style={{ textAlign: 'right', fontSize: 13, color: 'var(--text-primary)', fontWeight: 600 }}>
                  {Number(row.amount || 0).toLocaleString()} {row.currency}
                </div>
                <div className="jet-mono" style={{ fontSize: 11, color: 'var(--text-dim)' }}>
                  {relativeTime(row.created_at)}
                </div>
                <div className="pill" style={{ justifySelf: 'start', background: 'rgba(0,212,255,0.06)', border: '1px solid var(--border)', color: 'var(--text-secondary)' }}>
                  {String(row.status || 'open').replace('_', ' ')}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function FileTextIcon({ size, color }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
    </svg>
  );
}
