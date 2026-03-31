import React, { useEffect, useMemo, useState } from 'react';
import { integrationApi, opsApi, auditApi, webhookApi } from '../services/api';
import {
  Shield, Activity, RefreshCw, Link2, Send, KeyRound, Database, AlertTriangle, CheckCircle2,
  ExternalLink, PlayCircle, Radar, Lock, Waves
} from 'lucide-react';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, Cell } from 'recharts';

const card = {
  background: 'var(--bg-surface)',
  border: '1px solid var(--border)',
  borderRadius: 16,
  padding: 20,
  boxShadow: '0 20px 45px rgba(0,0,0,0.22)',
};

const input = {
  width: '100%',
  background: 'var(--bg-elevated)',
  border: '1px solid var(--border)',
  borderRadius: 10,
  padding: '10px 12px',
  color: 'var(--text-primary)',
  fontSize: 13,
  outline: 'none',
};

const smallBadge = (tone) => ({
  display: 'inline-flex',
  alignItems: 'center',
  gap: 6,
  padding: '4px 10px',
  borderRadius: 999,
  fontSize: 11,
  fontWeight: 700,
  letterSpacing: 0.2,
  textTransform: 'uppercase',
  background: tone.bg,
  color: tone.fg,
  border: `1px solid ${tone.border}`,
});

const emptyWebhook = {
  erp_system: 'quickbooks',
  invoice_number: `QB-${Math.floor(Math.random() * 90000 + 10000)}`,
  supplier_name: 'Demo Supplier',
  supplier_email: 'billing@demosupplier.com',
  supplier_iban: 'DE89370400440532013000',
  amount: 12850,
  currency: 'USD',
  invoice_text: 'Invoice 1001 from Demo Supplier\nPO: 8842\nTerms: Net 30',
};

const providerDefaults = {
  quickbooks: {
    client_id: '',
    client_secret: '',
    redirect_uri: 'http://localhost:8000/api/v1/integration/quickbooks/callback',
    scopes: 'com.intuit.quickbooks.accounting',
    enabled: true,
  },
  xero: {
    client_id: '',
    client_secret: '',
    redirect_uri: 'http://localhost:8000/api/v1/integration/xero/callback',
    scopes: 'openid profile email accounting.transactions offline_access',
    enabled: true,
  },
};

function pretty(value) {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') return value;
  return JSON.stringify(value, null, 2);
}

function StatusPill({ ok, label }) {
  const tone = ok
    ? { bg: 'rgba(34,197,94,0.12)', fg: '#86efac', border: 'rgba(34,197,94,0.35)' }
    : { bg: 'rgba(239,68,68,0.12)', fg: '#fca5a5', border: 'rgba(239,68,68,0.35)' };
  return <span style={smallBadge(tone)}>{ok ? <CheckCircle2 size={11} /> : <AlertTriangle size={11} />}{label}</span>;
}

