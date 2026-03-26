import React, { useState, useEffect } from 'react';
import { Shield, AlertTriangle, TrendingUp, DollarSign, CheckCircle, Clock, XCircle } from 'lucide-react';
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';
import { dashboardApi, opsApi } from '../services/api';
import { useNavigate } from 'react-router-dom';

const card = { background:'#12121a', border:'1px solid #1e1e2e', borderRadius:12, padding:20 };
const RISK_COLORS = { critical:'#ef4444', high:'#f97316', medium:'#eab308', low:'#22c55e' };

function StatCard({ icon: Icon, label, value, sub, color='#a78bfa' }) {
  return (
    <div style={card}>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start' }}>
        <div>
          <p style={{ fontSize:12, color:'#6b7280', marginBottom:6 }}>{label}</p>
          <p style={{ fontSize:28, fontWeight:700, color:'#e2e8f0' }}>{value}</p>
          {sub && <p style={{ fontSize:11, color:'#6b7280', marginTop:4 }}>{sub}</p>}
        </div>
        <div style={{ width:40, height:40, borderRadius:10, background:`${color}20`, display:'flex', alignItems:'center', justifyContent:'center' }}>
          <Icon size={18} color={color} />
        </div>
      </div>
    </div>
  );
}

function RiskBadge({ level }) {
  const colors = { critical:['#7f1d1d','#fca5a5'], high:['#7c2d12','#fdba74'], medium:['#713f12','#fde68a'], low:['#14532d','#86efac'] };
  const [bg, text] = colors[level] || colors.low;
  return <span style={{ background:`${bg}60`, color:text, padding:'2px 8px', borderRadius:20, fontSize:11, fontWeight:600, textTransform:'uppercase' }}>{level}</span>;
}

