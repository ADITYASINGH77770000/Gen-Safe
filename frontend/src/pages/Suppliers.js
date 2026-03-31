import React, { useEffect, useState } from 'react';
import { Plus, Users, Shield, ArrowRight } from 'lucide-react';
import { supplierApi } from '../services/api';

export default function Suppliers() {
  const [suppliers, setSuppliers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ name: '', email: '', country: '', bank_account_iban: '', currency: 'USD' });
  const [msg, setMsg] = useState('');

  useEffect(() => {
    load();
  }, []);

  const load = () =>
    supplierApi
      .list()
      .then((r) => setSuppliers(r.data.suppliers || []))
      .catch(console.error)
      .finally(() => setLoading(false));

  const register = async () => {
    if (!form.name) {
      setMsg('Name is required');
      return;
    }
    try {
      await supplierApi.register(form);
      setMsg('Supplier registered!');
      setForm({ name: '', email: '', country: '', bank_account_iban: '', currency: 'USD' });
      setShowForm(false);
      load();
    } catch (e) {
      setMsg(e.response?.data?.detail || 'Registration failed');
    }
  };

  const riskColor = (risk) => ({ low: 'var(--green)', medium: 'var(--amber)', high: 'var(--red)', critical: 'var(--red)' }[risk] || 'var(--text-secondary)');

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 22, gap: 16, flexWrap: 'wrap' }}>
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 800, color: 'var(--text-primary)' }}>SUPPLIERS</h1>
          <div className="jet-mono" style={{ fontSize: 11, color: 'var(--text-dim)', marginTop: 8 }}>Supplier intelligence and baseline records</div>
        </div>
        <button
          onClick={() => setShowForm(!showForm)}
          className="pill"
          style={{
            border: '1px solid rgba(0,212,255,0.22)',
            background: 'rgba(0,212,255,0.08)',
            color: 'var(--cyan)',
            cursor: 'pointer',
            height: 38,
          }}
        >
          <Plus size={14} /> ADD SUPPLIER
        </button>
      </div>

      {showForm && (
        <div className="panel" style={{ padding: 20, marginBottom: 20, borderLeft: '3px solid var(--cyan)' }}>
          <h3 style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 14 }}>REGISTER NEW SUPPLIER</h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(200px,1fr))', gap: 12, marginBottom: 14 }}>
            {[
              ['name', 'Company Name *'],
              ['email', 'Email'],
              ['country', 'Country'],
              ['bank_account_iban', 'Bank IBAN'],
            ].map(([key, placeholder]) => (
              <input
                key={key}
                value={form[key]}
                placeholder={placeholder}
                onChange={(e) => setForm({ ...form, [key]: e.target.value })}
                style={{
                  background: 'var(--bg-elevated)',
                  border: '1px solid var(--border)',
                  borderRadius: 10,
                  padding: '10px 12px',
                  color: 'var(--text-primary)',
                  fontSize: 13,
                  outline: 'none',
                }}
              />
            ))}
            <select
              value={form.currency}
              onChange={(e) => setForm({ ...form, currency: e.target.value })}
              style={{
                background: 'var(--bg-elevated)',
                border: '1px solid var(--border)',
                borderRadius: 10,
                padding: '10px 12px',
                color: 'var(--text-primary)',
                fontSize: 13,
                outline: 'none',
              }}
            >
              {['USD', 'EUR', 'GBP', 'INR', 'AED'].map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
          </div>
          {msg && <p style={{ fontSize: 12, color: msg.includes('!') ? 'var(--green)' : 'var(--red)', marginBottom: 10 }}>{msg}</p>}
          <div style={{ display: 'flex', gap: 10 }}>
            <button
              onClick={register}
              style={{
                padding: '10px 18px',
                background: 'linear-gradient(135deg, var(--violet-dim), var(--violet))',
                border: '1px solid var(--violet)',
                borderRadius: 10,
                color: '#fff',
                cursor: 'pointer',
                fontSize: 13,
                fontWeight: 700,
              }}
            >
              Register
            </button>
            <button
              onClick={() => setShowForm(false)}
              style={{
                padding: '10px 18px',
                background: 'var(--bg-surface)',
                border: '1px solid var(--border)',
                borderRadius: 10,
                color: 'var(--text-secondary)',
                cursor: 'pointer',
                fontSize: 13,
              }}
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      <div className="panel" style={{ padding: 20 }}>
        {loading ? (
          <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-dim)', fontSize: 13 }}>Loading...</div>
        ) : suppliers.length === 0 ? (
          <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-dim)', fontSize: 13 }}>No suppliers yet.</div>
        ) : (
          <div style={{ display: 'grid', gap: 10 }}>
            {suppliers.map((supplier) => (
              <div
                key={supplier.supplier_id}
                className="panel panel-hover"
                style={{ padding: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 }}>
                  <div
                    style={{
                      width: 40,
                      height: 40,
                      borderRadius: 14,
                      background: 'linear-gradient(135deg, rgba(0,212,255,0.18), rgba(124,111,255,0.22))',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      color: 'var(--text-primary)',
                      fontWeight: 700,
                    }}
                  >
                    {supplier.name?.[0] || 'S'}
                  </div>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)' }}>{supplier.name}</div>
                    <div className="jet-mono" style={{ fontSize: 11, color: 'var(--text-dim)', marginTop: 4 }}>
                      {supplier.country || 'Unknown'} - {supplier.email || 'No email'}
                    </div>
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                  {supplier.bank_account_iban && <span className="jet-mono" style={{ fontSize: 11, color: 'var(--text-dim)' }}>{supplier.bank_account_iban.slice(0, 12)}...</span>}
                  <span className="pill" style={{ background: `${riskColor(supplier.risk_level)}18`, color: riskColor(supplier.risk_level), border: `1px solid ${riskColor(supplier.risk_level)}35` }}>
                    {supplier.risk_level || 'unknown'}
                  </span>
                  <ArrowRight size={15} color="var(--cyan)" />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
