import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  AlertTriangle,
  ArrowLeft,
  Activity,
  Brain,
  CheckCircle,
  ScanSearch,
  Shield,
  XCircle,
} from 'lucide-react';
import { alertApi, invoiceApi } from '../services/api';

const RISK_COLORS = { critical: 'var(--red)', high: 'var(--amber)', medium: 'var(--violet)', low: 'var(--green)' };
const SEV_COLORS = { high: 'var(--red)', medium: 'var(--amber)', low: 'var(--violet)' };
const AGENT_COLORS = {
  llm: 'var(--cyan)',
  anomaly: 'var(--amber)',
  cv: 'var(--violet)',
  multilingual: 'var(--green)',
  fraud_simulation: 'var(--red)',
  verification: 'var(--text-secondary)',
};

function scoreOf(payload) {
  if (!payload) return 0;
  if (typeof payload === 'number') return payload;
  return Number(payload.risk_score || payload.anomaly_score || payload.discriminator_confidence || 0) * (payload.risk_score ? 1 : 100);
}

function pretty(value) {
  if (value === null || value === undefined) return 'No data returned.';
  if (typeof value === 'string') return value;
  return JSON.stringify(value, null, 2);
}

function getRenderableOcrFields(fields) {
  if (!fields) return [];
  const preferredOrder = [
    'supplier_name',
    'invoice_number',
    'invoice_date',
    'due_date',
    'po_number',
    'reference',
    'bill_to',
    'payment_terms',
    'currency',
    'subtotal',
    'tax',
    'discount',
    'total_amount',
  ];
  const seen = new Set();
  const ordered = [];

  preferredOrder.forEach((key) => {
    if (key in fields) {
      ordered.push([key, fields[key]]);
      seen.add(key);
    }
  });

  Object.entries(fields).forEach(([key, value]) => {
    if (key !== 'confidence' && !seen.has(key)) ordered.push([key, value]);
  });

  return ordered;
}

function CircularScore({ value, color }) {
  const size = 112;
  const stroke = 8;
  const normalized = Math.max(0, Math.min(100, Number(value || 0)));
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (normalized / 100) * circumference;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      <circle cx={size / 2} cy={size / 2} r={radius} stroke="rgba(255,255,255,0.08)" strokeWidth={stroke} fill="none" />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        stroke={color}
        strokeWidth={stroke}
        fill="none"
        strokeDasharray={circumference}
        strokeDashoffset={offset}
        strokeLinecap="round"
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
        style={{ transition: 'stroke-dashoffset 700ms ease' }}
      />
    </svg>
  );
}