export default function Dashboard() {
  const [data, setData] = useState(null);
  const [health, setHealth] = useState(null);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    Promise.all([dashboardApi.summary(), opsApi.health()])
      .then(([summaryRes, healthRes]) => {
        setData(summaryRes.data);
        setHealth(healthRes.data);
      })
      .catch(async () => {
        // Keep existing dashboard behavior even if ops endpoint is unavailable.
        try {
          const fallback = await dashboardApi.summary();
          setData(fallback.data);
        } catch (error) {
          console.error(error);
        }
      })
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div style={{ color:'#6b7280', textAlign:'center', padding:60, fontSize:14 }}>Loading dashboard...</div>;
  if (!data) return <div style={{ color:'#ef4444', textAlign:'center', padding:60 }}>Failed to load. Is the backend running?</div>;

  const riskPie = Object.entries(data.risk_breakdown || {}).map(([name, value]) => ({ name, value }));
  const trend = (data.weekly_trend || []).map(r => ({ day: r.day?.slice(5) || '', invoices: r.invoices, flagged: r.flagged || 0 }));

  return (
    <div>
      <div style={{ marginBottom:24 }}>
        <h1 style={{ fontSize:22, fontWeight:700, color:'#e2e8f0' }}>Dashboard</h1>
        <p style={{ fontSize:13, color:'#6b7280', marginTop:4 }}>Real-time fraud detection overview</p>
      </div>

      {/* Stat cards */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(200px,1fr))', gap:16, marginBottom:24 }}>
        <StatCard icon={FileTextIcon} label="Total Invoices" value={data.total_invoices || 0} sub="All time" color="#a78bfa" />
        <StatCard icon={AlertTriangle} label="Open Alerts" value={data.open_alerts || 0} sub="Requires attention" color="#f97316" />
        <StatCard icon={DollarSign} label="Value Protected" value={`$${(data.value_protected||0).toLocaleString()}`} sub="Blocked payments" color="#22c55e" />
        <StatCard icon={TrendingUp} label="Autonomy Rate" value={`${data.autonomous_rate||85}%`} sub="Steps without human" color="#38bdf8" />
        <StatCard icon={Shield} label="False Positive Rate" value={`${data.false_positive_rate||0}%`} sub="Last 30 days" color="#a78bfa" />
        {health && (
          <StatCard
            icon={health.status === 'critical' ? AlertTriangle : health.status === 'warning' ? Clock : CheckCircle}
            label="Workflow Health"
            value={String(health.status || 'unknown').toUpperCase()}
            sub={`Queue ${health.metrics?.queue_depth ?? 0} · Failed24h ${health.metrics?.failed_jobs_last_24h ?? 0}`}
            color={health.status === 'critical' ? '#ef4444' : health.status === 'warning' ? '#f97316' : '#22c55e'}
          />
        )}
      </div>

      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:16, marginBottom:24 }}>
        {/* Weekly trend */}
        <div style={card}>
          <h3 style={{ fontSize:14, fontWeight:600, color:'#e2e8f0', marginBottom:16 }}>Weekly Invoice Volume</h3>
          {trend.length > 0 ? (
            <ResponsiveContainer width="100%" height={180}>
              <BarChart data={trend}>
                <XAxis dataKey="day" tick={{ fill:'#6b7280', fontSize:11 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fill:'#6b7280', fontSize:11 }} axisLine={false} tickLine={false} />
                <Tooltip contentStyle={{ background:'#1a1a2e', border:'1px solid #2d2d44', borderRadius:8, color:'#e2e8f0', fontSize:12 }} />
                <Bar dataKey="invoices" fill="#4B3CA7" radius={[4,4,0,0]} name="Total" />
                <Bar dataKey="flagged" fill="#ef4444" radius={[4,4,0,0]} name="Flagged" />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div style={{ height:180, display:'flex', alignItems:'center', justifyContent:'center', color:'#4b5563', fontSize:13 }}>
              Submit invoices to see trend data
            </div>
          )}
        </div>

        {/* Risk breakdown */}
        <div style={card}>
          <h3 style={{ fontSize:14, fontWeight:600, color:'#e2e8f0', marginBottom:16 }}>Risk Level Breakdown</h3>
          {riskPie.length > 0 ? (
            <ResponsiveContainer width="100%" height={180}>
              <PieChart>
                <Pie data={riskPie} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={70} label={({name, value}) => `${name}: ${value}`} labelLine={false} fontSize={11}>
                  {riskPie.map((entry, i) => <Cell key={i} fill={RISK_COLORS[entry.name] || '#6b7280'} />)}
                </Pie>
                <Tooltip contentStyle={{ background:'#1a1a2e', border:'1px solid #2d2d44', borderRadius:8, color:'#e2e8f0', fontSize:12 }} />
              </PieChart>
            </ResponsiveContainer>
          ) : (
            <div style={{ height:180, display:'flex', alignItems:'center', justifyContent:'center', color:'#4b5563', fontSize:13 }}>
              No risk data yet
            </div>
          )}
        </div>
      </div>

      {/* Recent Alerts */}
      <div style={card}>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:16 }}>
          <h3 style={{ fontSize:14, fontWeight:600, color:'#e2e8f0' }}>Recent Alerts</h3>
          <button onClick={() => navigate('/alerts')} style={{ fontSize:12, color:'#a78bfa', background:'none', border:'none', cursor:'pointer' }}>View all →</button>
        </div>
        {(data.recent_alerts || []).length === 0 ? (
          <div style={{ textAlign:'center', padding:32, color:'#4b5563', fontSize:13 }}>No alerts yet. Submit an invoice to see results.</div>
        ) : (
          <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
            {data.recent_alerts.map(a => (
              <div key={a.alert_id} onClick={() => navigate(`/alerts/${a.alert_id}`)}
                style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'12px 16px', background:'#1a1a2e', borderRadius:8, cursor:'pointer', border:'1px solid #2d2d44' }}>
                <div style={{ display:'flex', alignItems:'center', gap:12 }}>
                  <AlertTriangle size={15} color={RISK_COLORS[a.risk_level] || '#6b7280'} />
                  <div>
                    <p style={{ fontSize:13, color:'#e2e8f0', fontWeight:500 }}>{a.supplier_name || 'Unknown Supplier'}</p>
                    <p style={{ fontSize:11, color:'#6b7280' }}>{a.invoice_number} · {a.amount} {a.currency}</p>
                  </div>
                </div>
                <div style={{ display:'flex', alignItems:'center', gap:12 }}>
                  <span style={{ fontSize:13, fontWeight:700, color: a.risk_score >= 80 ? '#ef4444' : a.risk_score >= 60 ? '#f97316' : '#eab308' }}>{Math.round(a.risk_score || 0)}</span>
                  <RiskBadge level={a.risk_level || 'low'} />
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
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>;
}
