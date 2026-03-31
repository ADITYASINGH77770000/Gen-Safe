import React, { useEffect, useState } from 'react';
import { auditApi } from '../services/api';
import { BookOpen, Shield, Brain, Activity, Search, ChevronDown, ChevronUp } from 'lucide-react';

const AGENT_COLORS = {
  orchestrator: 'var(--violet)',
  llm_analysis_agent: 'var(--cyan)',
  anomaly_detection_agent: 'var(--amber)',
  risk_aggregator: 'var(--red)',
  verification_audit_agent: 'var(--green)',
  mock_analysis: 'var(--text-secondary)',
};

function agentColor(id) {
  return AGENT_COLORS[id] || 'var(--text-secondary)';
}

function prettyJson(value) {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') return value;
  return JSON.stringify(value, null, 2);
}

export default function AuditTrail() {
  const [records, setRecords] = useState([]);
  const [stats, setStats] = useState([]);
  const [loading, setLoading] = useState(true);
  const [invoiceFilter, setInvoiceFilter] = useState('');
  const [expanded, setExpanded] = useState(null);

  useEffect(() => {
    load();
    auditApi.stats().then((r) => setStats(r.data.agent_stats || [])).catch(console.error);
  }, []);

  const load = (invoice_id = '') => {
    setLoading(true);
    auditApi
      .trail({ invoice_id: invoice_id || undefined, limit: 100 })
      .then((r) => setRecords(r.data.audit_records || []))
      .catch(console.error)
      .finally(() => setLoading(false));
  };

  const search = () => load(invoiceFilter.trim());

  return (
    <div>
      <div style={{ marginBottom: 22, display: 'flex', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap', alignItems: 'flex-end' }}>
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 800, color: 'var(--text-primary)' }}>AUDIT TRAIL</h1>
          <div className="jet-mono" style={{ fontSize: 11, color: 'var(--text-dim)', marginTop: 8 }}>
            Immutable record of every agent decision - append-only, never modified
          </div>
        </div>
        <div className="pill" style={{ background: 'rgba(0,232,135,0.08)', color: 'var(--green)', border: '1px solid rgba(0,232,135,0.18)' }}>
          <Shield size={12} /> APPEND-ONLY
        </div>
      </div>

      {stats.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(160px,1fr))', gap: 12, marginBottom: 20 }}>
          {stats.map((stat) => (
            <div key={stat.agent_id} className="panel panel-hover" style={{ padding: 16 }}>
              <div className="jet-mono" style={{ fontSize: 10, color: agentColor(stat.agent_id), fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1.2, marginBottom: 6 }}>
                {stat.agent_id?.replace(/_/g, ' ')}
              </div>
              <div className="jet-mono" style={{ fontSize: 28, fontWeight: 700, color: 'var(--text-primary)' }}>{stat.actions}</div>
              <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 4 }}>actions - avg {Math.round(stat.avg_ms || 0)}ms</div>
            </div>
          ))}
        </div>
      )}

      <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap' }}>
        <input
          style={{
            flex: 1,
            minWidth: 260,
            background: 'var(--bg-elevated)',
            border: '1px solid var(--border)',
            borderRadius: 10,
            padding: '10px 12px',
            color: 'var(--text-primary)',
            fontSize: 13,
            outline: 'none',
          }}
          placeholder="Filter by invoice ID..."
          value={invoiceFilter}
          onChange={(e) => setInvoiceFilter(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && search()}
        />
        <button
          onClick={search}
          className="pill"
          style={{
            background: 'rgba(0,212,255,0.08)',
            color: 'var(--cyan)',
            border: '1px solid rgba(0,212,255,0.2)',
            cursor: 'pointer',
            height: 40,
          }}
        >
          <Search size={13} /> SEARCH
        </button>
        <button
          onClick={() => {
            setInvoiceFilter('');
            load('');
          }}
          className="pill"
          style={{
            background: 'var(--bg-surface)',
            color: 'var(--text-secondary)',
            border: '1px solid var(--border)',
            cursor: 'pointer',
            height: 40,
          }}
        >
          Clear
        </button>
      </div>

      <div className="panel" style={{ padding: 20 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, gap: 12, flexWrap: 'wrap' }}>
          <h3 style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)' }}>DECISION RECORDS ({records.length})</h3>
          <div className="jet-mono" style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: 'var(--text-secondary)' }}>
            <Shield size={12} color="var(--green)" /> Appended records - tamper checked
          </div>
        </div>

        {loading ? (
          <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-dim)', fontSize: 13 }}>Loading audit records...</div>
        ) : records.length === 0 ? (
          <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-dim)', fontSize: 13 }}>
            No audit records yet. Submit an invoice to generate agent decision records.
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {records.map((record) => {
              const isExp = expanded === record.id;
              const color = agentColor(record.agent_id);
              return (
                <div key={record.id} className="panel" style={{ overflow: 'hidden', borderLeft: `3px solid ${color}` }}>
                  <div
                    onClick={() => setExpanded(isExp ? null : record.id)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 12,
                      padding: '12px 14px',
                      cursor: 'pointer',
                      background: isExp ? 'rgba(0,212,255,0.04)' : 'transparent',
                    }}
                  >
                    <div style={{ width: 8, height: 8, borderRadius: '50%', background: color, flexShrink: 0 }} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                        <span className="jet-mono" style={{ fontSize: 12, color: color, fontWeight: 700 }}>{record.agent_id?.replace(/_/g, ' ')}</span>
                        <span style={{ fontSize: 12, color: 'var(--text-primary)' }}>{record.action?.replace(/_/g, ' ')}</span>
                        {record.status === 'failed' && <span className="pill" style={{ background: 'rgba(255,58,92,0.1)', color: 'var(--red)', border: '1px solid rgba(255,58,92,0.2)' }}>FAILED</span>}
                      </div>
                      <div style={{ display: 'flex', gap: 12, marginTop: 4, flexWrap: 'wrap' }}>
                        <span className="jet-mono" style={{ fontSize: 10, color: 'var(--text-dim)' }}>trace:{record.trace_id?.slice(0, 8)}</span>
                        <span className="jet-mono" style={{ fontSize: 10, color: 'var(--text-dim)' }}>{record.created_at?.slice(0, 19)?.replace('T', ' ')}</span>
                        {record.duration_ms && <span className="jet-mono" style={{ fontSize: 10, color: 'var(--text-dim)' }}>{record.duration_ms}ms</span>}
                      </div>
                    </div>
                    {isExp ? <ChevronUp size={14} color="var(--text-secondary)" /> : <ChevronDown size={14} color="var(--text-secondary)" />}
                  </div>

                  {isExp && (
                    <div style={{ padding: '12px 14px', background: 'var(--bg-deep)', borderTop: '1px solid var(--border)' }}>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                        <div>
                          <p className="jet-mono" style={{ fontSize: 10, color: 'var(--text-dim)', marginBottom: 6, fontWeight: 700 }}>INPUT HASH</p>
                          <code className="jet-mono" style={{ fontSize: 11, color: 'var(--text-secondary)' }}>{record.input_hash}</code>
                        </div>
                        <div>
                          <p className="jet-mono" style={{ fontSize: 10, color: 'var(--text-dim)', marginBottom: 6, fontWeight: 700 }}>OUTPUT HASH</p>
                          <code className="jet-mono" style={{ fontSize: 11, color: 'var(--text-secondary)' }}>{record.output_hash}</code>
                        </div>
                        {record.output_data && (
                          <div style={{ gridColumn: '1/-1' }}>
                            <p className="jet-mono" style={{ fontSize: 10, color: 'var(--text-dim)', marginBottom: 6, fontWeight: 700 }}>OUTPUT DATA</p>
                            <pre style={{ fontSize: 11, color: 'var(--text-primary)', background: 'var(--bg-surface)', padding: '10px 12px', borderRadius: 10, overflow: 'auto', maxHeight: 220, border: '1px solid var(--border)' }}>
                              {prettyJson(typeof record.output_data === 'string' ? JSON.parse(record.output_data) : record.output_data)}
                            </pre>
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
