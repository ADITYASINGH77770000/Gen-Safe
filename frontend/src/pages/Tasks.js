import React, { useEffect, useState } from 'react';
import { taskApi } from '../services/api';
import { CheckSquare, Clock, CheckCircle, AlertTriangle, Brain, ChevronRight } from 'lucide-react';

const PRIORITY_COLORS = { high: 'var(--red)', medium: 'var(--amber)', low: 'var(--green)' };
const STATUS_ICONS = {
  open: <Clock size={14} color="var(--text-secondary)" />,
  completed: <CheckCircle size={14} color="var(--green)" />,
  escalated: <AlertTriangle size={14} color="var(--red)" />,
};

export default function Tasks() {
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showExtract, setShowExtract] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [meetingTitle, setMeetingTitle] = useState('');
  const [extracting, setExtracting] = useState(false);
  const [extractResult, setExtractResult] = useState(null);
  const [msg, setMsg] = useState('');

  useEffect(() => {
    load();
  }, []);

  const load = () =>
    taskApi
      .list({})
      .then((r) => setTasks(r.data.tasks || []))
      .catch(console.error)
      .finally(() => setLoading(false));

  const runExtract = async () => {
    if (!transcript.trim()) {
      setMsg('Paste a meeting transcript first.');
      return;
    }
    setExtracting(true);
    setMsg('');
    setExtractResult(null);
    try {
      const r = await taskApi.extractFromMeeting({ transcript, meeting_title: meetingTitle || 'Finance Meeting', source: 'manual_upload' });
      setExtractResult(r.data);
      setMsg(`Created ${r.data.tasks_created} tasks from meeting transcript.`);
      setTranscript('');
      setMeetingTitle('');
      load();
    } catch (e) {
      setMsg(e.response?.data?.detail || 'Extraction failed. Check your Gemini API key.');
    } finally {
      setExtracting(false);
    }
  };

  const markDone = async (id) => {
    try {
      await taskApi.update(id, { status: 'completed' });
      load();
    } catch (e) {
      console.error(e);
    }
  };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 22, gap: 16, flexWrap: 'wrap' }}>
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 800, color: 'var(--text-primary)' }}>TASKS</h1>
          <div className="jet-mono" style={{ fontSize: 11, color: 'var(--text-dim)', marginTop: 8 }}>Meeting intelligence and follow-up actions</div>
        </div>
        <button
          onClick={() => setShowExtract(!showExtract)}
          className="pill"
          style={{
            border: '1px solid rgba(0,212,255,0.22)',
            background: 'rgba(0,212,255,0.08)',
            color: 'var(--cyan)',
            cursor: 'pointer',
            height: 38,
          }}
        >
          <Brain size={14} /> EXTRACT FROM MEETING
        </button>
      </div>

      {showExtract && (
        <div className="panel" style={{ padding: 20, marginBottom: 20, borderLeft: '3px solid var(--violet)' }}>
          <h3 style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 4, display: 'flex', alignItems: 'center', gap: 8 }}>
            <Brain size={15} color="var(--cyan)" /> MEETING INTELLIGENCE AGENT
          </h3>
          <p style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 14 }}>
            Paste a finance or procurement meeting transcript. Gemini AI will extract decisions, assign tasks, and set priorities automatically.
          </p>
          <input
            value={meetingTitle}
            onChange={(e) => setMeetingTitle(e.target.value)}
            placeholder="Meeting title (optional)"
            style={{ width: '100%', background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 10, padding: '10px 12px', color: 'var(--text-primary)', fontSize: 13, outline: 'none', marginBottom: 10 }}
          />
          <textarea
            style={{ width: '100%', minHeight: 170, resize: 'vertical', marginBottom: 12, fontFamily: 'JetBrains Mono, monospace', fontSize: 12, background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 10, padding: '10px 12px', color: 'var(--text-primary)', outline: 'none' }}
            placeholder={`Paste meeting transcript here...\n\nExample:\nJohn: We need to review all invoices above $50,000 before payment.\nSarah: I'll create a checklist for the finance team by Friday.\nJohn: Also, please audit TechSupplies invoices from last quarter.\nMaria: I'll handle that audit by end of next week.`}
            value={transcript}
            onChange={(e) => setTranscript(e.target.value)}
          />
          {msg && (
            <div
              className="panel"
              style={{
                padding: '10px 14px',
                background: msg.includes('failed') || msg.includes('error') ? 'rgba(255,58,92,0.08)' : 'rgba(0,232,135,0.08)',
                borderColor: msg.includes('failed') || msg.includes('error') ? 'rgba(255,58,92,0.2)' : 'rgba(0,232,135,0.2)',
                marginBottom: 12,
              }}
            >
              <div style={{ fontSize: 13, color: msg.includes('failed') || msg.includes('error') ? 'var(--red)' : 'var(--green)' }}>{msg}</div>
            </div>
          )}
          {extractResult && (
            <div style={{ marginBottom: 14 }}>
              {extractResult.summary && (
                <div className="panel" style={{ padding: '10px 14px', background: 'rgba(0,212,255,0.05)', marginBottom: 10 }}>
                  <strong style={{ color: 'var(--cyan)' }}>Summary:</strong> {extractResult.summary}
                </div>
              )}
              {(extractResult.decisions || []).length > 0 && (
                <div style={{ marginBottom: 10 }}>
                  <p className="jet-mono" style={{ fontSize: 11, color: 'var(--text-dim)', marginBottom: 6, fontWeight: 700 }}>
                    DECISIONS MADE
                  </p>
                  {extractResult.decisions.map((d, i) => (
                    <div key={i} className="panel" style={{ padding: '7px 10px', marginBottom: 6, fontSize: 12, color: 'var(--text-primary)' }}>
                      {d.decision}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
          <div style={{ display: 'flex', gap: 10 }}>
            <button
              onClick={runExtract}
              disabled={extracting}
              style={{
                padding: '10px 18px',
                background: 'linear-gradient(135deg, var(--violet-dim), var(--violet))',
                border: '1px solid var(--violet)',
                borderRadius: 10,
                color: '#fff',
                cursor: extracting ? 'not-allowed' : 'pointer',
                fontSize: 13,
                fontWeight: 700,
                opacity: extracting ? 0.7 : 1,
              }}
            >
              {extracting ? 'EXTRACTING WITH GEMINI...' : 'EXTRACT ACTION ITEMS'}
            </button>
            <button
              onClick={() => setShowExtract(false)}
              style={{
                padding: '10px 16px',
                background: 'var(--bg-surface)',
                border: '1px solid var(--border)',
                borderRadius: 10,
                color: 'var(--text-secondary)',
                cursor: 'pointer',
                fontSize: 13,
              }}
            >
              Close
            </button>
          </div>
        </div>
      )}

      <div className="panel" style={{ padding: 20 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, gap: 12, flexWrap: 'wrap' }}>
          <h3 style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)' }}>ALL TASKS ({tasks.length})</h3>
          <div style={{ display: 'flex', gap: 6 }}>
            {['open', 'completed'].map((status) => (
              <button
                key={status}
                onClick={() => taskApi.list({ status }).then((r) => setTasks(r.data.tasks || []))}
                className="pill"
                style={{ background: 'var(--bg-elevated)', color: 'var(--text-secondary)', border: '1px solid var(--border)', cursor: 'pointer', height: 30 }}
              >
                {status}
              </button>
            ))}
          </div>
        </div>

        {loading ? (
          <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-dim)', fontSize: 13 }}>Loading tasks...</div>
        ) : tasks.length === 0 ? (
          <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-dim)', fontSize: 13 }}>
            No tasks yet. Use the Meeting Intelligence Agent above to extract action items from a meeting transcript.
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {tasks.map((task) => (
              <div key={task.task_id} className="panel panel-hover" style={{ padding: 16, display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, flex: 1, minWidth: 0 }}>
                  <div style={{ marginTop: 2 }}>{STATUS_ICONS[task.status] || STATUS_ICONS.open}</div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ fontSize: 13, color: task.status === 'completed' ? 'var(--text-dim)' : 'var(--text-primary)', fontWeight: 600, textDecoration: task.status === 'completed' ? 'line-through' : 'none' }}>
                      {task.title}
                    </p>
                    {task.description && <p style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 3 }}>{task.description}</p>}
                    <div style={{ display: 'flex', gap: 12, marginTop: 8, flexWrap: 'wrap' }}>
                      {task.owner_name && <span className="jet-mono" style={{ fontSize: 11, color: 'var(--text-secondary)' }}>OWNER {task.owner_name}</span>}
                      {task.due_date && <span className="jet-mono" style={{ fontSize: 11, color: 'var(--text-secondary)' }}>DUE {task.due_date?.slice(0, 10)}</span>}
                      {task.source_ref && <span className="jet-mono" style={{ fontSize: 11, color: 'var(--text-dim)' }}>SOURCE {task.source_ref}</span>}
                    </div>
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                  <span className="pill" style={{ background: `${PRIORITY_COLORS[task.priority] || 'var(--text-secondary)'}18`, color: PRIORITY_COLORS[task.priority] || 'var(--text-secondary)', border: '1px solid var(--border)' }}>
                    {task.priority}
                  </span>
                  {task.status === 'open' && (
                    <button
                      onClick={() => markDone(task.task_id)}
                      style={{
                        padding: '6px 12px',
                        background: 'rgba(0,232,135,0.08)',
                        border: '1px solid var(--green)',
                        borderRadius: 10,
                        color: 'var(--green)',
                        cursor: 'pointer',
                        fontSize: 11,
                        fontWeight: 700,
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 6,
                      }}
                    >
                      Done <ChevronRight size={12} />
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
