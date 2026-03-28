import React, { useEffect, useRef, useState } from 'react';
import { Upload, FileText, Clock, CheckCircle, XCircle, AlertTriangle, RefreshCw, ScanSearch, Image as ImageIcon } from 'lucide-react';
import { invoiceApi, supplierApi, opsApi } from '../services/api';
import { useNavigate } from 'react-router-dom';

const card = { background:'#12121a', border:'1px solid #1e1e2e', borderRadius:12, padding:20 };
const STATUS_ICONS = {
  pending:<Clock size={14} color="#6b7280"/>,
  processing:<RefreshCw size={14} color="#38bdf8"/>,
  approved:<CheckCircle size={14} color="#22c55e"/>,
  blocked:<XCircle size={14} color="#ef4444"/>,
  under_review:<AlertTriangle size={14} color="#f97316"/>,
};

export default function Invoices() {
  const [invoices, setInvoices] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [uploadStatus, setUploadStatus] = useState('');
  const [ocrStatus, setOcrStatus] = useState(null);
  const [ocrTestResult, setOcrTestResult] = useState(null);
  const [analysisResult, setAnalysisResult] = useState(null);
  const [ocrTesting, setOcrTesting] = useState(false);
  const pollingRef = useRef(null);
  const fileRef = useRef();
  const navigate = useNavigate();

  const [form, setForm] = useState({ supplier_id:'', invoice_number:'', amount:'', currency:'USD' });

  useEffect(() => {
    load();
    supplierApi.list().then(r => setSuppliers(r.data.suppliers || [])).catch(console.error);
    opsApi.ocrStatus().then(r => setOcrStatus(r.data)).catch(() => setOcrStatus({ available: false }));
    return () => {
      if (pollingRef.current) clearInterval(pollingRef.current);
    };
  }, []);

  const load = () => {
    invoiceApi.list({})
      .then(r => setInvoices(r.data.invoices || []))
      .catch(console.error)
      .finally(() => setLoading(false));
  };

  const handleUpload = async () => {
    const file = fileRef.current?.files?.[0];
    if (!file) {
      setUploadStatus('Please select a file first.');
      return;
    }

    if (pollingRef.current) {
      clearInterval(pollingRef.current);
      pollingRef.current = null;
    }

    setUploading(true);
    setUploadStatus('Uploading...');
    setAnalysisResult(null);
    try {
      const fd = new FormData();
      fd.append('file', file);
      if (form.supplier_id) fd.append('supplier_id', form.supplier_id);
      if (form.invoice_number) fd.append('invoice_number', form.invoice_number);
      if (form.amount) fd.append('amount', form.amount);
      fd.append('currency', form.currency);

      const res = await invoiceApi.submit(fd);
      const jobId = res.data.job_id;
      setUploadStatus(`Invoice submitted! Job ID: ${jobId}. Analyzing...`);
      fileRef.current.value = '';
      load();

      pollingRef.current = setInterval(async () => {
        try {
          const r = await invoiceApi.getResult(jobId);
          if (r.data.status === 'completed') {
            clearInterval(pollingRef.current);
            pollingRef.current = null;
            const result = r.data.result || {};
            setAnalysisResult(result);
            setUploadStatus(`Analysis complete! Risk Score: ${Math.round(result.risk_score || 0)}/100 - Decision: ${String(result.decision || '').toUpperCase()}`);
            load();
            if (result.alert_id) navigate(`/alerts/${result.alert_id}`);
          } else if (r.data.status === 'failed') {
            clearInterval(pollingRef.current);
            pollingRef.current = null;
            setUploadStatus(`Analysis failed: ${r.data.error}`);
          } else {
            setUploadStatus(`Analyzing... ${r.data.progress || 0}% - ${r.data.current_step || ''}`);
          }
        } catch (e) {
          clearInterval(pollingRef.current);
          pollingRef.current = null;
          setUploadStatus(`Analysis check failed: ${e.response?.data?.detail || e.message}`);
        }
      }, 2000);
    } catch (e) {
      setUploadStatus(`Upload failed: ${e.response?.data?.detail || e.message}`);
    } finally {
      setUploading(false);
    }
  };

  const runOcrTest = async () => {
    setOcrTesting(true);
    setOcrTestResult(null);
    try {
      const res = await opsApi.ocrTest();
      setOcrTestResult(res.data);
      setOcrStatus((prev) => ({ ...(prev || {}), ...(res.data || {}) }));
      setUploadStatus(
        res.data?.passed
          ? 'OCR smoke test passed with a generated invoice screenshot.'
          : `OCR smoke test failed: ${res.data?.error || 'unknown error'}`
      );
    } catch (e) {
      setUploadStatus(`OCR smoke test failed: ${e.response?.data?.detail || e.message}`);
    } finally {
      setOcrTesting(false);
    }
  };

  const statusColor = (s) => ({ approved:'#22c55e', blocked:'#ef4444', under_review:'#f97316', processing:'#38bdf8' }[s] || '#6b7280');
  const ocrReady = Boolean(ocrStatus?.available);

  const pillStyle = {
    display:'inline-flex',
    alignItems:'center',
    gap:6,
    padding:'5px 10px',
    borderRadius:999,
    fontSize:11,
    fontWeight:700,
    letterSpacing:0.2,
    border:`1px solid ${ocrReady ? 'rgba(34,197,94,0.35)' : 'rgba(239,68,68,0.35)'}`,
    background: ocrReady ? 'rgba(34,197,94,0.12)' : 'rgba(239,68,68,0.12)',
    color: ocrReady ? '#86efac' : '#fca5a5',
  };

  return (
    <div>
      <h1 style={{ fontSize:22, fontWeight:700, color:'#e2e8f0', marginBottom:24 }}>Invoices</h1>

      <div style={{ ...card, marginBottom:20 }}>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', gap:12, marginBottom:16 }}>
          <h3 style={{ fontSize:14, fontWeight:600, color:'#e2e8f0', display:'flex', alignItems:'center', gap:8, margin:0 }}>
            <Upload size={16} color="#a78bfa"/> Submit Invoice for Analysis
          </h3>
          <span style={pillStyle}>
            <ScanSearch size={11} />
            {ocrReady ? `OCR Ready${ocrStatus?.version ? ` · ${ocrStatus.version}` : ''}` : 'OCR Missing'}
          </span>
        </div>

        <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(180px,1fr))', gap:12, marginBottom:14 }}>
          <select
            value={form.supplier_id}
            onChange={e => setForm({ ...form, supplier_id: e.target.value })}
            style={{ background:'#1a1a2e', border:'1px solid #2d2d44', borderRadius:8, padding:'9px 12px', color:'#e2e8f0', fontSize:13, outline:'none' }}
          >
            <option value="">Select supplier (optional)</option>
            {suppliers.map(s => <option key={s.supplier_id} value={s.supplier_id}>{s.name}</option>)}
          </select>
          <input
            value={form.invoice_number}
            onChange={e => setForm({ ...form, invoice_number: e.target.value })}
            placeholder="Invoice number"
            style={{ background:'#1a1a2e', border:'1px solid #2d2d44', borderRadius:8, padding:'9px 12px', color:'#e2e8f0', fontSize:13, outline:'none' }}
          />
          <input
            value={form.amount}
            onChange={e => setForm({ ...form, amount: e.target.value })}
            placeholder="Amount"
            type="number"
            style={{ background:'#1a1a2e', border:'1px solid #2d2d44', borderRadius:8, padding:'9px 12px', color:'#e2e8f0', fontSize:13, outline:'none' }}
          />
          <select
            value={form.currency}
            onChange={e => setForm({ ...form, currency: e.target.value })}
            style={{ background:'#1a1a2e', border:'1px solid #2d2d44', borderRadius:8, padding:'9px 12px', color:'#e2e8f0', fontSize:13, outline:'none' }}
          >
            {['USD','EUR','GBP','INR','JPY','AED'].map(c => <option key={c}>{c}</option>)}
          </select>
        </div>

        <div style={{ display:'flex', gap:12, alignItems:'center', flexWrap:'wrap' }}>
          <input
            ref={fileRef}
            type="file"
            accept=".pdf,.png,.jpg,.jpeg,.txt"
            style={{ flex:1, minWidth:240, background:'#1a1a2e', border:'1px solid #2d2d44', borderRadius:8, padding:'8px 12px', color:'#9ca3af', fontSize:13 }}
          />
          <button
            onClick={runOcrTest}
            disabled={ocrTesting}
            style={{ padding:'9px 16px', background:'rgba(56,189,248,0.12)', border:'1px solid rgba(56,189,248,0.35)', borderRadius:8, color:'#7dd3fc', cursor:ocrTesting ? 'not-allowed' : 'pointer', fontSize:13, fontWeight:600, whiteSpace:'nowrap', opacity:ocrTesting ? 0.7 : 1, display:'flex', alignItems:'center', gap:8 }}
          >
            <ImageIcon size={14} />
            {ocrTesting ? 'Testing OCR...' : 'Test OCR'}
          </button>
          <button
            onClick={handleUpload}
            disabled={uploading}
            style={{ padding:'9px 20px', background:'linear-gradient(135deg,#4B3CA7,#6D5ED4)', border:'none', borderRadius:8, color:'#fff', cursor:uploading ? 'not-allowed' : 'pointer', fontSize:13, fontWeight:600, whiteSpace:'nowrap', opacity:uploading ? 0.7 : 1 }}
          >
            {uploading ? 'Uploading...' : 'Analyze Invoice'}
          </button>
        </div>

        {uploadStatus && (
          <div style={{ marginTop:12, padding:'10px 14px', background:'rgba(75,60,167,0.1)', border:'1px solid rgba(75,60,167,0.3)', borderRadius:8, fontSize:13, color:'#a78bfa' }}>
            {uploadStatus}
          </div>
        )}

        {analysisResult?.extracted_text_preview && (
          <div style={{ marginTop:12, padding:14, background:'rgba(15,23,42,0.85)', border:'1px solid #243046', borderRadius:10 }}>
            <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', gap:12, marginBottom:10 }}>
              <strong style={{ color:'#e2e8f0', fontSize:13 }}>OCR Extracted Text Preview</strong>
              <span style={{ fontSize:11, color:'#94a3b8' }}>
                {analysisResult.extracted_text_length || analysisResult.extracted_text_preview.length} chars
              </span>
            </div>
            <pre style={{ margin:0, whiteSpace:'pre-wrap', wordBreak:'break-word', color:'#cbd5e1', fontSize:12, lineHeight:1.6, maxHeight:180, overflow:'auto' }}>
              {analysisResult.extracted_text_preview}
            </pre>
          </div>
        )}

        {analysisResult?.ocr_fields && (
          <div style={{ marginTop:12, padding:14, background:'rgba(15,23,42,0.85)', border:'1px solid #243046', borderRadius:10 }}>
            <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', gap:12, marginBottom:10 }}>
              <strong style={{ color:'#e2e8f0', fontSize:13 }}>OCR Parsed Fields</strong>
              <span style={{ fontSize:11, color:'#94a3b8' }}>
                Confidence {Math.round((analysisResult.ocr_fields.confidence || 0) * 100)}%
              </span>
            </div>
            <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(180px,1fr))', gap:10 }}>
              {[
                ['invoice_number', analysisResult.ocr_fields.invoice_number],
                ['supplier_name', analysisResult.ocr_fields.supplier_name],
                ['currency', analysisResult.ocr_fields.currency],
                ['total_amount', analysisResult.ocr_fields.total_amount],
                ['subtotal', analysisResult.ocr_fields.subtotal],
                ['tax', analysisResult.ocr_fields.tax],
                ['discount', analysisResult.ocr_fields.discount],
              ].map(([label, value]) => (
                <div key={label} style={{ padding:'10px 12px', background:'#1a1a2e', borderRadius:8, border:'1px solid #2d2d44' }}>
                  <div style={{ fontSize:11, color:'#6b7280', textTransform:'uppercase', letterSpacing:0.5, marginBottom:4 }}>{label}</div>
                  <div style={{ fontSize:13, color:'#e2e8f0', wordBreak:'break-word' }}>{value != null && value !== '' ? String(value) : 'n/a'}</div>
                </div>
              ))}
            </div>
          </div>
        )}

        {ocrTestResult && (
          <div style={{ marginTop:12, padding:14, background:'rgba(15,23,42,0.85)', border:'1px solid #243046', borderRadius:10 }}>
            <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', gap:12, marginBottom:12 }}>
              <strong style={{ color:'#e2e8f0', fontSize:13 }}>OCR Smoke Test</strong>
              <span style={{ display:'inline-flex', alignItems:'center', gap:6, padding:'4px 10px', borderRadius:999, fontSize:11, fontWeight:700, background: ocrTestResult.passed ? 'rgba(34,197,94,0.12)' : 'rgba(239,68,68,0.12)', color: ocrTestResult.passed ? '#86efac' : '#fca5a5', border:`1px solid ${ocrTestResult.passed ? 'rgba(34,197,94,0.35)' : 'rgba(239,68,68,0.35)'}` }}>
                {ocrTestResult.passed ? 'Passed' : 'Failed'}
              </span>
            </div>
            {ocrTestResult.image_data_url && (
              <div style={{ marginBottom:12, border:'1px solid #243046', borderRadius:10, overflow:'hidden', background:'#fff' }}>
                <img src={ocrTestResult.image_data_url} alt="OCR sample invoice" style={{ width:'100%', display:'block' }} />
              </div>
            )}
            <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(280px,1fr))', gap:12 }}>
              <div>
                <div style={{ fontSize:11, textTransform:'uppercase', letterSpacing:0.8, color:'#64748b', marginBottom:6 }}>Sample Text</div>
                <pre style={{ margin:0, whiteSpace:'pre-wrap', wordBreak:'break-word', color:'#cbd5e1', fontSize:12, lineHeight:1.6, maxHeight:180, overflow:'auto' }}>
                  {ocrTestResult.sample_text}
                </pre>
              </div>
              <div>
                <div style={{ fontSize:11, textTransform:'uppercase', letterSpacing:0.8, color:'#64748b', marginBottom:6 }}>Extracted Text</div>
                <pre style={{ margin:0, whiteSpace:'pre-wrap', wordBreak:'break-word', color:'#cbd5e1', fontSize:12, lineHeight:1.6, maxHeight:180, overflow:'auto' }}>
                  {ocrTestResult.extracted_text || '[No text extracted]'}
                </pre>
              </div>
            </div>
          </div>
        )}

        <p style={{ fontSize:11, color:'#4b5563', marginTop:10 }}>Supported: PDF, PNG, JPG, TXT - No file? Try a .txt file with fake invoice text to test the system.</p>
      </div>

      <div style={card}>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:16 }}>
          <h3 style={{ fontSize:14, fontWeight:600, color:'#e2e8f0' }}>All Invoices ({invoices.length})</h3>
          <button
            onClick={load}
            style={{ background:'none', border:'1px solid #2d2d44', borderRadius:6, padding:'5px 12px', color:'#9ca3af', cursor:'pointer', fontSize:12, display:'flex', alignItems:'center', gap:6 }}
          >
            <RefreshCw size={12}/> Refresh
          </button>
        </div>
        {loading ? (
          <div style={{ textAlign:'center', padding:40, color:'#6b7280', fontSize:13 }}>Loading...</div>
        ) : invoices.length === 0 ? (
          <div style={{ textAlign:'center', padding:40, color:'#4b5563', fontSize:13 }}>No invoices yet. Upload one above to get started.</div>
        ) : (
          <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
            {invoices.map(inv => (
              <div key={inv.invoice_id} style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'12px 14px', background:'#1a1a2e', borderRadius:8, border:'1px solid #2d2d44' }}>
                <div style={{ display:'flex', alignItems:'center', gap:12 }}>
                  {STATUS_ICONS[inv.status] || <FileText size={14} color="#6b7280"/>}
                  <div>
                    <p style={{ fontSize:13, color:'#e2e8f0', fontWeight:500 }}>{inv.invoice_number}</p>
                    <p style={{ fontSize:11, color:'#6b7280' }}>{inv.supplier_name || 'No supplier'} - {inv.currency} {Number(inv.amount || 0).toLocaleString()}</p>
                  </div>
                </div>
                <div style={{ display:'flex', alignItems:'center', gap:14 }}>
                  {inv.risk_score != null && (
                    <span style={{ fontSize:14, fontWeight:700, color: inv.risk_score >= 80 ? '#ef4444' : inv.risk_score >= 60 ? '#f97316' : '#22c55e' }}>
                      {Math.round(inv.risk_score)}
                    </span>
                  )}
                  <span style={{ fontSize:11, color:statusColor(inv.status), background:`${statusColor(inv.status)}20`, padding:'3px 10px', borderRadius:20, fontWeight:600 }}>
                    {inv.status}
                  </span>
                  <span style={{ fontSize:11, color:'#4b5563' }}>{inv.created_at?.slice(0,10)}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

