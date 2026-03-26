import React, { useState, useEffect } from 'react';
import { auditApi } from '../services/api';
import { BookOpen, Shield, Brain, Activity, Search } from 'lucide-react';

const card = { background:'#12121a', border:'1px solid #1e1e2e', borderRadius:12, padding:20 };
const inp = { background:'#1a1a2e', border:'1px solid #2d2d44', borderRadius:8, padding:'8px 12px', color:'#e2e8f0', fontSize:13, outline:'none' };

const AGENT_COLORS = {
  orchestrator: '#a78bfa',
  llm_analysis_agent: '#38bdf8',
  anomaly_detection_agent: '#fb923c',
  risk_aggregator: '#f472b6',
  verification_audit_agent: '#34d399',
  mock_analysis: '#6b7280',
};

const AGENT_ICONS = {
  orchestrator: Shield,
  llm_analysis_agent: Brain,
  anomaly_detection_agent: Activity,
};

export default function AuditTrail() {
  const [records, setRecords] = useState([]);
  const [stats, setStats] = useState([]);
  const [loading, setLoading] = useState(true);
  const [invoiceFilter, setInvoiceFilter] = useState('');
  const [expanded, setExpanded] = useState(null);

  useEffect(() => {
    load();
    auditApi.stats().then(r => setStats(r.data.agent_stats||[])).catch(console.error);
  }, []);

  const load = (invoice_id='') => {
    setLoading(true);
    auditApi.trail({ invoice_id: invoice_id||undefined, limit:100 })
      .then(r => setRecords(r.data.audit_records||[]))
      .catch(console.error)
      .finally(() => setLoading(false));
  };

  const search = () => load(invoiceFilter.trim());

  const agentColor = (id) => AGENT_COLORS[id] || '#6b7280';

  return (
    <div>
      <div style={{ marginBottom:24 }}>
        <h1 style={{ fontSize:22, fontWeight:700, color:'#e2e8f0', display:'flex', alignItems:'center', gap:10 }}>
          <BookOpen size={20} color="#a78bfa"/> Audit Trail
        </h1>
        <p style={{ fontSize:13, color:'#6b7280', marginTop:4 }}>Immutable record of every agent decision — append-only, never modified</p>
      </div>

      {/* Agent stats */}
      {stats.length > 0 && (
        <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(160px,1fr))', gap:12, marginBottom:20 }}>
          {stats.map(s => (
            <div key={s.agent_id} style={{ ...card, padding:14 }}>
              <p style={{ fontSize:11, color:agentColor(s.agent_id), fontWeight:600, textTransform:'uppercase', marginBottom:4 }}>{s.agent_id?.replace(/_/g,' ')}</p>
              <p style={{ fontSize:22, fontWeight:700, color:'#e2e8f0' }}>{s.actions}</p>
              <p style={{ fontSize:11, color:'#6b7280' }}>actions · avg {Math.round(s.avg_ms||0)}ms</p>
            </div>
          ))}
        </div>
      )}

      {/* Filter */}
      <div style={{ display:'flex', gap:10, marginBottom:16 }}>
        <input style={{ ...inp, flex:1 }} placeholder="Filter by invoice ID..." value={invoiceFilter} onChange={e=>setInvoiceFilter(e.target.value)}
          onKeyDown={e => e.key==='Enter' && search()} />
        <button onClick={search}
          style={{ padding:'8px 16px', background:'#2D1B6E', border:'1px solid #4B3CA7', borderRadius:8, color:'#a78bfa', cursor:'pointer', fontSize:13, display:'flex', alignItems:'center', gap:6 }}>
          <Search size={13}/> Search
        </button>
        <button onClick={() => { setInvoiceFilter(''); load(''); }}
          style={{ padding:'8px 14px', background:'transparent', border:'1px solid #2d2d44', borderRadius:8, color:'#6b7280', cursor:'pointer', fontSize:13 }}>
          Clear
        </button>
      </div>

      {/* Records */}
      <div style={card}>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:16 }}>
          <h3 style={{ fontSize:14, fontWeight:600, color:'#e2e8f0' }}>Decision Records ({records.length})</h3>
          <div style={{ display:'flex', alignItems:'center', gap:6, fontSize:11, color:'#6b7280' }}>
            <Shield size={12} color="#22c55e"/> Append-only · Tamper-proof
          </div>
        </div>

        {loading ? (
          <div style={{ textAlign:'center', padding:40, color:'#6b7280', fontSize:13 }}>Loading audit records...</div>
        ) : records.length === 0 ? (
          <div style={{ textAlign:'center', padding:40, color:'#4b5563', fontSize:13 }}>
            No audit records yet. Submit an invoice to generate agent decision records.
          </div>
        ) : (
          <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
            {records.map(r => {
              const isExp = expanded === r.id;
              const color = agentColor(r.agent_id);
              return (
                <div key={r.id} style={{ borderRadius:8, border:`1px solid ${isExp?color+'60':'#2d2d44'}`, overflow:'hidden' }}>
                  <div onClick={() => setExpanded(isExp?null:r.id)}
                    style={{ display:'flex', alignItems:'center', gap:12, padding:'10px 14px', cursor:'pointer', background: isExp?'#1a1a2e':'transparent' }}>
                    <div style={{ width:8, height:8, borderRadius:'50%', background:color, flexShrink:0 }}/>
                    <div style={{ flex:1, minWidth:0 }}>
                      <div style={{ display:'flex', alignItems:'center', gap:10, flexWrap:'wrap' }}>
                        <span style={{ fontSize:12, color, fontWeight:600 }}>{r.agent_id?.replace(/_/g,' ')}</span>
                        <span style={{ fontSize:12, color:'#e2e8f0' }}>{r.action?.replace(/_/g,' ')}</span>
                        {r.status === 'failed' && <span style={{ fontSize:10, color:'#fca5a5', background:'rgba(239,68,68,0.15)', padding:'1px 6px', borderRadius:10 }}>FAILED</span>}
                      </div>
                      <div style={{ display:'flex', gap:12, marginTop:3, flexWrap:'wrap' }}>
                        <span style={{ fontSize:10, color:'#4b5563', fontFamily:'monospace' }}>trace:{r.trace_id?.slice(0,8)}</span>
                        <span style={{ fontSize:10, color:'#4b5563' }}>{r.created_at?.slice(0,19)?.replace('T',' ')}</span>
                        {r.duration_ms && <span style={{ fontSize:10, color:'#4b5563' }}>{r.duration_ms}ms</span>}
                      </div>
                    </div>
                    <span style={{ fontSize:11, color:'#4b5563' }}>{isExp?'▲':'▼'}</span>
                  </div>

                  {isExp && (
                    <div style={{ padding:'12px 14px', background:'#0f0f13', borderTop:'1px solid #1e1e2e' }}>
                      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
                        <div>
                          <p style={{ fontSize:11, color:'#6b7280', marginBottom:6, fontWeight:600 }}>INPUT HASH</p>
                          <code style={{ fontSize:11, color:'#9ca3af' }}>{r.input_hash}</code>
                        </div>
                        <div>
                          <p style={{ fontSize:11, color:'#6b7280', marginBottom:6, fontWeight:600 }}>OUTPUT HASH</p>
                          <code style={{ fontSize:11, color:'#9ca3af' }}>{r.output_hash}</code>
                        </div>
                        {r.output_data && (
                          <div style={{ gridColumn:'1/-1' }}>
                            <p style={{ fontSize:11, color:'#6b7280', marginBottom:6, fontWeight:600 }}>OUTPUT DATA</p>
                            <pre style={{ fontSize:11, color:'#a78bfa', background:'#12121a', padding:'10px 12px', borderRadius:6, overflow:'auto', maxHeight:200, border:'1px solid #1e1e2e' }}>
                              {JSON.stringify(typeof r.output_data==='string'?JSON.parse(r.output_data):r.output_data, null, 2)}
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
