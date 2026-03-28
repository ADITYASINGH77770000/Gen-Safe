import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, CheckCircle, XCircle, AlertTriangle, Shield, Brain, Activity, ScanSearch } from 'lucide-react';
import { alertApi, invoiceApi } from '../services/api';

const card = (extra={}) => ({ background:'#12121a', border:'1px solid #1e1e2e', borderRadius:12, padding:20, ...extra });
const RISK_COLORS = { critical:'#ef4444', high:'#f97316', medium:'#eab308', low:'#22c55e' };
const SEV_COLORS = { high:'#ef4444', medium:'#f97316', low:'#eab308' };

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
    alertApi.get(id).then(r => setAlert(r.data)).catch(console.error).finally(() => setLoading(false));
  }, [id]);

  useEffect(() => {
    const invoiceId = alert?.invoice_id;
    if (!invoiceId) return;

    let active = true;
    setAgentLoading(true);
    setAgentError('');

    invoiceApi.agents(invoiceId)
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
      setDone(wasCorrect ? 'Confirmed as fraud — system learning updated.' : 'Marked as false positive — model will be retrained.');
      setAlert(prev => ({ ...prev, status: wasCorrect ? 'resolved' : 'false_positive' }));
    } catch(e) {
      setDone('Error submitting feedback.');
    } finally { setSubmitting(false); }
  };

  if (loading) return <div style={{ color:'#6b7280', textAlign:'center', padding:60 }}>Loading alert...</div>;
  if (!alert) return <div style={{ color:'#ef4444', textAlign:'center', padding:60 }}>Alert not found.</div>;

  const flags = Array.isArray(alert.flags) ? alert.flags : [];
  const riskColor = RISK_COLORS[alert.risk_level] || '#6b7280';

  return (
    <div>
      <button onClick={() => navigate('/alerts')} style={{ display:'flex', alignItems:'center', gap:6, color:'#9ca3af', background:'none', border:'none', cursor:'pointer', fontSize:13, marginBottom:20 }}>
        <ArrowLeft size={14}/> Back to alerts
      </button>

      {/* Header */}
      <div style={{ ...card(), marginBottom:16, borderLeft:`4px solid ${riskColor}` }}>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', flexWrap:'wrap', gap:12 }}>
          <div>
            <h1 style={{ fontSize:20, fontWeight:700, color:'#e2e8f0', marginBottom:4 }}>
              <AlertTriangle size={18} color={riskColor} style={{ marginRight:8, verticalAlign:'middle' }}/>
              {alert.supplier_name || 'Unknown Supplier'}
            </h1>
            <p style={{ fontSize:13, color:'#6b7280' }}>Invoice {alert.invoice_number} · {alert.currency} {Number(alert.amount||0).toLocaleString()}</p>
          </div>
          <div style={{ textAlign:'right' }}>
            <div style={{ fontSize:42, fontWeight:800, color:riskColor, lineHeight:1 }}>{Math.round(alert.risk_score||0)}</div>
            <div style={{ fontSize:12, color:'#6b7280' }}>Risk Score / 100</div>
          </div>
        </div>
      </div>

      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:16, marginBottom:16 }}>
        {/* Explanation */}
        <div style={{ ...card(), gridColumn:'1/-1' }}>
          <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:12 }}>
            <Brain size={16} color="#a78bfa"/>
            <h3 style={{ fontSize:14, fontWeight:600, color:'#e2e8f0' }}>AI Explanation</h3>
          </div>
          <p style={{ fontSize:13, color:'#d1d5db', lineHeight:1.7, whiteSpace:'pre-wrap' }}>
            {alert.explanation_text || 'No explanation generated.'}
          </p>
          {alert.recommended_action && (
            <div style={{ marginTop:12, padding:'10px 14px', background:'rgba(75,60,167,0.15)', borderRadius:8, border:'1px solid rgba(75,60,167,0.3)' }}>
              <p style={{ fontSize:12, color:'#a78bfa', fontWeight:600, marginBottom:2 }}>RECOMMENDED ACTION</p>
              <p style={{ fontSize:13, color:'#d1d5db' }}>{alert.recommended_action}</p>
            </div>
          )}
        </div>

        {(alert.ocr_fields || alert.extracted_text_preview) && (
          <div style={{ ...card(), gridColumn:'1/-1' }}>
            <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:12 }}>
              <ScanSearch size={16} color="#38bdf8" />
              <h3 style={{ fontSize:14, fontWeight:600, color:'#e2e8f0' }}>OCR Parsed Fields</h3>
              {alert.ocr_fields?.confidence != null && (
                <span style={{ marginLeft:'auto', fontSize:11, color:'#94a3b8' }}>
                  Confidence {Math.round((alert.ocr_fields.confidence || 0) * 100)}%
                </span>
              )}
            </div>
            {alert.ocr_fields && (
              <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(180px,1fr))', gap:10, marginBottom:12 }}>
                {[
                  ['invoice_number', alert.ocr_fields.invoice_number],
                  ['supplier_name', alert.ocr_fields.supplier_name],
                  ['currency', alert.ocr_fields.currency],
                  ['total_amount', alert.ocr_fields.total_amount],
                  ['subtotal', alert.ocr_fields.subtotal],
                  ['tax', alert.ocr_fields.tax],
                  ['discount', alert.ocr_fields.discount],
                ].map(([label, value]) => (
                  <div key={label} style={{ padding:'10px 12px', background:'#1a1a2e', borderRadius:8, border:'1px solid #2d2d44' }}>
                    <div style={{ fontSize:11, color:'#6b7280', textTransform:'uppercase', letterSpacing:0.5, marginBottom:4 }}>{label}</div>
                    <div style={{ fontSize:13, color:'#e2e8f0', wordBreak:'break-word' }}>{value != null && value !== '' ? String(value) : 'n/a'}</div>
                  </div>
                ))}
              </div>
            )}
            {alert.extracted_text_preview && (
              <div style={{ marginTop:8, padding:12, background:'#1a1a2e', borderRadius:8, border:'1px solid #2d2d44' }}>
                <div style={{ fontSize:11, color:'#6b7280', textTransform:'uppercase', letterSpacing:0.5, marginBottom:6 }}>
                  OCR Text Preview
                </div>
                <pre style={{ margin:0, fontSize:11, color:'#9ca3af', whiteSpace:'pre-wrap', wordBreak:'break-word', fontFamily:'inherit', lineHeight:1.5, maxHeight:180, overflow:'auto' }}>
                  {alert.extracted_text_preview}
                </pre>
              </div>
            )}
          </div>
        )}

        <div style={{ ...card(), gridColumn:'1/-1' }}>
          <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:12 }}>
            <Activity size={16} color="#38bdf8" />
            <h3 style={{ fontSize:14, fontWeight:600, color:'#e2e8f0' }}>Agent Breakdown</h3>
          </div>
          {agentLoading ? (
            <p style={{ fontSize:13, color:'#6b7280' }}>Loading agent results...</p>
          ) : agentError ? (
            <p style={{ fontSize:13, color:'#fca5a5' }}>{agentError}</p>
          ) : agentBreakdown ? (
            <div style={{ display:'grid', gap:12 }}>
              <div style={{ display:'flex', gap:12, flexWrap:'wrap' }}>
                <div style={{ padding:'10px 12px', background:'#1a1a2e', borderRadius:8, minWidth:140 }}>
                  <div style={{ fontSize:11, color:'#6b7280', marginBottom:4 }}>Risk Score</div>
                  <div style={{ fontSize:18, fontWeight:700, color:'#e2e8f0' }}>{Math.round(agentBreakdown.risk_score || alert.risk_score || 0)}</div>
                </div>
                <div style={{ padding:'10px 12px', background:'#1a1a2e', borderRadius:8, minWidth:140 }}>
                  <div style={{ fontSize:11, color:'#6b7280', marginBottom:4 }}>Decision</div>
                  <div style={{ fontSize:18, fontWeight:700, color:'#e2e8f0' }}>{agentBreakdown.decision || 'unknown'}</div>
                </div>
                <div style={{ padding:'10px 12px', background:'#1a1a2e', borderRadius:8, minWidth:140 }}>
                  <div style={{ fontSize:11, color:'#6b7280', marginBottom:4 }}>Trace ID</div>
                  <div style={{ fontSize:12, fontWeight:600, color:'#e2e8f0', wordBreak:'break-all' }}>{agentBreakdown.trace_id || 'n/a'}</div>
                </div>
              </div>
              <div style={{ display:'grid', gap:8 }}>
                {Object.entries(agentBreakdown.agents || {}).map(([name, payload]) => {
                  const asText = payload ? (typeof payload === 'string' ? payload : JSON.stringify(payload, null, 2)) : 'No data returned.';
                  return (
                    <div key={name} style={{ padding:'10px 12px', background:'#1a1a2e', borderRadius:8 }}>
                      <div style={{ display:'flex', justifyContent:'space-between', gap:12, marginBottom:6 }}>
                        <span style={{ fontSize:12, fontWeight:700, color:'#e2e8f0', textTransform:'uppercase' }}>{name}</span>
                      </div>
                      <pre style={{ margin:0, fontSize:11, color:'#9ca3af', whiteSpace:'pre-wrap', wordBreak:'break-word', fontFamily:'inherit', lineHeight:1.5 }}>{asText}</pre>
                    </div>
                  );
                })}
                {(agentBreakdown.pipeline_steps?.length > 0) && (
                  <div style={{ padding:'10px 12px', background:'#1a1a2e', borderRadius:8 }}>
                    <div style={{ fontSize:12, fontWeight:700, color:'#e2e8f0', marginBottom:6 }}>Pipeline Steps</div>
                    <pre style={{ margin:0, fontSize:11, color:'#9ca3af', whiteSpace:'pre-wrap', wordBreak:'break-word', fontFamily:'inherit', lineHeight:1.5 }}>{JSON.stringify(agentBreakdown.pipeline_steps, null, 2)}</pre>
                  </div>
                )}
              </div>
            </div>
          ) : (
            <p style={{ fontSize:13, color:'#6b7280' }}>Open an analyzed invoice to inspect the agent results here.</p>
          )}
        </div>

        {/* Flags */}
        <div style={card()}>
          <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:12 }}>
            <Shield size={16} color="#f97316"/>
            <h3 style={{ fontSize:14, fontWeight:600, color:'#e2e8f0' }}>Detected Flags ({flags.length})</h3>
          </div>
          {flags.length === 0 ? (
            <p style={{ fontSize:13, color:'#4b5563' }}>No specific flags raised.</p>
          ) : (
            <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
              {flags.map((f, i) => (
                <div key={i} style={{ padding:'10px 12px', background:'#1a1a2e', borderRadius:8, borderLeft:`3px solid ${SEV_COLORS[f.severity]||'#6b7280'}` }}>
                  <div style={{ display:'flex', justifyContent:'space-between', marginBottom:4 }}>
                    <span style={{ fontSize:12, fontWeight:600, color:'#e2e8f0' }}>{f.type?.replace(/_/g,' ')}</span>
                    <span style={{ fontSize:10, color:SEV_COLORS[f.severity]||'#6b7280', textTransform:'uppercase', fontWeight:600 }}>{f.severity}</span>
                  </div>
                  <p style={{ fontSize:12, color:'#9ca3af', marginBottom:4 }}>{f.description}</p>
                  {f.evidence && <p style={{ fontSize:11, color:'#6b7280', fontStyle:'italic' }}>{f.evidence}</p>}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Analyst Action */}
        <div style={card()}>
          <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:12 }}>
            <Activity size={16} color="#22c55e"/>
            <h3 style={{ fontSize:14, fontWeight:600, color:'#e2e8f0' }}>Analyst Decision</h3>
          </div>

          {done ? (
            <div style={{ padding:'14px', background:'rgba(20,83,45,0.2)', border:'1px solid #14532d', borderRadius:8, color:'#86efac', fontSize:13 }}>{done}</div>
          ) : alert.status !== 'open' ? (
            <div style={{ padding:'14px', background:'#1a1a2e', borderRadius:8, color:'#6b7280', fontSize:13 }}>
              Status: <strong style={{ color:'#e2e8f0' }}>{alert.status?.replace('_',' ')}</strong>
            </div>
          ) : (
            <>
              <textarea value={note} onChange={e=>setNote(e.target.value)} placeholder="Optional analyst note..."
                style={{ width:'100%', minHeight:80, background:'#1a1a2e', border:'1px solid #2d2d44', borderRadius:8, padding:'10px 12px', color:'#e2e8f0', fontSize:13, resize:'vertical', outline:'none', marginBottom:12 }} />
              <div style={{ display:'flex', gap:10 }}>
                <button onClick={() => submitFeedback(true)} disabled={submitting}
                  style={{ flex:1, padding:'10px', background:'rgba(239,68,68,0.15)', border:'1px solid #ef4444', borderRadius:8, color:'#fca5a5', cursor:'pointer', fontSize:13, fontWeight:600, display:'flex', alignItems:'center', justifyContent:'center', gap:6 }}>
                  <XCircle size={14}/> Confirm Fraud
                </button>
                <button onClick={() => submitFeedback(false)} disabled={submitting}
                  style={{ flex:1, padding:'10px', background:'rgba(34,197,94,0.15)', border:'1px solid #22c55e', borderRadius:8, color:'#86efac', cursor:'pointer', fontSize:13, fontWeight:600, display:'flex', alignItems:'center', justifyContent:'center', gap:6 }}>
                  <CheckCircle size={14}/> False Positive
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