export default function OpsCenter() {
  const [health, setHealth] = useState(null);
  const [security, setSecurity] = useState(null);
  const [ocr, setOcr] = useState(null);
  const [integrations, setIntegrations] = useState([]);
  const [integrity, setIntegrity] = useState(null);
  const [retention, setRetention] = useState(null);
  const [auditRetentionDays, setAuditRetentionDays] = useState('');
  const [traceId, setTraceId] = useState('');
  const [traceMessages, setTraceMessages] = useState([]);
  const [selectedProvider, setSelectedProvider] = useState('quickbooks');
  const [providerForm, setProviderForm] = useState(providerDefaults.quickbooks);
  const [webhookForm, setWebhookForm] = useState(emptyWebhook);
  const [busy, setBusy] = useState(false);
  const [info, setInfo] = useState('');
  const [jsonView, setJsonView] = useState(null);

  const providerMap = useMemo(() => {
    const map = new Map();
    integrations.forEach((item) => map.set(item.provider, item));
    return map;
  }, [integrations]);

  const load = async () => {
    setBusy(true);
    try {
      const [healthRes, securityRes, ocrRes, integrationsRes, integrityRes, retentionRes] = await Promise.all([
        opsApi.health(),
        opsApi.security(),
        opsApi.ocrStatus(),
        integrationApi.providers(),
        auditApi.integrity({ limit: 500 }),
        auditApi.retention(),
      ]);
      setHealth(healthRes.data);
      setSecurity(securityRes.data);
      setOcr(ocrRes.data);
      setIntegrations(integrationsRes.data.providers || []);
      setIntegrity(integrityRes.data);
      setRetention(retentionRes.data);
      setAuditRetentionDays((current) => current || String(retentionRes.data?.retention_days ?? ''));
    } catch (err) {
      setInfo(err.response?.data?.detail || err.message || 'Failed to load ops center data.');
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  useEffect(() => {
    const selected = providerMap.get(selectedProvider);
    if (selected) {
      setProviderForm((current) => ({
        client_id: selected.client_id || current.client_id || '',
        client_secret: '',
        redirect_uri: selected.redirect_uri || providerDefaults[selectedProvider].redirect_uri,
        scopes: selected.scopes || providerDefaults[selectedProvider].scopes,
        enabled: Boolean(selected.enabled),
      }));
    } else {
      setProviderForm(providerDefaults[selectedProvider] || providerDefaults.quickbooks);
    }
  }, [providerMap, selectedProvider]);

  const submitProvider = async () => {
    setBusy(true);
    setInfo('');
    try {
      await integrationApi.configure(selectedProvider, providerForm);
      await load();
      setInfo(`${selectedProvider} integration saved.`);
    } catch (err) {
      setInfo(err.response?.data?.detail || err.message || 'Integration save failed.');
    } finally {
      setBusy(false);
    }
  };

  const openAuthUrl = async (provider) => {
    setBusy(true);
    setInfo('');
    try {
      const res = await integrationApi.authUrl(provider);
      setJsonView(res.data);
      if (res.data?.auth_url) {
        window.open(res.data.auth_url, '_blank', 'noopener,noreferrer');
      }
    } catch (err) {
      setInfo(err.response?.data?.detail || err.message || 'Auth URL failed.');
    } finally {
      setBusy(false);
    }
  };

  const refreshStatus = async (provider) => {
    setBusy(true);
    setInfo('');
    try {
      const res = await integrationApi.status(provider);
      setJsonView(res.data);
      setInfo(`${provider} status refreshed.`);
    } catch (err) {
      setInfo(err.response?.data?.detail || err.message || 'Status check failed.');
    } finally {
      setBusy(false);
    }
  };

  const refreshToken = async (provider) => {
    setBusy(true);
    setInfo('');
    try {
      const res = await integrationApi.refresh(provider);
      setJsonView(res.data);
      setInfo(`${provider} token refreshed.`);
      await load();
    } catch (err) {
      setInfo(err.response?.data?.detail || err.message || 'Token refresh failed.');
    } finally {
      setBusy(false);
    }
  };

  const runEscalations = async () => {
    setBusy(true);
    try {
      const res = await opsApi.runEscalations();
      setJsonView(res.data);
      setInfo('Escalation sweep completed.');
      await load();
    } catch (err) {
      setInfo(err.response?.data?.detail || err.message || 'Escalation run failed.');
    } finally {
      setBusy(false);
    }
  };

  const runMaintenance = async () => {
    setBusy(true);
    try {
      const res = await opsApi.runMaintenance(true);
      setJsonView(res.data);
      setInfo('Full maintenance sweep completed.');
      await load();
    } catch (err) {
      setInfo(err.response?.data?.detail || err.message || 'Maintenance sweep failed.');
    } finally {
      setBusy(false);
    }
  };

  const archiveAudit = async () => {
    setBusy(true);
    try {
      const params = {};
      const parsed = Number(auditRetentionDays || retention?.retention_days || 0);
      if (Number.isFinite(parsed) && parsed > 0) {
        params.retention_days = parsed;
      }
      const res = await auditApi.exportAndPurge(params);
      setJsonView(res.data);
      setInfo('Audit archive completed.');
      await load();
    } catch (err) {
      setInfo(err.response?.data?.detail || err.message || 'Audit archive failed.');
    } finally {
      setBusy(false);
    }
  };

  const submitWebhook = async (kind) => {
    setBusy(true);
    setInfo('');
    try {
      const payload = { ...webhookForm };
      let res;
      if (kind === 'quickbooks') {
        res = await webhookApi.quickbooks(payload);
      } else if (kind === 'xero') {
        res = await webhookApi.xero(payload);
      } else {
        res = await webhookApi.simulateErp({ ...payload, erp_system: payload.erp_system || 'custom_erp' });
      }
      setJsonView(res.data);
      setInfo(`Webhook sent through ${kind}.`);
    } catch (err) {
      setInfo(err.response?.data?.detail || err.message || 'Webhook simulation failed.');
    } finally {
      setBusy(false);
    }
  };

  const loadTraceMessages = async () => {
    if (!traceId.trim()) {
      setInfo('Enter a trace ID first.');
      return;
    }
    setBusy(true);
    try {
      const res = await opsApi.traceMessages(traceId.trim(), 200);
      setTraceMessages(res.data.messages || []);
      setJsonView(res.data);
    } catch (err) {
      setInfo(err.response?.data?.detail || err.message || 'Trace lookup failed.');
    } finally {
      setBusy(false);
    }
  };

  const securityOrigins = security?.cors_allow_origins || [];
  const trustedHosts = security?.trusted_hosts || [];
  const healthMetrics = health?.metrics || {};
  const opsChartData = useMemo(() => [
    { name: 'Queue', value: healthMetrics.queue_depth ?? 0, fill: '#38bdf8' },
    { name: 'Failed', value: healthMetrics.failed_jobs_last_24h ?? 0, fill: '#ef4444' },
    { name: 'Alerts', value: healthMetrics.open_alerts ?? 0, fill: '#f97316' },
    { name: 'Tasks', value: healthMetrics.overdue_tasks ?? 0, fill: '#eab308' },
    { name: 'Msgs', value: healthMetrics.agent_messages_last_24h ?? 0, fill: '#22c55e' },
  ], [healthMetrics]);
  const integritySummary = integrity || {};
  const providerEntries = ['quickbooks', 'xero'];
  const selectedProviderInfo = providerMap.get(selectedProvider);

  return (
    <div>
      <div style={{ marginBottom: 22, display: 'flex', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
            <div style={{ width: 42, height: 42, borderRadius: 14, background: 'linear-gradient(135deg,#4B3CA7,#22c55e)', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 12px 30px rgba(75,60,167,0.35)' }}>
              <Radar size={20} color="#fff" />
            </div>
            <div>
              <h1 style={{ fontSize: 24, fontWeight: 800, color: '#e2e8f0', margin: 0 }}>Operations Center</h1>
              <p style={{ fontSize: 13, color: '#6b7280', marginTop: 3 }}>Security, integrations, audit integrity, escalation, and webhook control.</p>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <StatusPill ok={health?.status !== 'critical'} label={`Health ${health?.status || 'unknown'}`} />
            <StatusPill ok={true} label={security?.security_hardening_enabled ? 'Hardened' : 'Legacy-safe'} />
            <StatusPill ok={Boolean(integritySummary?.decisions?.healthy)} label={`Audit ${integritySummary?.decisions?.healthy === false ? 'mismatch' : 'healthy'}`} />
          </div>
        </div>
        <button
          onClick={load}
          disabled={busy}
          style={{
            alignSelf: 'flex-start',
            padding: '10px 16px',
            background: 'linear-gradient(135deg,#4B3CA7,#6D5ED4)',
            border: 'none',
            borderRadius: 10,
            color: '#fff',
            cursor: busy ? 'not-allowed' : 'pointer',
            fontSize: 13,
            fontWeight: 700,
            display: 'inline-flex',
            alignItems: 'center',
            gap: 8,
          }}
        >
          <RefreshCw size={14} /> Refresh all
        </button>
      </div>

      {info && (
        <div style={{ ...card, marginBottom: 16, borderColor: 'rgba(56,189,248,0.35)' }}>
          <p style={{ margin: 0, color: '#a5f3fc', fontSize: 13 }}>{info}</p>
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: 14, marginBottom: 18 }}>
        <div style={card}>
          <p style={{ fontSize: 12, color: '#6b7280', margin: 0 }}>Queue Depth</p>
          <p style={{ fontSize: 32, fontWeight: 800, color: '#e2e8f0', margin: '6px 0 0' }}>{healthMetrics.queue_depth ?? 0}</p>
          <p style={{ fontSize: 12, color: '#6b7280', marginTop: 6 }}>Queued {healthMetrics.queued_jobs ?? 0} · Processing {healthMetrics.processing_jobs ?? 0}</p>
        </div>
        <div style={card}>
          <p style={{ fontSize: 12, color: '#6b7280', margin: 0 }}>Security Headers</p>
          <p style={{ fontSize: 32, fontWeight: 800, color: '#e2e8f0', margin: '6px 0 0' }}>{security?.security_headers_enabled ? 'ON' : 'OFF'}</p>
          <p style={{ fontSize: 12, color: '#6b7280', marginTop: 6 }}>JWT TTL {security?.jwt_expires_minutes ?? 0} min</p>
        </div>
        <div style={card}>
          <p style={{ fontSize: 12, color: '#6b7280', margin: 0 }}>Audit Integrity</p>
          <p style={{ fontSize: 32, fontWeight: 800, color: '#e2e8f0', margin: '6px 0 0' }}>{integritySummary?.decisions?.verified ?? 0}</p>
          <p style={{ fontSize: 12, color: '#6b7280', marginTop: 6 }}>Verified records across {integritySummary?.decisions?.traces ?? 0} traces</p>
        </div>
        <div style={card}>
          <p style={{ fontSize: 12, color: '#6b7280', margin: 0 }}>Retention</p>
          <p style={{ fontSize: 32, fontWeight: 800, color: '#e2e8f0', margin: '6px 0 0' }}>{retention?.retention_days ?? 0}</p>
          <p style={{ fontSize: 12, color: '#6b7280', marginTop: 6 }}>Archive mode {retention?.enabled ? 'enabled' : 'preview-only'}</p>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1.1fr 0.9fr', gap: 16, marginBottom: 16 }}>
        <div className="ops-tile" style={card}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 14 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <Waves size={16} color="#38bdf8" />
              <h3 style={{ fontSize: 15, fontWeight: 700, color: '#e2e8f0', margin: 0 }}>Operational Snapshot</h3>
            </div>
            <span style={smallBadge({ bg: 'rgba(56,189,248,0.10)', fg: '#a5f3fc', border: 'rgba(56,189,248,0.28)' })}>Live metrics</span>
          </div>
          <div style={{ height: 240 }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={opsChartData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                <CartesianGrid stroke="rgba(148,163,184,0.12)" vertical={false} />
                <XAxis dataKey="name" tick={{ fill: '#94a3b8', fontSize: 11 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fill: '#94a3b8', fontSize: 11 }} axisLine={false} tickLine={false} />
                <Tooltip
                  contentStyle={{ background: '#111827', border: '1px solid #1e293b', borderRadius: 12, color: '#e2e8f0', fontSize: 12 }}
                  cursor={{ fill: 'rgba(56,189,248,0.08)' }}
                />
                <Bar dataKey="value" radius={[8, 8, 0, 0]}>
                  {opsChartData.map((entry) => <Cell key={entry.name} fill={entry.fill} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="ops-tile" style={card}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
            <Radar size={16} color="#f97316" className="ops-float" />
            <h3 style={{ fontSize: 15, fontWeight: 700, color: '#e2e8f0', margin: 0 }}>OCR Readiness</h3>
          </div>
          <div style={{ display: 'grid', gap: 10 }}>
            <StatusPill ok={Boolean(ocr?.available)} label={ocr?.available ? 'OCR Ready' : 'OCR Missing'} />
            <div style={{ padding: 12, background: '#0f0f13', border: '1px solid #1e1e2e', borderRadius: 12 }}>
              <p style={{ margin: 0, fontSize: 11, color: '#6b7280' }}>Tesseract Command</p>
              <p style={{ margin: '6px 0 0', fontSize: 12, color: '#e2e8f0', wordBreak: 'break-all' }}>{ocr?.command || 'Not configured'}</p>
            </div>
            <div style={{ padding: 12, background: '#0f0f13', border: '1px solid #1e1e2e', borderRadius: 12 }}>
              <p style={{ margin: 0, fontSize: 11, color: '#6b7280' }}>Version</p>
              <p style={{ margin: '6px 0 0', fontSize: 18, fontWeight: 800, color: '#e2e8f0' }}>{ocr?.version || 'Unavailable'}</p>
            </div>
            <p style={{ margin: 0, fontSize: 12, color: '#94a3b8', lineHeight: 1.6 }}>{ocr?.notes}</p>
            {ocr?.error && (
              <div style={{ padding: 12, background: 'rgba(239,68,68,0.10)', border: '1px solid rgba(239,68,68,0.25)', borderRadius: 12, color: '#fca5a5', fontSize: 12 }}>
                {ocr.error}
              </div>
            )}
          </div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 0.8fr', gap: 16, marginBottom: 16 }}>
        <div style={card}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
            <Shield size={16} color="#38bdf8" />
            <h3 style={{ fontSize: 15, fontWeight: 700, color: '#e2e8f0', margin: 0 }}>Security Posture</h3>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12, marginBottom: 14 }}>
            <div>
              <p style={{ fontSize: 11, color: '#6b7280', marginBottom: 6 }}>Trusted Hosts</p>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {trustedHosts.map((host) => <span key={host} style={smallBadge({ bg: 'rgba(56,189,248,0.10)', fg: '#a5f3fc', border: 'rgba(56,189,248,0.30)' })}>{host}</span>)}
              </div>
            </div>
            <div>
              <p style={{ fontSize: 11, color: '#6b7280', marginBottom: 6 }}>Allowed Origins</p>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {securityOrigins.map((origin) => <span key={origin} style={smallBadge({ bg: 'rgba(168,85,247,0.10)', fg: '#d8b4fe', border: 'rgba(168,85,247,0.30)' })}>{origin}</span>)}
              </div>
            </div>
          </div>
          <pre style={{ margin: 0, background: '#0f0f13', border: '1px solid #1e1e2e', borderRadius: 12, padding: 14, color: '#cbd5e1', fontSize: 12, overflow: 'auto', maxHeight: 220 }}>
{pretty(security)}
          </pre>
        </div>

        <div style={card}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
            <Activity size={16} color="#22c55e" />
            <h3 style={{ fontSize: 15, fontWeight: 700, color: '#e2e8f0', margin: 0 }}>Workflow Health</h3>
          </div>
          <div style={{ display: 'grid', gap: 10 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, color: '#cbd5e1' }}>
              <span>Failed Jobs (24h)</span>
              <strong>{healthMetrics.failed_jobs_last_24h ?? 0}</strong>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, color: '#cbd5e1' }}>
              <span>Open Alerts</span>
              <strong>{healthMetrics.open_alerts ?? 0}</strong>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, color: '#cbd5e1' }}>
              <span>Overdue Tasks</span>
              <strong>{healthMetrics.overdue_tasks ?? 0}</strong>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, color: '#cbd5e1' }}>
              <span>Agent Messages (24h)</span>
              <strong>{healthMetrics.agent_messages_last_24h ?? 0}</strong>
            </div>
          </div>
          <div style={{ marginTop: 16, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {(health?.reasons || []).map((reason) => (
              <span key={reason} style={smallBadge({ bg: 'rgba(34,197,94,0.10)', fg: '#86efac', border: 'rgba(34,197,94,0.30)' })}>{reason}</span>
            ))}
          </div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
        <div style={card}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
            <Link2 size={16} color="#a78bfa" />
            <h3 style={{ fontSize: 15, fontWeight: 700, color: '#e2e8f0', margin: 0 }}>ERP Integrations</h3>
          </div>
          <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
            {providerEntries.map((provider) => (
              <button
                key={provider}
                onClick={() => setSelectedProvider(provider)}
                style={{
                  padding: '7px 12px',
                  borderRadius: 999,
                  border: `1px solid ${selectedProvider === provider ? '#4B3CA7' : '#2d2d44'}`,
                  background: selectedProvider === provider ? '#2D1B6E' : '#12121a',
                  color: selectedProvider === provider ? '#a78bfa' : '#9ca3af',
                  cursor: 'pointer',
                  fontSize: 12,
                  fontWeight: 700,
                  textTransform: 'capitalize',
                }}
              >
                {provider}
              </button>
            ))}
          </div>

          <div style={{ display: 'grid', gap: 10, marginBottom: 12 }}>
            <input style={input} placeholder="Client ID" value={providerForm.client_id} onChange={(e) => setProviderForm((p) => ({ ...p, client_id: e.target.value }))} />
            <input style={input} placeholder="Client Secret" type="password" value={providerForm.client_secret} onChange={(e) => setProviderForm((p) => ({ ...p, client_secret: e.target.value }))} />
            <input style={input} placeholder="Redirect URI" value={providerForm.redirect_uri} onChange={(e) => setProviderForm((p) => ({ ...p, redirect_uri: e.target.value }))} />
            <input style={input} placeholder="Scopes" value={providerForm.scopes} onChange={(e) => setProviderForm((p) => ({ ...p, scopes: e.target.value }))} />
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: '#cbd5e1' }}>
              <input type="checkbox" checked={Boolean(providerForm.enabled)} onChange={(e) => setProviderForm((p) => ({ ...p, enabled: e.target.checked }))} />
              Enabled
            </label>
          </div>

          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
            <StatusPill ok={Boolean(selectedProviderInfo?.configured)} label={selectedProviderInfo?.configured ? 'Configured' : 'Missing credentials'} />
            <StatusPill ok={Boolean(selectedProviderInfo?.connected)} label={selectedProviderInfo?.connected ? 'Connected' : 'Not connected'} />
            {selectedProviderInfo?.has_client_secret ? (
              <span style={smallBadge({ bg: 'rgba(56,189,248,0.10)', fg: '#a5f3fc', border: 'rgba(56,189,248,0.28)' })}>Secret stored</span>
            ) : (
              <span style={smallBadge({ bg: 'rgba(148,163,184,0.10)', fg: '#cbd5e1', border: 'rgba(148,163,184,0.28)' })}>Secret needed</span>
            )}
          </div>

          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <button onClick={submitProvider} disabled={busy} style={{ padding: '9px 14px', background: 'linear-gradient(135deg,#4B3CA7,#6D5ED4)', border: 'none', borderRadius: 10, color: '#fff', cursor: 'pointer', fontSize: 13, fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: 8 }}>
              <KeyRound size={14} /> Save
            </button>
            <button onClick={() => openAuthUrl(selectedProvider)} disabled={busy} style={{ padding: '9px 14px', background: '#12121a', border: '1px solid #2d2d44', borderRadius: 10, color: '#a78bfa', cursor: 'pointer', fontSize: 13, fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: 8 }}>
              <ExternalLink size={14} /> Auth URL
            </button>
            <button onClick={() => refreshStatus(selectedProvider)} disabled={busy} style={{ padding: '9px 14px', background: '#12121a', border: '1px solid #2d2d44', borderRadius: 10, color: '#9ca3af', cursor: 'pointer', fontSize: 13, fontWeight: 700 }}>
              Status
            </button>
            <button onClick={() => refreshToken(selectedProvider)} disabled={busy} style={{ padding: '9px 14px', background: '#12121a', border: '1px solid #2d2d44', borderRadius: 10, color: '#9ca3af', cursor: 'pointer', fontSize: 13, fontWeight: 700 }}>
              Refresh Token
            </button>
          </div>
        </div>

        <div style={card}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
            <Send size={16} color="#22c55e" />
            <h3 style={{ fontSize: 15, fontWeight: 700, color: '#e2e8f0', margin: 0 }}>Webhook Simulator</h3>
          </div>
          <div style={{ display: 'grid', gap: 10 }}>
            <input style={input} value={webhookForm.invoice_number} onChange={(e) => setWebhookForm((p) => ({ ...p, invoice_number: e.target.value }))} placeholder="Invoice number" />
            <input style={input} value={webhookForm.supplier_name} onChange={(e) => setWebhookForm((p) => ({ ...p, supplier_name: e.target.value }))} placeholder="Supplier name" />
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <input style={input} value={webhookForm.amount} onChange={(e) => setWebhookForm((p) => ({ ...p, amount: Number(e.target.value) }))} type="number" placeholder="Amount" />
              <input style={input} value={webhookForm.currency} onChange={(e) => setWebhookForm((p) => ({ ...p, currency: e.target.value }))} placeholder="Currency" />
            </div>
            <textarea style={{ ...input, minHeight: 110, resize: 'vertical', fontFamily: 'monospace' }} value={webhookForm.invoice_text} onChange={(e) => setWebhookForm((p) => ({ ...p, invoice_text: e.target.value }))} placeholder="Invoice text" />
          </div>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 12 }}>
            <button onClick={() => submitWebhook('quickbooks')} disabled={busy} style={{ padding: '9px 14px', background: '#1a1a2e', border: '1px solid #2d2d44', borderRadius: 10, color: '#a5f3fc', cursor: 'pointer', fontSize: 13, fontWeight: 700 }}>
              QuickBooks
            </button>
            <button onClick={() => submitWebhook('xero')} disabled={busy} style={{ padding: '9px 14px', background: '#1a1a2e', border: '1px solid #2d2d44', borderRadius: 10, color: '#d8b4fe', cursor: 'pointer', fontSize: 13, fontWeight: 700 }}>
              Xero
            </button>
            <button onClick={() => submitWebhook('erp')} disabled={busy} style={{ padding: '9px 14px', background: '#1a1a2e', border: '1px solid #2d2d44', borderRadius: 10, color: '#86efac', cursor: 'pointer', fontSize: 13, fontWeight: 700 }}>
              Generic ERP
            </button>
          </div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
        <div style={card}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
            <Lock size={16} color="#f97316" />
            <h3 style={{ fontSize: 15, fontWeight: 700, color: '#e2e8f0', margin: 0 }}>Audit Integrity & Retention</h3>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 10, marginBottom: 12 }}>
            <div style={{ padding: 12, background: '#0f0f13', borderRadius: 12, border: '1px solid #1e1e2e' }}>
              <p style={{ margin: 0, fontSize: 11, color: '#6b7280' }}>Decision Records</p>
              <p style={{ margin: '6px 0 0', fontSize: 24, fontWeight: 800, color: '#e2e8f0' }}>{integritySummary?.decisions?.total ?? 0}</p>
              <p style={{ margin: '6px 0 0', fontSize: 11, color: '#9ca3af' }}>Healthy: {String(integritySummary?.decisions?.healthy ?? true)}</p>
            </div>
            <div style={{ padding: 12, background: '#0f0f13', borderRadius: 12, border: '1px solid #1e1e2e' }}>
              <p style={{ margin: 0, fontSize: 11, color: '#6b7280' }}>Trace Streams</p>
              <p style={{ margin: '6px 0 0', fontSize: 24, fontWeight: 800, color: '#e2e8f0' }}>{integritySummary?.messages?.traces ?? 0}</p>
              <p style={{ margin: '6px 0 0', fontSize: 11, color: '#9ca3af' }}>Messages: {integritySummary?.messages?.total ?? 0}</p>
            </div>
          </div>

          <div style={{ display: 'grid', gap: 10, marginBottom: 12 }}>
            <input
              style={input}
              value={auditRetentionDays}
              onChange={(e) => setAuditRetentionDays(e.target.value)}
              placeholder={`Retention days (default ${retention?.retention_days ?? 365})`}
            />
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              <button
                onClick={archiveAudit}
                disabled={busy}
                style={{
                  padding: '9px 14px',
                  background: '#12121a',
                  border: '1px solid #2d2d44',
                  borderRadius: 10,
                  color: '#fca5a5',
                  cursor: 'pointer',
                  fontSize: 13,
                  fontWeight: 700,
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 8,
                }}
              >
                <Lock size={14} /> Archive & Purge
              </button>
            </div>
          </div>

          <div style={{ display: 'grid', gap: 10 }}>
            <input style={input} value={traceId} onChange={(e) => setTraceId(e.target.value)} placeholder="Trace ID for message lookup" />
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              <button onClick={loadTraceMessages} disabled={busy} style={{ padding: '9px 14px', background: '#12121a', border: '1px solid #2d2d44', borderRadius: 10, color: '#a5f3fc', cursor: 'pointer', fontSize: 13, fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                <Waves size={14} /> Load Messages
              </button>
              <button onClick={runEscalations} disabled={busy} style={{ padding: '9px 14px', background: '#12121a', border: '1px solid #2d2d44', borderRadius: 10, color: '#fca5a5', cursor: 'pointer', fontSize: 13, fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                <PlayCircle size={14} /> Run Escalations
              </button>
              <button onClick={runMaintenance} disabled={busy} style={{ padding: '9px 14px', background: '#12121a', border: '1px solid #2d2d44', borderRadius: 10, color: '#86efac', cursor: 'pointer', fontSize: 13, fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                <RefreshCw size={14} /> Full Maintenance
              </button>
            </div>
            {traceMessages.length > 0 && (
              <div style={{ maxHeight: 190, overflow: 'auto', border: '1px solid #1e1e2e', borderRadius: 12, background: '#0f0f13', padding: 12 }}>
                {traceMessages.map((msg) => (
                  <div key={msg.message_id} style={{ marginBottom: 12, paddingBottom: 12, borderBottom: '1px solid #1e1e2e' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
                      <strong style={{ color: '#e2e8f0', fontSize: 12 }}>{msg.from_agent} → {msg.to_agent}</strong>
                      <span style={{ color: '#6b7280', fontSize: 11 }}>{msg.message_type}</span>
                    </div>
                    <pre style={{ margin: '6px 0 0', color: '#cbd5e1', fontSize: 11, whiteSpace: 'pre-wrap' }}>{pretty(msg.payload)}</pre>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <div style={card}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
            <Database size={16} color="#38bdf8" />
            <h3 style={{ fontSize: 15, fontWeight: 700, color: '#e2e8f0', margin: 0 }}>Live Snapshot</h3>
          </div>
          {jsonView && (
            <div style={{ marginBottom: 12, padding: 12, background: 'rgba(56,189,248,0.08)', border: '1px solid rgba(56,189,248,0.22)', borderRadius: 12 }}>
              <p style={{ margin: '0 0 8px', color: '#a5f3fc', fontSize: 11, fontWeight: 700, letterSpacing: 0.4, textTransform: 'uppercase' }}>Last Action</p>
              <pre style={{ margin: 0, color: '#dbeafe', fontSize: 11, whiteSpace: 'pre-wrap' }}>{pretty(jsonView)}</pre>
            </div>
          )}
          <pre style={{ margin: 0, background: '#0f0f13', border: '1px solid #1e1e2e', borderRadius: 12, padding: 14, color: '#cbd5e1', fontSize: 12, overflow: 'auto', maxHeight: 380 }}>
{pretty({
  health,
  security,
  integrations,
  integrity: {
    decisions: integritySummary?.decisions,
    messages: integritySummary?.messages,
  },
  retention,
  trace_messages: traceMessages.slice(0, 5),
})}
          </pre>
        </div>
      </div>
    </div>
  );
}
