import React, { useState, useEffect } from 'react';
import { supplierApi } from '../services/api';
import { Plus, Users, AlertTriangle } from 'lucide-react';

const card = { background:'#12121a', border:'1px solid #1e1e2e', borderRadius:12, padding:20 };
const inp = { background:'#1a1a2e', border:'1px solid #2d2d44', borderRadius:8, padding:'9px 12px', color:'#e2e8f0', fontSize:13, outline:'none', width:'100%' };

export default function Suppliers() {
  const [suppliers, setSuppliers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ name:'', email:'', country:'', bank_account_iban:'', currency:'USD' });
  const [msg, setMsg] = useState('');

  useEffect(() => { load(); }, []);
  const load = () => supplierApi.list().then(r => setSuppliers(r.data.suppliers||[])).catch(console.error).finally(()=>setLoading(false));

  const register = async () => {
    if (!form.name) { setMsg('Name is required'); return; }
    try {
      await supplierApi.register(form);
      setMsg('Supplier registered!');
      setForm({ name:'', email:'', country:'', bank_account_iban:'', currency:'USD' });
      setShowForm(false); load();
    } catch(e) { setMsg(e.response?.data?.detail || 'Registration failed'); }
  };

  const riskColor = r => ({ low:'#22c55e', medium:'#eab308', high:'#f97316', critical:'#ef4444' }[r] || '#6b7280');

  return (
    <div>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:24 }}>
        <h1 style={{ fontSize:22, fontWeight:700, color:'#e2e8f0' }}>Suppliers</h1>
        <button onClick={()=>setShowForm(!showForm)} style={{ display:'flex', alignItems:'center', gap:8, padding:'8px 16px', background:'#2D1B6E', border:'1px solid #4B3CA7', borderRadius:8, color:'#a78bfa', cursor:'pointer', fontSize:13, fontWeight:600 }}>
          <Plus size={14}/> Add Supplier
        </button>
      </div>

      {showForm && (
        <div style={{ ...card, marginBottom:20, borderColor:'#4B3CA7' }}>
          <h3 style={{ fontSize:14, fontWeight:600, color:'#e2e8f0', marginBottom:14 }}>Register New Supplier</h3>
          <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(200px,1fr))', gap:12, marginBottom:14 }}>
            {[['name','Company Name *'],['email','Email'],['country','Country'],['bank_account_iban','Bank IBAN']].map(([k,p]) => (
              <input key={k} style={inp} placeholder={p} value={form[k]} onChange={e=>setForm({...form,[k]:e.target.value})}/>
            ))}
            <select style={inp} value={form.currency} onChange={e=>setForm({...form,currency:e.target.value})}>
              {['USD','EUR','GBP','INR','AED'].map(c=><option key={c}>{c}</option>)}
            </select>
          </div>
          {msg && <p style={{ fontSize:12, color: msg.includes('!') ? '#86efac':'#fca5a5', marginBottom:10 }}>{msg}</p>}
          <div style={{ display:'flex', gap:10 }}>
            <button onClick={register} style={{ padding:'8px 20px', background:'#4B3CA7', border:'none', borderRadius:8, color:'#fff', cursor:'pointer', fontSize:13, fontWeight:600 }}>Register</button>
            <button onClick={()=>setShowForm(false)} style={{ padding:'8px 20px', background:'transparent', border:'1px solid #2d2d44', borderRadius:8, color:'#9ca3af', cursor:'pointer', fontSize:13 }}>Cancel</button>
          </div>
        </div>
      )}

      <div style={card}>
        {loading ? <div style={{ textAlign:'center', padding:40, color:'#6b7280', fontSize:13 }}>Loading...</div>
        : suppliers.length === 0 ? <div style={{ textAlign:'center', padding:40, color:'#4b5563', fontSize:13 }}>No suppliers yet.</div>
        : (
          <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
            {suppliers.map(s => (
              <div key={s.supplier_id} style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'12px 16px', background:'#1a1a2e', borderRadius:10, border:'1px solid #2d2d44' }}>
                <div style={{ display:'flex', alignItems:'center', gap:12 }}>
                  <div style={{ width:36, height:36, borderRadius:'50%', background:'#2D1B6E', display:'flex', alignItems:'center', justifyContent:'center', fontSize:14, color:'#a78bfa', fontWeight:600 }}>{s.name[0]}</div>
                  <div>
                    <p style={{ fontSize:13, color:'#e2e8f0', fontWeight:500 }}>{s.name}</p>
                    <p style={{ fontSize:11, color:'#6b7280' }}>{s.country || 'Unknown'} · {s.email || 'No email'}</p>
                  </div>
                </div>
                <div style={{ display:'flex', alignItems:'center', gap:10 }}>
                  {s.bank_account_iban && <span style={{ fontSize:11, color:'#6b7280', fontFamily:'monospace' }}>{s.bank_account_iban.slice(0,12)}...</span>}
                  <span style={{ fontSize:11, color:riskColor(s.risk_level), background:`${riskColor(s.risk_level)}20`, padding:'3px 10px', borderRadius:20, fontWeight:600 }}>{s.risk_level||'unknown'}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
