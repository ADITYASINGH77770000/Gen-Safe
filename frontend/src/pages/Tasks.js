import React, { useState, useEffect } from 'react';
import { taskApi } from '../services/api';
import { CheckSquare, Plus, Clock, CheckCircle, AlertTriangle, Brain } from 'lucide-react';

const card = { background:'#12121a', border:'1px solid #1e1e2e', borderRadius:12, padding:20 };
const inp = { background:'#1a1a2e', border:'1px solid #2d2d44', borderRadius:8, padding:'9px 12px', color:'#e2e8f0', fontSize:13, outline:'none', width:'100%' };
const PRIORITY_COLORS = { high:'#ef4444', medium:'#f97316', low:'#22c55e' };
const STATUS_ICONS = { open:<Clock size={14} color="#6b7280"/>, completed:<CheckCircle size={14} color="#22c55e"/>, escalated:<AlertTriangle size={14} color="#ef4444"/> };

export default function Tasks() {
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showExtract, setShowExtract] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [meetingTitle, setMeetingTitle] = useState('');
  const [extracting, setExtracting] = useState(false);
  const [extractResult, setExtractResult] = useState(null);
  const [msg, setMsg] = useState('');

  useEffect(() => { load(); }, []);
  const load = () => taskApi.list({}).then(r => setTasks(r.data.tasks||[])).catch(console.error).finally(()=>setLoading(false));

  const runExtract = async () => {
    if (!transcript.trim()) { setMsg('Paste a meeting transcript first.'); return; }
    setExtracting(true); setMsg(''); setExtractResult(null);
    try {
      const r = await taskApi.extractFromMeeting({ transcript, meeting_title: meetingTitle || 'Finance Meeting', source: 'manual_upload' });
      setExtractResult(r.data);
      setMsg(`Created ${r.data.tasks_created} tasks from meeting transcript.`);
      setTranscript(''); setMeetingTitle('');
      load();
    } catch(e) {
      setMsg(e.response?.data?.detail || 'Extraction failed. Check your Gemini API key.');
    } finally { setExtracting(false); }
  };

  const markDone = async (id) => {
    try {
      await taskApi.update(id, { status: 'completed' });
      load();
    } catch(e) { console.error(e); }
  };

  return (
    <div>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:24 }}>
        <div>
          <h1 style={{ fontSize:22, fontWeight:700, color:'#e2e8f0' }}>Tasks</h1>
          <p style={{ fontSize:13, color:'#6b7280', marginTop:4 }}>Meeting Intelligence Agent — extracts action items automatically</p>
        </div>
        <button onClick={()=>setShowExtract(!showExtract)}
          style={{ display:'flex', alignItems:'center', gap:8, padding:'8px 16px', background:'#2D1B6E', border:'1px solid #4B3CA7', borderRadius:8, color:'#a78bfa', cursor:'pointer', fontSize:13, fontWeight:600 }}>
          <Brain size={14}/> Extract from Meeting
        </button>
      </div>

      {/* Meeting extraction panel */}
      {showExtract && (
        <div style={{ ...card, marginBottom:20, borderColor:'#4B3CA7' }}>
          <h3 style={{ fontSize:14, fontWeight:600, color:'#e2e8f0', marginBottom:4, display:'flex', alignItems:'center', gap:8 }}>
            <Brain size={15} color="#a78bfa"/> Meeting Intelligence Agent
          </h3>
          <p style={{ fontSize:12, color:'#6b7280', marginBottom:14 }}>
            Paste a finance/procurement meeting transcript. Gemini AI will extract decisions, assign tasks, and set priorities automatically.
          </p>
          <input style={{ ...inp, marginBottom:10 }} placeholder="Meeting title (optional)" value={meetingTitle} onChange={e=>setMeetingTitle(e.target.value)}/>
          <textarea
            style={{ ...inp, minHeight:160, resize:'vertical', marginBottom:12, fontFamily:'monospace', fontSize:12 }}
            placeholder={`Paste meeting transcript here...\n\nExample:\nJohn: We need to review all invoices above $50,000 before payment.\nSarah: I'll create a checklist for the finance team by Friday.\nJohn: Also, please audit TechSupplies invoices from last quarter.\nMaria: I'll handle that audit by end of next week.`}
            value={transcript}
            onChange={e=>setTranscript(e.target.value)}
          />
          {msg && (
            <div style={{ padding:'10px 14px', background: msg.includes('failed')||msg.includes('error') ? 'rgba(239,68,68,0.1)' : 'rgba(34,197,94,0.1)',
              border:`1px solid ${msg.includes('failed')||msg.includes('error') ? '#ef4444':'#22c55e'}`, borderRadius:8, fontSize:13,
              color: msg.includes('failed')||msg.includes('error') ? '#fca5a5':'#86efac', marginBottom:12 }}>
              {msg}
            </div>
          )}
          {extractResult && (
            <div style={{ marginBottom:14 }}>
              {extractResult.summary && (
                <div style={{ padding:'10px 14px', background:'rgba(75,60,167,0.1)', border:'1px solid rgba(75,60,167,0.3)', borderRadius:8, fontSize:13, color:'#a78bfa', marginBottom:10 }}>
                  <strong>Summary:</strong> {extractResult.summary}
                </div>
              )}
              {(extractResult.decisions||[]).length > 0 && (
                <div style={{ marginBottom:10 }}>
                  <p style={{ fontSize:12, color:'#9ca3af', marginBottom:6, fontWeight:600 }}>DECISIONS MADE</p>
                  {extractResult.decisions.map((d,i) => (
                    <div key={i} style={{ fontSize:12, color:'#d1d5db', padding:'6px 10px', background:'#1a1a2e', borderRadius:6, marginBottom:4 }}>• {d.decision}</div>
                  ))}
                </div>
              )}
            </div>
          )}
          <div style={{ display:'flex', gap:10 }}>
            <button onClick={runExtract} disabled={extracting}
              style={{ padding:'9px 20px', background:'linear-gradient(135deg,#4B3CA7,#6D5ED4)', border:'none', borderRadius:8, color:'#fff', cursor:extracting?'not-allowed':'pointer', fontSize:13, fontWeight:600, opacity:extracting?0.7:1 }}>
              {extracting ? 'Extracting with Gemini...' : 'Extract Action Items'}
            </button>
            <button onClick={()=>setShowExtract(false)}
              style={{ padding:'9px 16px', background:'transparent', border:'1px solid #2d2d44', borderRadius:8, color:'#9ca3af', cursor:'pointer', fontSize:13 }}>
              Close
            </button>
          </div>
        </div>
      )}

      {/* Tasks list */}
      <div style={card}>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:16 }}>
          <h3 style={{ fontSize:14, fontWeight:600, color:'#e2e8f0' }}>All Tasks ({tasks.length})</h3>
          <div style={{ display:'flex', gap:6 }}>
            {['open','completed'].map(s => (
              <button key={s} onClick={() => taskApi.list({status:s}).then(r=>setTasks(r.data.tasks||[]))}
                style={{ padding:'4px 12px', borderRadius:6, border:'1px solid #2d2d44', background:'#1a1a2e', color:'#9ca3af', cursor:'pointer', fontSize:11 }}>
                {s}
              </button>
            ))}
          </div>
        </div>
        {loading ? (
          <div style={{ textAlign:'center', padding:40, color:'#6b7280', fontSize:13 }}>Loading tasks...</div>
        ) : tasks.length === 0 ? (
          <div style={{ textAlign:'center', padding:40, color:'#4b5563', fontSize:13 }}>
            No tasks yet. Use the Meeting Intelligence Agent above to extract action items from a meeting transcript.
          </div>
        ) : (
          <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
            {tasks.map(t => (
              <div key={t.task_id} style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', padding:'14px 16px', background:'#1a1a2e', borderRadius:10, border:`1px solid ${t.status==='completed'?'#14532d':'#2d2d44'}`, gap:12 }}>
                <div style={{ display:'flex', alignItems:'flex-start', gap:12, flex:1 }}>
                  <div style={{ marginTop:2 }}>{STATUS_ICONS[t.status] || STATUS_ICONS.open}</div>
                  <div style={{ flex:1 }}>
                    <p style={{ fontSize:13, color: t.status==='completed'?'#6b7280':'#e2e8f0', fontWeight:500, textDecoration: t.status==='completed'?'line-through':'none' }}>{t.title}</p>
                    {t.description && <p style={{ fontSize:12, color:'#6b7280', marginTop:3 }}>{t.description}</p>}
                    <div style={{ display:'flex', gap:12, marginTop:6, flexWrap:'wrap' }}>
                      {t.owner_name && <span style={{ fontSize:11, color:'#9ca3af' }}>👤 {t.owner_name}</span>}
                      {t.due_date && <span style={{ fontSize:11, color:'#9ca3af' }}>📅 {t.due_date?.slice(0,10)}</span>}
                      {t.source_ref && <span style={{ fontSize:11, color:'#6b7280' }}>📋 {t.source_ref}</span>}
                    </div>
                  </div>
                </div>
                <div style={{ display:'flex', alignItems:'center', gap:8, flexShrink:0 }}>
                  <span style={{ fontSize:10, color: PRIORITY_COLORS[t.priority]||'#6b7280', background:`${PRIORITY_COLORS[t.priority]||'#6b7280'}20`, padding:'2px 8px', borderRadius:20, fontWeight:600, textTransform:'uppercase' }}>
                    {t.priority}
                  </span>
                  {t.status === 'open' && (
                    <button onClick={() => markDone(t.task_id)}
                      style={{ padding:'5px 12px', background:'rgba(34,197,94,0.15)', border:'1px solid #22c55e', borderRadius:6, color:'#86efac', cursor:'pointer', fontSize:11, fontWeight:600 }}>
                      Done
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
