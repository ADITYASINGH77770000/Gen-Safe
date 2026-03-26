import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { AlertTriangle, CheckCircle, XCircle, Clock, Filter } from 'lucide-react';
import { alertApi } from '../services/api';

const card = { background:'#12121a', border:'1px solid #1e1e2e', borderRadius:12, padding:20 };
const RISK_COLORS = { critical:'#ef4444', high:'#f97316', medium:'#eab308', low:'#22c55e', unknown:'#6b7280' };

function RiskBadge({ level }) {
  const color = RISK_COLORS[level] || '#6b7280';
  return <span style={{ background:`${color}20`, color, padding:'3px 10px', borderRadius:20, fontSize:11, fontWeight:600, textTransform:'uppercase', border:`1px solid ${color}40` }}>{level}</span>;
}

function StatusBadge({ status }) {
  const map = { open:['#1d4ed8','#93c5fd'], resolved:['#14532d','#86efac'], false_positive:['#713f12','#fde68a'] };
  const [bg, text] = map[status] || ['#374151','#9ca3af'];
  return <span style={{ background:`${bg}60`, color:text, padding:'3px 10px', borderRadius:20, fontSize:11, fontWeight:500 }}>{status?.replace('_',' ')}</span>;
}

export default function Alerts() {
  const [alerts, setAlerts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('');
  const navigate = useNavigate();

  const load = (status='') => {
    setLoading(true);
    alertApi.list({ status: status || undefined, limit:100 })
      .then(r => setAlerts(r.data.alerts || []))
      .catch(console.error)
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const handleFilter = (s) => { setFilter(s); load(s); };

  return (
    <div>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:24 }}>
        <div>
          <h1 style={{ fontSize:22, fontWeight:700, color:'#e2e8f0' }}>Alert Queue</h1>
          <p style={{ fontSize:13, color:'#6b7280', marginTop:4 }}>{alerts.length} alerts found</p>
        </div>
        <div style={{ display:'flex', gap:8 }}>
          {['','open','resolved','false_positive'].map(s => (
            <button key={s} onClick={() => handleFilter(s)}
              style={{ padding:'6px 14px', borderRadius:8, border:'1px solid', fontSize:12, cursor:'pointer', fontWeight:500,
                borderColor: filter===s ? '#4B3CA7' : '#2d2d44',
                background: filter===s ? '#2D1B6E' : '#12121a',
                color: filter===s ? '#a78bfa' : '#6b7280' }}>
              {s || 'All'}
            </button>
          ))}
        </div>
      </div>

      <div style={card}>
        {loading ? (
          <div style={{ textAlign:'center', padding:40, color:'#6b7280', fontSize:13 }}>Loading alerts...</div>
        ) : alerts.length === 0 ? (
          <div style={{ textAlign:'center', padding:40, color:'#4b5563', fontSize:13 }}>
            No alerts found. Submit invoices via the Invoices page to see AI detection results.
          </div>
        ) : (
          <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
            {alerts.map(a => (
              <div key={a.alert_id} onClick={() => navigate(`/alerts/${a.alert_id}`)}
                style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'14px 16px', background:'#1a1a2e', borderRadius:10, cursor:'pointer', border:'1px solid #2d2d44', transition:'border-color .15s' }}
                onMouseEnter={e => e.currentTarget.style.borderColor='#4B3CA7'}
                onMouseLeave={e => e.currentTarget.style.borderColor='#2d2d44'}>
                <div style={{ display:'flex', alignItems:'center', gap:14 }}>
                  <AlertTriangle size={16} color={RISK_COLORS[a.risk_level] || '#6b7280'} />
                  <div>
                    <p style={{ fontSize:14, color:'#e2e8f0', fontWeight:500 }}>{a.supplier_name || 'Unknown Supplier'}</p>
                    <p style={{ fontSize:12, color:'#6b7280', marginTop:2 }}>
                      {a.invoice_number} · {a.currency} {Number(a.amount||0).toLocaleString()} · {a.created_at?.slice(0,10)}
                    </p>
                  </div>
                </div>
                <div style={{ display:'flex', alignItems:'center', gap:12, flexShrink:0 }}>
                  <div style={{ textAlign:'right' }}>
                    <span style={{ fontSize:20, fontWeight:700, color: (a.risk_score||0)>=80?'#ef4444':(a.risk_score||0)>=60?'#f97316':'#eab308' }}>{Math.round(a.risk_score||0)}</span>
                    <span style={{ fontSize:11, color:'#6b7280' }}>/100</span>
                  </div>
                  <RiskBadge level={a.risk_level || 'unknown'} />
                  <StatusBadge status={a.status} />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
