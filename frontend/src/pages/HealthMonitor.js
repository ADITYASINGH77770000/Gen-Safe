import React, { useCallback, useEffect, useState } from 'react';
import { Activity, AlertTriangle, CheckCircle, Clock, RefreshCw, Shield, Zap } from 'lucide-react';
import { healthApi, selfCorrectApi } from '../services/api';

const card = { background: '#12121a', border: '1px solid #1e1e2e', borderRadius: 12, padding: 20 };
const SEVERITY = { critical: '#ef4444', high: '#f97316', medium: '#eab308', low: '#22c55e' };

function StatCard({ icon: Icon, label, value, color = '#a78bfa', sub }) {
  return (
    <div style={card}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <p style={{ fontSize: 12, color: '#6b7280', marginBottom: 6 }}>{label}</p>
          <p style={{ fontSize: 26, fontWeight: 700, color: '#e2e8f0' }}>{value}</p>
          {sub && <p style={{ fontSize: 11, color: '#6b7280', marginTop: 4 }}>{sub}</p>}
        </div>
        <div style={{ width: 38, height: 38, borderRadius: 10, background: `${color}20`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Icon size={17} color={color} />
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
      const merged = {
        ...(healthRes.data || {}),
        stats: statsRes.data || healthRes.data?.stats || {},
      };
      setData(merged);
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
    if (!autoRefresh) return;
    const timer = setInterval(runCheck, 30000);
    return () => clearInterval(timer);
  }, [autoRefresh, runCheck]);

  const issues = data?.issues || [];
  const escalations = data?.escalations || [];
  const stats = data?.stats || {};
  const healthy = stats.health_status === 'healthy';

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: '#e2e8f0', display: 'flex', alignItems: 'center', gap: 10 }}>
            <Activity size={20} color="#a78bfa" />
            Workflow Health Monitor
          </h1>
          <p style={{ fontSize: 13, color: '#6b7280', marginTop: 4 }}>
            Real-time pipeline health, SLA timers, and auto-escalation
            {lastChecked && <span style={{ marginLeft: 12, color: '#4b5563' }}>Last checked: {lastChecked}</span>}
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#9ca3af', cursor: 'pointer' }}>
            <input type="checkbox" checked={autoRefresh} onChange={(e) => setAutoRefresh(e.target.checked)} />
            Auto-refresh (30s)
          </label>
          <button
            onClick={runCheck}
            disabled={loading}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              padding: '7px 14px',
              background: '#1a1a2e',
              border: '1px solid #2d2d44',
              borderRadius: 8,
              color: '#9ca3af',
              cursor: 'pointer',
              fontSize: 12,
            }}
          >
            <RefreshCw size={13} style={{ animation: loading ? 'spin 1s linear infinite' : 'none' }} />
            Refresh
          </button>
        </div>
      </div>

      <div
        style={{
          ...card,
          marginBottom: 20,
          borderColor: healthy ? '#14532d' : '#7f1d1d',
          background: healthy ? 'rgba(20,83,45,0.1)' : 'rgba(127,29,29,0.1)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          {healthy ? <CheckCircle size={22} color="#22c55e" /> : <AlertTriangle size={22} color="#ef4444" />}
          <div>
            <p style={{ fontSize: 16, fontWeight: 700, color: healthy ? '#22c55e' : '#ef4444' }}>
              {healthy ? 'All Systems Operational' : `${issues.length} Issue${issues.length !== 1 ? 's' : ''} Detected`}
            </p>
            <p style={{ fontSize: 12, color: '#6b7280', marginTop: 2 }}>
              {healthy ? 'Pipeline checks are within threshold' : 'Health monitor has detected pipeline anomalies'}
            </p>
          </div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12, marginBottom: 20 }}>
        <StatCard icon={Shield} label="Total Invoices" value={stats.total_invoices ?? '—'} color="#a78bfa" />
        <StatCard icon={Clock} label="Pending" value={stats.pending_invoices ?? '—'} color="#eab308" sub="Awaiting analysis" />
        <StatCard icon={Zap} label="Active Jobs" value={stats.active_jobs ?? '—'} color="#38bdf8" sub="In pipeline now" />
        <StatCard icon={AlertTriangle} label="Open Alerts" value={stats.open_alerts ?? '—'} color="#f97316" sub="Needs analyst attention" />
        <StatCard icon={Activity} label="Avg Latency" value={stats.avg_agent_latency_ms ? `${stats.avg_agent_latency_ms}ms` : '—'} color="#22c55e" sub="Agent response (1h)" />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        <div style={card}>
          <h3 style={{ fontSize: 14, fontWeight: 600, color: '#e2e8f0', marginBottom: 14, display: 'flex', alignItems: 'center', gap: 8 }}>
            <AlertTriangle size={15} color="#f97316" /> Pipeline Issues ({issues.length})
          </h3>
          {issues.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '30px 0', color: '#22c55e', fontSize: 13 }}>
              <CheckCircle size={24} style={{ marginBottom: 8, display: 'block', margin: '0 auto 8px' }} />
              No issues detected
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {issues.map((issue, i) => (
                <div
                  key={i}
                  style={{
                    padding: '10px 12px',
                    borderRadius: 8,
                    background: '#1a1a2e',
                    borderLeft: `3px solid ${SEVERITY[issue.severity] || '#6b7280'}`,
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                    <span style={{ fontSize: 11, fontWeight: 600, color: SEVERITY[issue.severity] || '#6b7280', textTransform: 'uppercase' }}>
                      {issue.type?.replace(/_/g, ' ')}
                    </span>
                    <span style={{ fontSize: 10, color: SEVERITY[issue.severity] || '#6b7280', textTransform: 'uppercase' }}>
                      {issue.severity}
                    </span>
                  </div>
                  <p style={{ fontSize: 12, color: '#d1d5db', lineHeight: 1.5 }}>{issue.message}</p>
                </div>
              ))}
            </div>
          )}
        </div>

        <div style={card}>
          <h3 style={{ fontSize: 14, fontWeight: 600, color: '#e2e8f0', marginBottom: 14, display: 'flex', alignItems: 'center', gap: 8 }}>
            <Zap size={15} color="#ef4444" /> Active Escalations ({escalations.length})
          </h3>
          {escalations.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '30px 0', color: '#22c55e', fontSize: 13 }}>
              <CheckCircle size={24} style={{ marginBottom: 8, display: 'block', margin: '0 auto 8px' }} />
              No active escalations
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {escalations.map((esc, i) => (
                <div key={i} style={{ padding: '10px 12px', borderRadius: 8, background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)' }}>
                  <p style={{ fontSize: 11, fontWeight: 600, color: '#ef4444', marginBottom: 4, textTransform: 'uppercase' }}>
                    {esc.type?.replace(/_/g, ' ')}
                  </p>
                  <p style={{ fontSize: 12, color: '#d1d5db', lineHeight: 1.5 }}>{esc.message}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <div style={{ ...card, marginTop: 16 }}>
        <h3 style={{ fontSize: 14, fontWeight: 600, color: '#e2e8f0', marginBottom: 12 }}>SLA Thresholds</h3>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 10 }}>
          {[
            ['Invoice analysis SLA', '10 minutes', 'Auto-fail if exceeded'],
            ['Critical alert response', '5 minutes', 'Escalation triggered'],
            ['Task due date', '24h overdue', 'Manager escalation'],
            ['Stuck job detection', '5 minutes', 'Auto-failed and flagged'],
          ].map(([label, threshold, action]) => (
            <div key={label} style={{ padding: '10px 14px', background: '#1a1a2e', borderRadius: 8 }}>
              <p style={{ fontSize: 12, fontWeight: 600, color: '#e2e8f0', marginBottom: 4 }}>{label}</p>
              <p style={{ fontSize: 13, color: '#a78bfa', fontWeight: 700, marginBottom: 2 }}>{threshold}</p>
              <p style={{ fontSize: 11, color: '#6b7280' }}>{action}</p>
            </div>
          ))}
        </div>
      </div>

      <div style={{ ...card, marginTop: 16 }}>
        <h3 style={{ fontSize: 14, fontWeight: 600, color: '#e2e8f0', marginBottom: 10, display: 'flex', alignItems: 'center', gap: 8 }}>
          <Shield size={15} color="#38bdf8" /> Self-Correction
        </h3>
        <p style={{ fontSize: 12, color: '#6b7280', marginBottom: 12 }}>
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
              background: '#1a1a2e',
              border: '1px solid #2d2d44',
              borderRadius: 8,
              padding: '10px 12px',
              color: '#e2e8f0',
              fontSize: 13,
              outline: 'none',
            }}
          />
          <button
            onClick={recomputeBaselines}
            disabled={baselineBusy}
            style={{
              padding: '10px 14px',
              background: '#1a1a2e',
              border: '1px solid #2d2d44',
              borderRadius: 8,
              color: '#9ca3af',
              cursor: 'pointer',
              fontSize: 12,
              fontWeight: 600,
            }}
          >
            {baselineBusy ? 'Recomputing...' : 'Recompute baselines'}
          </button>
        </div>
        {baselineStatus && (
          <div style={{ marginTop: 10, fontSize: 12, color: baselineStatus.includes('failed') ? '#fca5a5' : '#86efac' }}>
            {baselineStatus}
          </div>
        )}
      </div>
    </div>
  );
}
