import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Shield, Eye, EyeOff } from 'lucide-react';
import { authApi } from '../services/api';

export default function Login() {
  const [email, setEmail] = useState('admin@gensafe.com');
  const [password, setPassword] = useState('admin123');
  const [showPw, setShowPw] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const navigate = useNavigate();

  const submit = async (e) => {
    e.preventDefault();
    setLoading(true); setError('');
    try {
      const res = await authApi.login(email, password);
      localStorage.setItem('token', res.data.access_token);
      localStorage.setItem('user_name', res.data?.user?.name || '');
      localStorage.setItem('user_email', res.data?.user?.email || email);
      sessionStorage.setItem('robot_force_welcome', '1');
      navigate('/');
    } catch (err) {
      setError(err.response?.data?.detail || 'Login failed. Check credentials.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{
      minHeight:'100vh',
      background:'radial-gradient(900px 500px at 10% 10%, rgba(77,132,199,0.22), transparent 55%), radial-gradient(900px 500px at 90% 90%, rgba(102,64,193,0.22), transparent 55%), #0b0f16',
      display:'flex',
      alignItems:'center',
      justifyContent:'center',
      padding:20,
      position:'relative',
      overflow:'hidden',
    }}>
      <div style={{ position:'absolute', width:320, height:320, borderRadius:'50%', right:'-90px', top:'-90px', background:'radial-gradient(circle, rgba(0,235,255,0.24), rgba(0,235,255,0))' }} />
      <div style={{ position:'absolute', width:380, height:380, borderRadius:'50%', left:'-130px', bottom:'-140px', background:'radial-gradient(circle, rgba(117,85,239,0.24), rgba(117,85,239,0))' }} />
      <div style={{ width:'100%', maxWidth:400 }}>
        {/* Logo */}
        <div style={{ textAlign:'center', marginBottom:32 }}>
          <div style={{ width:56, height:56, background:'linear-gradient(135deg,#4B3CA7,#7C6FD4)', borderRadius:16, display:'inline-flex', alignItems:'center', justifyContent:'center', marginBottom:16, boxShadow:'0 12px 30px rgba(71,56,164,0.45)' }}>
            <Shield size={28} color="#fff" />
          </div>
          <h1 style={{ fontSize:24, fontWeight:700, color:'#e2e8f0', marginBottom:4 }}>GenSafe B2B</h1>
          <p style={{ fontSize:13, color:'#6b7280' }}>Agentic AI Fraud Detection Platform</p>
        </div>

        {/* Card */}
        <div style={{
          background:'linear-gradient(160deg, rgba(18,18,26,0.94), rgba(17,24,34,0.94))',
          border:'1px solid #1e1e2e',
          borderRadius:16,
          padding:32,
          boxShadow:'0 20px 50px rgba(0,0,0,0.42), inset 0 1px 0 rgba(255,255,255,0.04)',
          backdropFilter:'blur(8px)',
        }}>
          <h2 style={{ fontSize:18, fontWeight:600, color:'#e2e8f0', marginBottom:24 }}>Sign in</h2>

          {error && (
            <div style={{ background:'rgba(162,29,29,0.15)', border:'1px solid #7f1d1d', borderRadius:8, padding:'10px 14px', marginBottom:16, color:'#fca5a5', fontSize:13 }}>
              {error}
            </div>
          )}

          <form onSubmit={submit} style={{ display:'flex', flexDirection:'column', gap:16 }}>
            <div>
              <label style={{ fontSize:12, color:'#9ca3af', display:'block', marginBottom:6 }}>Email</label>
              <input value={email} onChange={e=>setEmail(e.target.value)} type="email" required
                style={{ width:'100%', background:'#1a1a2e', border:'1px solid #2d2d44', borderRadius:8, padding:'10px 14px', color:'#e2e8f0', fontSize:14, outline:'none' }} />
            </div>
            <div>
              <label style={{ fontSize:12, color:'#9ca3af', display:'block', marginBottom:6 }}>Password</label>
              <div style={{ position:'relative' }}>
                <input value={password} onChange={e=>setPassword(e.target.value)} type={showPw?'text':'password'} required
                  style={{ width:'100%', background:'#1a1a2e', border:'1px solid #2d2d44', borderRadius:8, padding:'10px 40px 10px 14px', color:'#e2e8f0', fontSize:14, outline:'none' }} />
                <button type="button" onClick={()=>setShowPw(!showPw)}
                  style={{ position:'absolute', right:12, top:'50%', transform:'translateY(-50%)', background:'none', border:'none', color:'#6b7280', cursor:'pointer' }}>
                  {showPw ? <EyeOff size={16}/> : <Eye size={16}/>}
                </button>
              </div>
            </div>
            <button type="submit" disabled={loading}
              style={{ background:'linear-gradient(135deg,#4B3CA7,#6D5ED4)', border:'none', borderRadius:8, padding:'11px', color:'#fff', fontSize:14, fontWeight:600, cursor:loading?'not-allowed':'pointer', opacity:loading?0.7:1, marginTop:8 }}>
              {loading ? 'Signing in...' : 'Sign in'}
            </button>
          </form>

          <div style={{ marginTop:20, padding:'12px 14px', background:'rgba(75,60,167,0.1)', borderRadius:8, border:'1px solid rgba(75,60,167,0.3)' }}>
            <p style={{ fontSize:11, color:'#9ca3af', marginBottom:4 }}>Default credentials</p>
            <p style={{ fontSize:12, color:'#a78bfa' }}>admin@gensafe.com / admin123</p>
          </div>
        </div>
      </div>
    </div>
  );
}
