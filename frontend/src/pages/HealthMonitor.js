import React, { useCallback, useEffect, useState } from 'react';
import { Activity, AlertTriangle, CheckCircle, Clock, RefreshCw, Shield, Zap } from 'lucide-react';
import { healthApi, selfCorrectApi } from '../services/api';

const SEVERITY = { critical: 'var(--red)', high: 'var(--amber)', medium: 'var(--violet)', low: 'var(--green)' };

function StatCard({ icon: Icon, label, value, color = 'var(--violet)', sub }) {
  return (
    <div className="panel panel-hover" style={{ padding: 18 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
        <div>
          <div className="jet-mono" style={{ fontSize: 10, color: 'var(--text-dim)', letterSpacing: 1.4, textTransform: 'uppercase', marginBottom: 8 }}>{label}</div>
          <div className="jet-mono" style={{ fontSize: 28, fontWeight: 700, color: 'var(--text-primary)' }}>{value}</div>
          {sub && <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 6 }}>{sub}</div>}
        </div>
        <div style={{ width: 38, height: 38, borderRadius: 12, background: `${color}18`, color, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Icon size={17} />
        </div>
      </div>
    </div>
  );
}

export default function HealthMonitor() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [lastChecked, setLastChecked] = useState(null);
  const [autoRefresh, setAutoRefresh] = useState(false);
  const [supplierId, setSupplierId] = useState('');
  const [baselineStatus, setBaselineStatus] = useState('');
  const [baselineBusy, setBaselineBusy] = useState(false);

  const runCheck = useCallback(async () => {
    setLoading(true);
    try {
      const [healthRes, statsRes] = await Promise.all([healthApi.check(), healthApi.stats()]);
      setData({ ...(healthRes.data || {}), stats: statsRes.data || healthRes.data?.stats || {} });
      setLastChecked(new Date().toLocaleTimeString());
    } catch (error) {
      console.error(error);
    } finally {
      setLoading(false);
    }
  }, []);

  const recomputeBaselines = async () => {
    setBaselineBusy(true);
    setBaselineStatus('');
    try {
      const res = await selfCorrectApi.computeBaselines(supplierId.trim() || undefined);
      const count = res.data?.suppliers_updated ?? 0;
      const total = res.data?.total_suppliers ?? 0;
      setBaselineStatus(`Recomputed baselines for ${count} supplier${count === 1 ? '' : 's'}${total ? ` out of ${total}` : ''}.`);
    } catch (error) {
      setBaselineStatus(error.response?.data?.detail || 'Baseline recompute failed.');
    } finally {
      setBaselineBusy(false);
    }
  };

  useEffect(() => {
    runCheck();
  }, [runCheck]);

  useEffect(() => {
    if (!autoRefresh) return undefined;
    const timer = setInterval(runCheck, 30000);
    return () => clearInterval(timer);
  }, [autoRefresh, runCheck]);

  const issues = data?.issues || [];
  const escalations = data?.escalations || [];
  const stats = data?.stats || {};
  const healthy = stats.health_status === 'healthy';
  const statusColor = healthy ? 'var(--green)' : stats.health_status === 'critical' ? 'var(--red)' : 'var(--amber)';

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', gap: 16, marginBottom: 22, flexWrap: 'wrap' }}>
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 800, color: 'var(--text-primary)' }}>HEALTH MONITOR</h1>
          <div className="jet-mono" style={{ fontSize: 11, color: 'var(--text-dim)', marginTop: 8 }}>
            Real-time pipeline health, SLA timers, and auto-escalation
            {lastChecked && <span style={{ marginLeft: 12 }}>Last checked: {lastChecked}</span>}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <label className="pill" style={{ background: 'var(--bg-surface)', color: 'var(--text-secondary)', border: '1px solid var(--border)', cursor: 'pointer' }}>
            <input type="checkbox" checked={autoRefresh} onChange={(e) => setAutoRefresh(e.target.checked)} />
            Auto-refresh (30s)
          </label>
          <button
            onClick={runCheck}
            disabled={loading}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              padding: '8px 14px',
              background: 'var(--bg-surface)',
              border: '1px solid var(--border)',
              borderRadius: 10,
              color: 'var(--text-secondary)',
              cursor: 'pointer',
              fontSize: 12,
            }}
          >
            <RefreshCw size={13} style={{ animation: loading ? 'spin 1s linear infinite' : 'none' }} />
            Refresh
          </button>
        </div>
      </div>

      <div className="panel" style={{ marginBottom: 20, borderLeft: `3px solid ${statusColor}`, background: healthy ? 'rgba(0,232,135,0.05)' : 'rgba(255,58,92,0.05)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          {healthy ? <CheckCircle size={22} color="var(--green)" /> : <AlertTriangle size={22} color="var(--red)" />}
          <div>
            <p style={{ fontSize: 16, fontWeight: 800, color: statusColor }}>
              {healthy ? 'ALL SYSTEMS OPERATIONAL' : `${issues.length} ISSUE${issues.length !== 1 ? 'S' : ''} DETECTED`}
            </p>
            <p style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 2 }}>
              {healthy ? 'Pipeline checks are within threshold' : 'Health monitor has detected pipeline anomalies'}
            </p>
          </div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12, marginBottom: 20 }}>
        <StatCard icon={Shield} label="Total Invoices" value={stats.total_invoices ?? '—'} color="var(--violet)" />
        <StatCard icon={Clock} label="Pending" value={stats.pending_invoices ?? '—'} color="var(--amber)" sub="Awaiting analysis" />
        <StatCard icon={Zap} label="Active Jobs" value={stats.active_jobs ?? '—'} color="var(--cyan)" sub="In pipeline now" />
        <StatCard icon={AlertTriangle} label="Open Alerts" value={stats.open_alerts ?? '—'} color="var(--red)" sub="Needs analyst attention" />
        <StatCard icon={Activity} label="Avg Latency" value={stats.avg_agent_latency_ms ? `${stats.avg_agent_latency_ms}ms` : '—'} color="var(--green)" sub="Agent response (1h)" />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        <div className="panel" style={{ padding: 20 }}>
          <h3 style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 14, display: 'flex', alignItems: 'center', gap: 8 }}>
            <AlertTriangle size={15} color="var(--amber)" /> Pipeline Issues ({issues.length})
          </h3>
          {issues.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '30px 0', color: 'var(--green)', fontSize: 13 }}>
              <CheckCircle size={24} style={{ marginBottom: 8, display: 'block', margin: '0 auto 8px' }} />
              No issues detected
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {issues.map((issue, i) => (
                <div key={i} className="panel" style={{ padding: '12px 14px', borderLeft: `3px solid ${SEVERITY[issue.severity] || 'var(--text-secondary)'}` }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4, gap: 10, flexWrap: 'wrap' }}>
                    <span className="jet-mono" style={{ fontSize: 11, fontWeight: 700, color: SEVERITY[issue.severity] || 'var(--text-secondary)', textTransform: 'uppercase' }}>
                      {issue.type?.replace(/_/g, ' ')}
                    </span>
                    <span className="jet-mono" style={{ fontSize: 10, color: SEVERITY[issue.severity] || 'var(--text-secondary)', textTransform: 'uppercase' }}>
                      {issue.severity}
                    </span>
                  </div>
                  <p style={{ fontSize: 13, color: 'var(--text-primary)', lineHeight: 1.6 }}>{issue.message}</p>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="panel" style={{ padding: 20 }}>
          <h3 style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 14, display: 'flex', alignItems: 'center', gap: 8 }}>
            <Zap size={15} color="var(--red)" /> Active Escalations ({escalations.length})
          </h3>
          {escalations.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '30px 0', color: 'var(--green)', fontSize: 13 }}>
              <CheckCircle size={24} style={{ marginBottom: 8, display: 'block', margin: '0 auto 8px' }} />
              No active escalations
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {escalations.map((esc, i) => (
                <div key={i} className="panel" style={{ padding: '12px 14px', background: 'rgba(255,58,92,0.05)', borderLeft: '3px solid var(--red)' }}>
                  <p className="jet-mono" style={{ fontSize: 11, fontWeight: 700, color: 'var(--red)', marginBottom: 4, textTransform: 'uppercase' }}>
                    {esc.type?.replace(/_/g, ' ')}
                  </p>
                  <p style={{ fontSize: 13, color: 'var(--text-primary)', lineHeight: 1.6 }}>{esc.message}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="panel" style={{ marginTop: 16, padding: 20 }}>
        <h3 style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 12 }}>SLA THRESHOLDS</h3>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 10 }}>
          {[
            ['Invoice analysis SLA', '10 minutes', 'Auto-fail if exceeded'],
            ['Critical alert response', '5 minutes', 'Escalation triggered'],
            ['Task due date', '24h overdue', 'Manager escalation'],
            ['Stuck job detection', '5 minutes', 'Auto-failed and flagged'],
          ].map(([label, threshold, action]) => (
            <div key={label} className="panel" style={{ padding: '10px 14px' }}>
              <p style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 4 }}>{label}</p>
              <p className="jet-mono" style={{ fontSize: 13, color: 'var(--violet)', fontWeight: 700, marginBottom: 2 }}>{threshold}</p>
              <p style={{ fontSize: 11, color: 'var(--text-secondary)' }}>{action}</p>
            </div>
          ))}
        </div>
      </div>

      <div className="panel" style={{ marginTop: 16, padding: 20 }}>
        <h3 style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 10, display: 'flex', alignItems: 'center', gap: 8 }}>
          <Shield size={15} color="var(--cyan)" /> SELF-CORRECTION
        </h3>
        <p style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 12 }}>
          Recompute supplier baselines after feedback or run a full refresh across all tracked suppliers.
        </p>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
          <input
            value={supplierId}
            onChange={(e) => setSupplierId(e.target.value)}
            placeholder="Optional supplier ID"
            style={{
              flex: '1 1 280px',
              minWidth: 260,
              background: 'var(--bg-elevated)',
              border: '1px solid var(--border)',
              borderRadius: 10,
              padding: '10px 12px',
              color: 'var(--text-primary)',
              fontSize: 13,
              outline: 'none',
            }}
          />
          <button
            onClick={recomputeBaselines}
            disabled={baselineBusy}
            style={{
              padding: '10px 14px',
              background: 'rgba(0,212,255,0.08)',
              border: '1px solid rgba(0,212,255,0.22)',
              borderRadius: 10,
              color: 'var(--cyan)',
              cursor: 'pointer',
              fontSize: 12,
              fontWeight: 700,
            }}
          >
            {baselineBusy ? 'RECOMPUTING...' : 'RECOMPUTE BASELINES'}
          </button>
        </div>
        {baselineStatus && (
          <div style={{ marginTop: 10, fontSize: 12, color: baselineStatus.includes('failed') ? 'var(--red)' : 'var(--green)' }}>
            {baselineStatus}
          </div>
        )}
      </div>
    </div>
  );
}