export default function AlertDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [alert, setAlert] = useState(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [note, setNote] = useState('');
  const [done, setDone] = useState('');
  const [agentBreakdown, setAgentBreakdown] = useState(null);
  const [agentLoading, setAgentLoading] = useState(false);
  const [agentError, setAgentError] = useState('');

  useEffect(() => {
    alertApi
      .get(id)
      .then((r) => setAlert(r.data))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [id]);

  useEffect(() => {
    const invoiceId = alert?.invoice_id;
    if (!invoiceId) return undefined;
    let active = true;
    setAgentLoading(true);
    setAgentError('');
    invoiceApi
      .agents(invoiceId)
      .then((r) => {
        if (active) setAgentBreakdown(r.data);
      })
      .catch((err) => {
        if (active) setAgentError(err.response?.data?.detail || 'Unable to load agent breakdown.');
      })
      .finally(() => {
        if (active) setAgentLoading(false);
      });
    return () => {
      active = false;
    };
  }, [alert?.invoice_id]);

  const submitFeedback = async (wasCorrect) => {
    setSubmitting(true);
    try {
      await alertApi.feedback(id, { was_correct: wasCorrect, analyst_note: note });
      setDone(wasCorrect ? 'Confirmed as fraud - system learning updated.' : 'Marked as false positive - model will be retrained.');
      setAlert((prev) => ({ ...prev, status: wasCorrect ? 'resolved' : 'false_positive' }));
    } catch (e) {
      setDone('Error submitting feedback.');
    } finally {
      setSubmitting(false);
    }
  };

  const riskScore = Number(agentBreakdown?.risk_score || alert?.risk_score || 0);
  const riskLevel = String(alert?.risk_level || 'low');
  const riskColor = RISK_COLORS[riskLevel] || 'var(--text-secondary)';
  const flags = Array.isArray(alert?.flags) ? alert.flags : [];
  const agentCards = useMemo(() => {
    const agents = agentBreakdown?.agents || {};
    return Object.entries(agents);
  }, [agentBreakdown]);

  if (loading) return <div style={{ color: 'var(--text-secondary)', textAlign: 'center', padding: 60 }}>Loading alert...</div>;
  if (!alert) return <div style={{ color: 'var(--red)', textAlign: 'center', padding: 60 }}>Alert not found.</div>;

  return (
    <div>
      <button
        onClick={() => navigate('/alerts')}
        className="jet-mono"
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 8,
          color: 'var(--text-dim)',
          background: 'none',
          border: 'none',
          cursor: 'pointer',
          fontSize: 11,
          marginBottom: 18,
          letterSpacing: 1.2,
        }}
      >
        <ArrowLeft size={14} /> ALERTS
      </button>

      <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 0.9fr', gap: 16, marginBottom: 16 }}>
        <div className="panel" style={{ padding: 22, position: 'relative', overflow: 'hidden' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16, flexWrap: 'wrap' }}>
            <div>
              <h1 style={{ fontSize: 22, fontWeight: 800, color: 'var(--text-primary)' }}>{alert.supplier_name || 'Unknown Supplier'}</h1>
              <div className="jet-mono" style={{ fontSize: 13, color: 'var(--text-dim)', marginTop: 8 }}>
                {alert.invoice_number} - {Number(alert.amount || 0).toLocaleString()} {alert.currency}
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
              <div style={{ position: 'relative', width: 112, height: 112 }}>
                <CircularScore value={riskScore} color={riskColor} />
                <div
                  style={{
                    position: 'absolute',
                    inset: 0,
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    textAlign: 'center',
                  }}
                >
                  <div className="jet-mono risk-score-number" style={{ fontSize: 34, fontWeight: 900, color: riskColor, lineHeight: 1 }}>
                    {Math.round(riskScore)}
                  </div>
                  <div className="jet-mono" style={{ fontSize: 12, color: 'var(--text-dim)' }}>/100</div>
                </div>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 8 }}>
                <span className="pill" style={{ background: `${riskColor}18`, color: riskColor, border: `1px solid ${riskColor}40`, textTransform: 'uppercase' }}>
                  {riskLevel}
                </span>
                <div className="jet-mono" style={{ fontSize: 11, color: 'var(--text-dim)' }}>
                  Trace ID {agentBreakdown?.trace_id || 'n/a'}
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="panel" style={{ padding: 22 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
            <ScanSearch size={16} color="var(--cyan)" />
            <h3 style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)' }}>OCR Parsed Fields</h3>
          </div>
          {alert.ocr_fields ? (
            <div style={{ display: 'grid', gap: 10 }}>
              {getRenderableOcrFields(alert.ocr_fields).map(([label, value]) => (
                <div key={label} style={{ padding: '10px 12px', background: 'var(--bg-elevated)', borderRadius: 10, border: '1px solid var(--border)' }}>
                  <div className="jet-mono" style={{ fontSize: 10, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: 1.2, marginBottom: 4 }}>
                    {label}
                  </div>
                  <div style={{ fontSize: 13, color: 'var(--text-primary)', wordBreak: 'break-word' }}>{value != null && value !== '' ? String(value) : 'n/a'}</div>
                </div>
              ))}
            </div>
          ) : (
            <div style={{ color: 'var(--text-dim)', fontSize: 13 }}>No OCR fields are available for this alert.</div>
          )}
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 0.8fr', gap: 16, marginBottom: 16 }}>
        <div className="panel" style={{ padding: 22, background: 'linear-gradient(135deg, rgba(0,212,255,0.04), rgba(124,111,255,0.04))' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
            <Brain size={16} color="var(--cyan)" />
            <div className="jet-mono" style={{ fontSize: 11, letterSpacing: 1.4, color: 'var(--cyan)' }}>
              AI EXPLANATION
            </div>
          </div>
          <p style={{ fontSize: 15, color: 'var(--text-primary)', lineHeight: 1.75, whiteSpace: 'pre-wrap' }}>
            {alert.explanation_text || 'No explanation generated.'}
          </p>
          {alert.recommended_action && (
            <div style={{ marginTop: 14, padding: 14, background: 'rgba(0,212,255,0.08)', border: '1px solid rgba(0,212,255,0.25)', borderRadius: 12 }}>
              <div className="jet-mono" style={{ fontSize: 10, letterSpacing: 1.4, color: 'var(--cyan)', marginBottom: 6 }}>
                RECOMMENDED ACTION
              </div>
              <div style={{ fontSize: 14, color: 'var(--text-primary)', fontWeight: 600 }}>{alert.recommended_action}</div>
            </div>
          )}
        </div>

        <div className="panel" style={{ padding: 22 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
            <Shield size={16} color="var(--green)" />
            <h3 style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)' }}>ANALYST DECISION</h3>
          </div>
          {done ? (
            <div style={{ padding: 14, background: 'rgba(0,232,135,0.08)', border: '1px solid rgba(0,232,135,0.18)', borderRadius: 12, color: 'var(--green)', fontSize: 13 }}>{done}</div>
          ) : alert.status !== 'open' ? (
            <div style={{ padding: 14, background: 'var(--bg-elevated)', borderRadius: 12, color: 'var(--text-secondary)', fontSize: 13 }}>
              Status: <strong style={{ color: 'var(--text-primary)' }}>{alert.status?.replace('_', ' ')}</strong>
            </div>
          ) : (
            <>
              <textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Optional analyst note..."
                style={{
                  width: '100%',
                  minHeight: 110,
                  background: 'rgba(0,0,0,0.4)',
                  border: '1px solid var(--border)',
                  borderRadius: 12,
                  padding: '12px 14px',
                  color: 'var(--text-primary)',
                  fontSize: 14,
                  resize: 'vertical',
                  outline: 'none',
                  marginBottom: 12,
                }}
                onFocus={(e) => {
                  e.currentTarget.style.borderColor = 'var(--cyan)';
                  e.currentTarget.style.boxShadow = '0 0 0 3px var(--cyan-glow)';
                }}
                onBlur={(e) => {
                  e.currentTarget.style.borderColor = 'var(--border)';
                  e.currentTarget.style.boxShadow = 'none';
                }}
              />
              <div style={{ display: 'flex', gap: 10 }}>
                <button
                  onClick={() => submitFeedback(true)}
                  disabled={submitting}
                  style={{
                    flex: 1,
                    padding: '11px 12px',
                    background: 'rgba(255,58,92,0.12)',
                    border: '1px solid var(--red)',
                    borderRadius: 12,
                    color: '#ff9eb0',
                    cursor: 'pointer',
                    fontSize: 13,
                    fontWeight: 600,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 6,
                    transition: 'all 200ms ease',
                  }}
                >
                  <XCircle size={14} /> Confirm Fraud
                </button>
                <button
                  onClick={() => submitFeedback(false)}
                  disabled={submitting}
                  style={{
                    flex: 1,
                    padding: '11px 12px',
                    background: 'rgba(0,232,135,0.12)',
                    border: '1px solid var(--green)',
                    borderRadius: 12,
                    color: 'var(--green)',
                    cursor: 'pointer',
                    fontSize: 13,
                    fontWeight: 600,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 6,
                    transition: 'all 200ms ease',
                  }}
                >
                  <CheckCircle size={14} /> False Positive
                </button>
              </div>
            </>
          )}
        </div>
      </div>

      <div className="panel" style={{ padding: 22, marginBottom: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
          <Activity size={16} color="var(--cyan)" />
          <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)' }}>AGENT INTELLIGENCE MATRIX</div>
        </div>

        {agentLoading ? (
          <div style={{ color: 'var(--text-dim)', fontSize: 13 }}>Loading agent results...</div>
        ) : agentError ? (
          <div style={{ color: 'var(--red)', fontSize: 13 }}>{agentError}</div>
        ) : agentBreakdown ? (
          <div style={{ display: 'grid', gap: 14 }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 14 }}>
              {agentCards.map(([name, payload]) => {
                const label = name === 'fraud_simulation' ? 'GAN Discriminator' : name === 'cv' ? 'Computer Vision' : name === 'llm' ? 'LLM Analysis' : name === 'anomaly' ? 'Anomaly Detection' : name === 'verification' ? 'Verification' : 'Multilingual';
                const score = scoreOf(payload);
                const color = AGENT_COLORS[name] || 'var(--text-secondary)';
                return (
                  <div key={name} className="panel" style={{ padding: 16, borderTop: `2px solid ${color}` }}>
                    <div className="jet-mono" style={{ fontSize: 10, letterSpacing: 1.4, color: 'var(--text-dim)', textTransform: 'uppercase' }}>
                      {label}
                    </div>
                    <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginTop: 10 }}>
                      <div className="jet-mono" style={{ fontSize: 28, fontWeight: 700, color }}>
                        {Math.round(score || 0)}
                      </div>
                      <div style={{ color: 'var(--text-dim)', fontSize: 12 }}>risk score</div>
                    </div>
                    <div style={{ height: 6, background: 'var(--bg-elevated)', borderRadius: 999, overflow: 'hidden', marginTop: 12 }}>
                      <div style={{ width: `${Math.min(100, score || 0)}%`, height: '100%', background: color, borderRadius: 999, transition: 'width 600ms ease' }} />
                    </div>
                    <div style={{ marginTop: 10, fontSize: 12, color: 'var(--text-secondary)' }}>
                      {Array.isArray(payload?.flags) ? `${payload.flags.length} FLAGS DETECTED` : 'NO FLAGS RETURNED'}
                    </div>
                  </div>
                );
              })}
            </div>

            {Number(agentBreakdown.acp_messages || 0) > 0 && (
              <div className="panel" style={{ padding: 14, background: 'rgba(0,212,255,0.04)' }}>
                <div className="jet-mono" style={{ fontSize: 11, color: 'var(--cyan)' }}>
                  {agentBreakdown.acp_messages} INTER-AGENT MESSAGES EXCHANGED VIA ACP
                </div>
              </div>
            )}

            {agentBreakdown.pipeline_steps?.length > 0 && (
              <div className="panel" style={{ padding: 14 }}>
                <div className="jet-mono" style={{ fontSize: 11, color: 'var(--text-dim)', marginBottom: 8 }}>
                  PIPELINE STEPS
                </div>
                <pre style={{ margin: 0, fontSize: 11, color: 'var(--text-secondary)', whiteSpace: 'pre-wrap', wordBreak: 'break-word', fontFamily: 'JetBrains Mono, monospace', lineHeight: 1.5 }}>
                  {JSON.stringify(agentBreakdown.pipeline_steps, null, 2)}
                </pre>
              </div>
            )}
          </div>
        ) : (
          <div style={{ color: 'var(--text-dim)', fontSize: 13 }}>Open an analyzed invoice to inspect the agent results here.</div>
        )}
      </div>

      <div className="panel" style={{ padding: 22, marginBottom: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
          <AlertTriangle size={16} color="var(--amber)" />
          <h3 style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)' }}>DETECTED FLAGS ({flags.length})</h3>
        </div>
        {flags.length === 0 ? (
          <div style={{ color: 'var(--text-dim)', fontSize: 13 }}>No specific flags raised.</div>
        ) : (
          <div style={{ display: 'grid', gap: 10 }}>
            {flags.map((flag, index) => (
              <div key={index} className="panel" style={{ padding: 14, borderLeft: `3px solid ${SEV_COLORS[flag.severity] || 'var(--text-secondary)'}` }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, marginBottom: 6, flexWrap: 'wrap' }}>
                  <div className="jet-mono" style={{ fontSize: 11, letterSpacing: 1.2, textTransform: 'uppercase', color: SEV_COLORS[flag.severity] || 'var(--text-secondary)' }}>
                    {flag.type?.replace(/_/g, ' ')}
                  </div>
                  <div className="jet-mono" style={{ fontSize: 10, color: SEV_COLORS[flag.severity] || 'var(--text-secondary)', textTransform: 'uppercase' }}>
                    {flag.severity}
                  </div>
                </div>
                <div style={{ fontSize: 14, color: 'var(--text-primary)', lineHeight: 1.6 }}>{flag.description}</div>
                {flag.evidence && (
                  <div className="jet-mono" style={{ fontSize: 12, color: 'var(--text-dim)', marginTop: 6, fontStyle: 'italic' }}>
                    {flag.evidence}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
