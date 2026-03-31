import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Eye, EyeOff, Shield } from 'lucide-react';
import ThreeBackdrop from '../components/common/ThreeBackdrop';
import { authApi } from '../services/api';

export default function Login() {
  const [email, setEmail] = useState('admin@gensafe.com');
  const [password, setPassword] = useState('admin123');
  const [showPw, setShowPw] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    if (!success) return undefined;
    const timer = setTimeout(() => navigate('/'), 260);
    return () => clearTimeout(timer);
  }, [navigate, success]);

  const submit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      const res = await authApi.login(email, password);
      const fullName = res.data?.user?.name || localStorage.getItem('user_name') || 'GenSafe Admin';
      localStorage.setItem('token', res.data.access_token);
      localStorage.setItem('user_name', fullName);
      localStorage.setItem('user_email', res.data?.user?.email || email);
      sessionStorage.setItem('robot_force_welcome', '1');
      setSuccess(true);
    } catch (err) {
      setError(err.response?.data?.detail || 'Login failed. Check credentials.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      style={{
        minHeight: '100vh',
        background: 'var(--bg-base)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 24,
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      <ThreeBackdrop />
      <div
        style={{
          position: 'absolute',
          inset: 0,
          background:
            'radial-gradient(circle at 20% 20%, rgba(0,212,255,0.12), transparent 26%), radial-gradient(circle at 80% 80%, rgba(124,111,255,0.14), transparent 30%)',
          pointerEvents: 'none',
        }}
      />
      <div
        className="glass-panel"
        style={{
          width: '100%',
          maxWidth: 420,
          padding: 40,
          borderRadius: 'var(--radius-xl)',
          position: 'relative',
          zIndex: 1,
          transform: success ? 'scale(0.96)' : 'scale(1)',
          opacity: success ? 0 : 1,
          transition: 'transform 300ms ease, opacity 300ms ease',
          boxShadow: '0 0 0 1px var(--border), 0 32px 64px rgba(0,0,0,0.6), inset 0 1px 0 rgba(255,255,255,0.05)',
        }}
      >
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', marginBottom: 28 }}>
          <div
            style={{
              width: 72,
              height: 72,
              borderRadius: '50%',
              background: 'radial-gradient(circle, rgba(0,212,255,0.22), rgba(124,111,255,0.16))',
              border: '1px solid rgba(0,212,255,0.34)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: '0 0 0 8px rgba(0,212,255,0.04), 0 0 34px rgba(0,212,255,0.12)',
              marginBottom: 18,
              animation: 'pulseSoft 4s ease-in-out infinite',
            }}
          >
            <Shield size={30} color="var(--cyan)" />
          </div>
          <h1 style={{ fontFamily: 'Orbitron, sans-serif', fontSize: 30, color: 'var(--text-primary)', letterSpacing: 1.2 }}>
            GENSAFE
          </h1>
          <div className="jet-mono" style={{ marginTop: 6, fontSize: 11, letterSpacing: 4, color: 'var(--cyan)' }}>
            QUANTUM VAULT
          </div>
          <p style={{ marginTop: 10, fontSize: 13, color: 'var(--text-secondary)' }}>
            5-Agent Fraud Intelligence Platform
          </p>
        </div>

        {error && (
          <div
            style={{
              background: 'rgba(255,58,92,0.1)',
              border: '1px solid rgba(255,58,92,0.25)',
              borderRadius: 10,
              padding: '10px 12px',
              marginBottom: 16,
              color: '#ffb4c0',
              fontSize: 13,
            }}
          >
            {error}
          </div>
        )}

        <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div>
            <label
              className="jet-mono"
              style={{
                display: 'block',
                marginBottom: 8,
                fontSize: 10,
                letterSpacing: 1.6,
                textTransform: 'uppercase',
                color: 'var(--cyan)',
              }}
            >
              Work Email
            </label>
            <input
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              type="email"
              required
              style={{
                width: '100%',
                background: 'rgba(0,0,0,0.35)',
                border: '1px solid var(--border)',
                borderRadius: 'var(--radius-md)',
                padding: '12px 14px',
                color: 'var(--text-primary)',
                fontSize: 14,
                outline: 'none',
                transition: 'all 200ms ease',
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
          </div>

          <div>
            <label
              className="jet-mono"
              style={{
                display: 'block',
                marginBottom: 8,
                fontSize: 10,
                letterSpacing: 1.6,
                textTransform: 'uppercase',
                color: 'var(--cyan)',
              }}
            >
              Password
            </label>
            <div style={{ position: 'relative' }}>
              <input
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                type={showPw ? 'text' : 'password'}
                required
                style={{
                  width: '100%',
                  background: 'rgba(0,0,0,0.35)',
                  border: '1px solid var(--border)',
                  borderRadius: 'var(--radius-md)',
                  padding: '12px 42px 12px 14px',
                  color: 'var(--text-primary)',
                  fontSize: 14,
                  outline: 'none',
                  transition: 'all 200ms ease',
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
              <button
                type="button"
                onClick={() => setShowPw(!showPw)}
                style={{
                  position: 'absolute',
                  right: 12,
                  top: '50%',
                  transform: 'translateY(-50%)',
                  background: 'transparent',
                  border: 'none',
                  color: 'var(--text-secondary)',
                  cursor: 'pointer',
                  padding: 4,
                }}
              >
                {showPw ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="scanner-line"
            style={{
              height: 46,
              borderRadius: 'var(--radius-md)',
              border: '1px solid var(--violet)',
              background: 'linear-gradient(135deg, var(--violet-dim), var(--violet))',
              color: 'white',
              fontSize: 14,
              fontWeight: 600,
              cursor: loading ? 'not-allowed' : 'pointer',
              opacity: loading ? 0.75 : 1,
              transition: 'all 240ms ease',
              boxShadow: '0 8px 24px rgba(124,111,255,0.35)',
            }}
            onMouseEnter={(e) => {
              if (!loading) {
                e.currentTarget.style.transform = 'translateY(-1px)';
                e.currentTarget.style.boxShadow = '0 12px 32px rgba(0,212,255,0.25)';
              }
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.transform = 'translateY(0)';
              e.currentTarget.style.boxShadow = '0 8px 24px rgba(124,111,255,0.35)';
            }}
          >
            {loading ? 'Signing in...' : 'Enter Mission Control'}
          </button>
        </form>

        <div
          style={{
            marginTop: 20,
            padding: '12px 14px',
            background: 'rgba(0,212,255,0.06)',
            borderRadius: 10,
            border: '1px solid rgba(0,212,255,0.18)',
          }}
        >
          <p className="jet-mono" style={{ fontSize: 10, color: 'var(--text-dim)', textAlign: 'center', letterSpacing: 1.3 }}>
            ENCRYPTED - EU AI ACT COMPLIANT - SOC 2 TYPE II
          </p>
          <p className="jet-mono" style={{ fontSize: 10, color: 'var(--text-dim)', textAlign: 'center', marginTop: 6, letterSpacing: 1.3 }}>
            ALL AGENT DECISIONS ARE AUDITED AND IMMUTABLE
          </p>
          <p style={{ marginTop: 12, fontSize: 11, color: 'var(--text-secondary)', textAlign: 'center' }}>
            Default credentials: admin@gensafe.com / admin123
          </p>
        </div>
      </div>
    </div>
  );
}
