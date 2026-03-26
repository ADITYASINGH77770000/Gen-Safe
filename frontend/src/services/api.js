import axios from 'axios';

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:8000';

const api = axios.create({ baseURL: API_URL });

// Attach token to every request
api.interceptors.request.use(cfg => {
  const token = localStorage.getItem('token');
  if (token) cfg.headers.Authorization = `Bearer ${token}`;
  return cfg;
});

// Auto-logout on 401
api.interceptors.response.use(
  r => r,
  err => {
    if (err.response?.status === 401) {
      localStorage.removeItem('token');
      window.location.href = '/login';
    }
    return Promise.reject(err);
  }
);

export const authApi = {
  login: (email, password) => {
    const form = new FormData();
    form.append('username', email);
    form.append('password', password);
    return api.post('/api/v1/auth/login', form);
  },
  me: () => api.get('/api/v1/auth/me'),
};

export const invoiceApi = {
  submit: (formData) => api.post('/api/v1/invoice/analyze', formData),
  getResult: (jobId) => api.get(`/api/v1/invoice/${jobId}/result`),
  list: (params) => api.get('/api/v1/invoice/list', { params }),
  get: (id) => api.get(`/api/v1/invoice/${id}`),
};

export const alertApi = {
  list: (params) => api.get('/api/v1/alert/list', { params }),
  get: (id) => api.get(`/api/v1/alert/${id}`),
  feedback: (id, data) => api.post(`/api/v1/alert/${id}/feedback`, data),
  resolve: (id) => api.patch(`/api/v1/alert/${id}/resolve`),
};

export const supplierApi = {
  list: () => api.get('/api/v1/supplier/list'),
  register: (data) => api.post('/api/v1/supplier/register', data),
  profile: (id) => api.get(`/api/v1/supplier/${id}/profile`),
};

export const dashboardApi = {
  summary: () => api.get('/api/v1/dashboard/summary'),
  analytics: (days) => api.get('/api/v1/dashboard/analytics', { params: { days } }),
};

export const taskApi = {
  list: (params) => api.get('/api/v1/task/list', { params }),
  extractFromMeeting: (data) => api.post('/api/v1/task/extract-from-meeting', data),
  update: (id, data) => api.patch(`/api/v1/task/${id}`, data),
};

export const auditApi = {
  trail: (params) => api.get('/api/v1/audit/trail', { params }),
  stats: () => api.get('/api/v1/audit/stats'),
  integrity: (params) => api.get('/api/v1/audit/integrity', { params }),
  retention: (params) => api.get('/api/v1/audit/retention', { params }),
};

export const webhookApi = {
  simulateErp: (data) => api.post('/api/v1/webhook/erp', data),
  quickbooks: (data) => api.post('/api/v1/webhook/quickbooks', data),
  xero: (data) => api.post('/api/v1/webhook/xero', data),
};

export const opsApi = {
  health: () => api.get('/api/v1/ops/health'),
  security: () => api.get('/api/v1/ops/security'),
  ocrStatus: () => api.get('/api/v1/ops/ocr-status'),
  ocrTest: () => api.get('/api/v1/ops/ocr-test'),
  runEscalations: () => api.post('/api/v1/ops/run-escalations'),
  traceMessages: (traceId, limit = 200) => api.get(`/api/v1/ops/trace/${traceId}/messages`, { params: { limit } }),
};

export const integrationApi = {
  providers: () => api.get('/api/v1/integration/providers'),
  configure: (provider, data) => api.post(`/api/v1/integration/${provider}/configure`, data),
  authUrl: (provider) => api.get(`/api/v1/integration/${provider}/auth-url`),
  status: (provider) => api.get(`/api/v1/integration/${provider}/status`),
  refresh: (provider) => api.post(`/api/v1/integration/${provider}/refresh`),
};

export default api;
