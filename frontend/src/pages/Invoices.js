import React, { useEffect, useRef, useState } from 'react';
import {
  CheckCircle,
  Clock,
  FileText,
  Image as ImageIcon,
  RefreshCw,
  ScanSearch,
  Upload,
  XCircle,
  AlertTriangle,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { invoiceApi, opsApi, supplierApi } from '../services/api';

const RISK_COLORS = { approved: 'var(--green)', blocked: 'var(--red)', under_review: 'var(--amber)', processing: 'var(--cyan)' };

const STATUS_ICONS = {
  pending: <Clock size={14} color="var(--text-secondary)" />,
  processing: <RefreshCw size={14} color="var(--cyan)" />,
  approved: <CheckCircle size={14} color="var(--green)" />,
  blocked: <XCircle size={14} color="var(--red)" />,
  under_review: <AlertTriangle size={14} color="var(--amber)" />,
};

function toMB(bytes) {
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function getRenderableOcrFields(fields) {
  if (!fields) return [];
  const preferredOrder = [
    'supplier_name',
    'invoice_number',
    'invoice_date',
    'due_date',
    'po_number',
    'reference',
    'bill_to',
    'payment_terms',
    'currency',
    'subtotal',
    'tax',
    'discount',
    'total_amount',
  ];
  const seen = new Set();
  const ordered = [];

  preferredOrder.forEach((key) => {
    if (key in fields) {
      ordered.push([key, fields[key]]);
      seen.add(key);
    }
  });

  Object.entries(fields).forEach(([key, value]) => {
    if (key !== 'confidence' && !seen.has(key)) ordered.push([key, value]);
  });

  return ordered;
}

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
  const [dragOver, setDragOver] = useState(false);
  const [selectedFile, setSelectedFile] = useState(null);
  const pollingRef = useRef(null);
  const fileRef = useRef();
  const navigate = useNavigate();

  const [form, setForm] = useState({ supplier_id: '', invoice_number: '', amount: '', currency: 'USD' });

  useEffect(() => {
    load();
    supplierApi.list().then((r) => setSuppliers(r.data.suppliers || [])).catch(console.error);
    opsApi.ocrStatus().then((r) => setOcrStatus(r.data)).catch(() => setOcrStatus({ available: false }));
    return () => {
      if (pollingRef.current) clearInterval(pollingRef.current);
    };
  }, []);

  const load = () => {
    invoiceApi
      .list({})
      .then((r) => setInvoices(r.data.invoices || []))
      .catch(console.error)
      .finally(() => setLoading(false));
  };

  const startPolling = (jobId) => {
    pollingRef.current = setInterval(async () => {
      try {
        const r = await invoiceApi.getResult(jobId);
        if (r.data.status === 'completed') {
          clearInterval(pollingRef.current);
          pollingRef.current = null;
          const result = r.data.result || {};
          setAnalysisResult(result);
          const pipelineLabel = result.langgraph ? 'LangGraph' : 'Legacy';
          const stepLabel = result.step_index && result.total_steps ? ` - Step ${result.step_index}/${result.total_steps}` : '';
          setUploadStatus(`Analysis complete! Risk Score: ${Math.round(result.risk_score || 0)}/100 - Decision: ${String(result.decision || '').toUpperCase()} - Pipeline: ${pipelineLabel}${stepLabel}`);
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
  };

  const handleUpload = async (file) => {
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
    setSelectedFile(file);
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
      setSelectedFile(null);
      load();
      startPolling(jobId);
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
      setUploadStatus(res.data?.passed ? 'OCR smoke test passed with a generated invoice screenshot.' : `OCR smoke test failed: ${res.data?.error || 'unknown error'}`);
    } catch (e) {
      setUploadStatus(`OCR smoke test failed: ${e.response?.data?.detail || e.message}`);
    } finally {
      setOcrTesting(false);
    }
  };

  const ocrReady = Boolean(ocrStatus?.available);

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', gap: 16, marginBottom: 22, flexWrap: 'wrap' }}>
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 800, color: 'var(--text-primary)' }}>INVOICES</h1>
          <div className="jet-mono" style={{ fontSize: 11, color: 'var(--text-dim)', marginTop: 8 }}>
            Submit documents into the fraud pipeline
          </div>
        </div>
        <div
          className="pill"
          style={{
            border: `1px solid ${ocrReady ? 'rgba(0,232,135,0.3)' : 'rgba(255,58,92,0.3)'}`,
            background: ocrReady ? 'rgba(0,232,135,0.1)' : 'rgba(255,58,92,0.1)',
            color: ocrReady ? 'var(--green)' : 'var(--red)',
          }}
        >
          <ScanSearch size={11} />
          {ocrReady ? `OCR READY${ocrStatus?.version ? ` - ${ocrStatus.version}` : ''}` : 'OCR MISSING'}
        </div>
      </div>

      <div className="panel" style={{ padding: 22, marginBottom: 20 }}>
        <div
          className="panel"
          style={{
            padding: 18,
            border: `2px dashed ${dragOver ? 'var(--cyan)' : 'var(--border)'}`,
            borderRadius: 'var(--radius-xl)',
            background: dragOver ? 'var(--cyan-glow)' : 'var(--bg-surface)',
            transition: 'all 200ms ease',
            cursor: 'pointer',
            textAlign: 'center',
            marginBottom: 16,
          }}
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragOver(false);
            const file = e.dataTransfer.files?.[0];
            if (file) handleUpload(file);
          }}
          onClick={() => fileRef.current?.click()}
        >
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
            {selectedFile ? <CheckCircle size={42} color="var(--green)" /> : <Upload size={50} color="var(--cyan)" />}
            <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--text-primary)' }}>
              {selectedFile ? selectedFile.name : 'DROP INVOICE FILE HERE'}
            </div>
            <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
              {selectedFile ? `${toMB(selectedFile.size)} - ready to analyze` : 'or click to browse - PDF, PNG, JPG, TXT'}
            </div>
            {!selectedFile && (
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'center' }}>
                {['PDF', 'PNG', 'JPG', 'TXT'].map((item) => (
                  <span key={item} className="pill" style={{ background: 'var(--bg-elevated)', color: 'var(--text-secondary)', border: '1px solid var(--border)' }}>
                    {item}
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>

        <input
          ref={fileRef}
          type="file"
          accept=".pdf,.png,.jpg,.jpeg,.txt"
          style={{ display: 'none' }}
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) {
              setSelectedFile(file);
              handleUpload(file);
            }
          }}
        />

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(180px,1fr))', gap: 12, marginBottom: 14 }}>
          <select
            value={form.supplier_id}
            onChange={(e) => setForm({ ...form, supplier_id: e.target.value })}
            style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 10, padding: '10px 12px', color: 'var(--text-primary)', fontSize: 13, outline: 'none' }}
          >
            <option value="">Select supplier (optional)</option>
            {suppliers.map((supplier) => (
              <option key={supplier.supplier_id} value={supplier.supplier_id}>
                {supplier.name}
              </option>
            ))}
          </select>
          <input
            value={form.invoice_number}
            onChange={(e) => setForm({ ...form, invoice_number: e.target.value })}
            placeholder="Invoice number"
            style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 10, padding: '10px 12px', color: 'var(--text-primary)', fontSize: 13, outline: 'none' }}
          />
          <input
            value={form.amount}
            onChange={(e) => setForm({ ...form, amount: e.target.value })}
            placeholder="Amount"
            type="number"
            style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 10, padding: '10px 12px', color: 'var(--text-primary)', fontSize: 13, outline: 'none' }}
          />
          <select
            value={form.currency}
            onChange={(e) => setForm({ ...form, currency: e.target.value })}
            style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 10, padding: '10px 12px', color: 'var(--text-primary)', fontSize: 13, outline: 'none' }}
          >
            {['USD', 'EUR', 'GBP', 'INR', 'JPY', 'AED'].map((currency) => (
              <option key={currency}>{currency}</option>
            ))}
          </select>
        </div>

        <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
          <button
            onClick={runOcrTest}
            disabled={ocrTesting}
            style={{
              padding: '10px 16px',
              background: 'rgba(0,212,255,0.08)',
              border: '1px solid rgba(0,212,255,0.24)',
              borderRadius: 10,
              color: 'var(--cyan)',
              cursor: ocrTesting ? 'not-allowed' : 'pointer',
              fontSize: 13,
              fontWeight: 600,
              whiteSpace: 'nowrap',
              opacity: ocrTesting ? 0.7 : 1,
              display: 'flex',
              alignItems: 'center',
              gap: 8,
            }}
          >
            <ImageIcon size={14} />
            {ocrTesting ? 'Testing OCR...' : 'Test OCR'}
          </button>
          <button
            onClick={() => handleUpload(fileRef.current?.files?.[0])}
            disabled={uploading}
            className="scanner-line"
            style={{
              padding: '10px 18px',
              background: 'linear-gradient(135deg, var(--violet-dim), var(--violet))',
              border: '1px solid var(--violet)',
              borderRadius: 10,
              color: '#fff',
              cursor: uploading ? 'not-allowed' : 'pointer',
              fontSize: 13,
              fontWeight: 600,
              whiteSpace: 'nowrap',
              opacity: uploading ? 0.7 : 1,
              boxShadow: '0 8px 24px rgba(124,111,255,0.35)',
            }}
          >
            {uploading ? 'Uploading...' : 'Analyze Invoice'}
          </button>
        </div>

        {uploadStatus && (
          <div style={{ marginTop: 12, padding: '10px 14px', background: 'rgba(0,212,255,0.06)', border: '1px solid rgba(0,212,255,0.2)', borderRadius: 10, fontSize: 13, color: 'var(--cyan)' }}>
            {uploadStatus}
          </div>
        )}

        {analysisResult && (
          <div className="panel" style={{ marginTop: 12, padding: 14 }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(180px,1fr))', gap: 10 }}>
              <div style={{ padding: '10px 12px', background: 'var(--bg-elevated)', borderRadius: 10, border: '1px solid var(--border)' }}>
                <div className="jet-mono" style={{ fontSize: 10, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: 1.2, marginBottom: 4 }}>Pipeline</div>
                <div style={{ fontSize: 13, color: analysisResult.langgraph ? 'var(--green)' : 'var(--amber)', fontWeight: 700 }}>
                  {analysisResult.langgraph ? 'LangGraph' : 'Legacy'}
                </div>
              </div>
              <div style={{ padding: '10px 12px', background: 'var(--bg-elevated)', borderRadius: 10, border: '1px solid var(--border)' }}>
                <div className="jet-mono" style={{ fontSize: 10, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: 1.2, marginBottom: 4 }}>Decision</div>
                <div style={{ fontSize: 13, color: 'var(--text-primary)', fontWeight: 700 }}>
                  {String(analysisResult.decision || 'n/a').toUpperCase()}
                </div>
              </div>
              <div style={{ padding: '10px 12px', background: 'var(--bg-elevated)', borderRadius: 10, border: '1px solid var(--border)' }}>
                <div className="jet-mono" style={{ fontSize: 10, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: 1.2, marginBottom: 4 }}>Risk Score</div>
                <div style={{ fontSize: 13, color: 'var(--text-primary)', fontWeight: 700 }}>
                  {Math.round(analysisResult.risk_score || 0)}/100
                </div>
              </div>
              <div style={{ padding: '10px 12px', background: 'var(--bg-elevated)', borderRadius: 10, border: '1px solid var(--border)' }}>
                <div className="jet-mono" style={{ fontSize: 10, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: 1.2, marginBottom: 4 }}>Execution</div>
                <div style={{ fontSize: 13, color: 'var(--text-primary)', fontWeight: 700 }}>
                  {analysisResult.step_index && analysisResult.total_steps
                    ? `${analysisResult.step_index}/${analysisResult.total_steps} steps`
                    : 'n/a'}
                </div>
              </div>
            </div>
          </div>
        )}

        {analysisResult?.step_history?.length > 0 && (
          <div className="panel" style={{ marginTop: 12, padding: 14 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 10 }}>
              <strong style={{ color: 'var(--text-primary)', fontSize: 13 }}>Execution Trace</strong>
              <span className="jet-mono" style={{ fontSize: 11, color: 'var(--text-dim)' }}>
                {analysisResult.step_history.length} recorded steps
              </span>
            </div>
            <pre style={{ margin: 0, whiteSpace: 'pre-wrap', wordBreak: 'break-word', color: 'var(--text-primary)', fontSize: 12, lineHeight: 1.6, maxHeight: 220, overflow: 'auto' }}>
              {analysisResult.step_history.map((step) => `${String(step.step_index).padStart(2, '0')}. ${step.label}`).join('\n')}
            </pre>
          </div>
        )}

        {analysisResult?.extracted_text_preview && (
          <div className="panel" style={{ marginTop: 12, padding: 14 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 10 }}>
              <strong style={{ color: 'var(--text-primary)', fontSize: 13 }}>OCR Extracted Text Preview</strong>
              <span className="jet-mono" style={{ fontSize: 11, color: 'var(--text-dim)' }}>
                {analysisResult.extracted_text_length || analysisResult.extracted_text_preview.length} chars
              </span>
            </div>
            <pre style={{ margin: 0, whiteSpace: 'pre-wrap', wordBreak: 'break-word', color: 'var(--text-primary)', fontSize: 12, lineHeight: 1.6, maxHeight: 180, overflow: 'auto' }}>
              {analysisResult.extracted_text_preview}
            </pre>
          </div>
        )}

        {analysisResult?.ocr_fields && (
          <div className="panel" style={{ marginTop: 12, padding: 14 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 10 }}>
              <strong style={{ color: 'var(--text-primary)', fontSize: 13 }}>OCR Parsed Fields</strong>
              <span className="jet-mono" style={{ fontSize: 11, color: 'var(--text-dim)' }}>
                Confidence {Math.round((analysisResult.ocr_fields.confidence || 0) * 100)}%
              </span>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(180px,1fr))', gap: 10 }}>
              {getRenderableOcrFields(analysisResult.ocr_fields).map(([label, value]) => (
                <div key={label} style={{ padding: '10px 12px', background: 'var(--bg-elevated)', borderRadius: 10, border: '1px solid var(--border)' }}>
                  <div className="jet-mono" style={{ fontSize: 10, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: 1.2, marginBottom: 4 }}>{label}</div>
                  <div style={{ fontSize: 13, color: 'var(--text-primary)', wordBreak: 'break-word' }}>{value != null && value !== '' ? String(value) : 'n/a'}</div>
                </div>
              ))}
            </div>
          </div>
        )}

        {ocrTestResult && (
          <div className="panel" style={{ marginTop: 12, padding: 14 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 12 }}>
              <strong style={{ color: 'var(--text-primary)', fontSize: 13 }}>OCR Smoke Test</strong>
              <span
                className="pill"
                style={{
                  background: ocrTestResult.passed ? 'rgba(0,232,135,0.1)' : 'rgba(255,58,92,0.1)',
                  color: ocrTestResult.passed ? 'var(--green)' : 'var(--red)',
                  border: `1px solid ${ocrTestResult.passed ? 'rgba(0,232,135,0.25)' : 'rgba(255,58,92,0.25)'}`,
                }}
              >
                {ocrTestResult.passed ? 'Passed' : 'Failed'}
              </span>
            </div>
            {ocrTestResult.image_data_url && (
              <div style={{ marginBottom: 12, border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden', background: '#fff' }}>
                <img src={ocrTestResult.image_data_url} alt="OCR sample invoice" style={{ width: '100%', display: 'block' }} />
              </div>
            )}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(280px,1fr))', gap: 12 }}>
              <div>
                <div className="jet-mono" style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: 1, color: 'var(--text-dim)', marginBottom: 6 }}>
                  Sample Text
                </div>
                <pre style={{ margin: 0, whiteSpace: 'pre-wrap', wordBreak: 'break-word', color: 'var(--text-primary)', fontSize: 12, lineHeight: 1.6, maxHeight: 180, overflow: 'auto' }}>
                  {ocrTestResult.sample_text}
                </pre>
              </div>
              <div>
                <div className="jet-mono" style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: 1, color: 'var(--text-dim)', marginBottom: 6 }}>
                  Extracted Text
                </div>
                <pre style={{ margin: 0, whiteSpace: 'pre-wrap', wordBreak: 'break-word', color: 'var(--text-primary)', fontSize: 12, lineHeight: 1.6, maxHeight: 180, overflow: 'auto' }}>
                  {ocrTestResult.extracted_text || '[No text extracted]'}
                </pre>
              </div>
            </div>
          </div>
        )}
      </div>

      <div className="panel" style={{ padding: 22 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <h3 style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)' }}>ALL INVOICES ({invoices.length})</h3>
          <button
            onClick={load}
            style={{
              background: 'transparent',
              border: '1px solid var(--border)',
              borderRadius: 10,
              padding: '7px 12px',
              color: 'var(--text-secondary)',
              cursor: 'pointer',
              fontSize: 12,
              display: 'flex',
              alignItems: 'center',
              gap: 6,
            }}
          >
            <RefreshCw size={12} /> Refresh
          </button>
        </div>
        {loading ? (
          <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-dim)', fontSize: 13 }}>Loading...</div>
        ) : invoices.length === 0 ? (
          <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-dim)', fontSize: 13 }}>No invoices yet. Upload one above to get started.</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {invoices.map((invoice, index) => (
              <div
                key={invoice.invoice_id}
                onClick={() => invoice.alert?.alert_id && navigate(`/alerts/${invoice.alert.alert_id}`)}
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  padding: '13px 14px',
                  background: index % 2 === 0 ? 'var(--bg-surface)' : 'var(--bg-deep)',
                  borderRadius: 12,
                  border: '1px solid var(--border)',
                  cursor: invoice.alert?.alert_id ? 'pointer' : 'default',
                  transition: 'all 160ms ease',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = 'var(--bg-elevated)';
                  e.currentTarget.style.borderColor = 'var(--border-hover)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = index % 2 === 0 ? 'var(--bg-surface)' : 'var(--bg-deep)';
                  e.currentTarget.style.borderColor = 'var(--border)';
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 }}>
                  {STATUS_ICONS[invoice.status] || <FileText size={14} color="var(--text-secondary)" />}
                  <div style={{ minWidth: 0 }}>
                    <p style={{ fontSize: 13, color: 'var(--text-primary)', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {invoice.invoice_number}
                    </p>
                    <p className="jet-mono" style={{ fontSize: 11, color: 'var(--text-dim)', marginTop: 4 }}>
                      {invoice.supplier_name || 'No supplier'} - {invoice.currency} {Number(invoice.amount || 0).toLocaleString()}
                    </p>
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                  {invoice.risk_score != null && (
                    <span className="jet-mono" style={{ fontSize: 14, fontWeight: 700, color: Number(invoice.risk_score) >= 80 ? 'var(--red)' : Number(invoice.risk_score) >= 60 ? 'var(--amber)' : 'var(--green)' }}>
                      {Math.round(invoice.risk_score)}
                    </span>
                  )}
                  <span className="pill" style={{ background: `${RISK_COLORS[invoice.status] || 'var(--text-secondary)'}18`, color: RISK_COLORS[invoice.status] || 'var(--text-secondary)', border: '1px solid var(--border)' }}>
                    {invoice.status}
                  </span>
                  <span className="jet-mono" style={{ fontSize: 11, color: 'var(--text-dim)' }}>{invoice.created_at?.slice(0, 10)}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
