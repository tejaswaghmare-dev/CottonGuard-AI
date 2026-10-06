import axios from 'axios';
import { auth } from '../firebase';

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || 'http://localhost:5000/api',
  timeout: 120000,
});

api.interceptors.request.use(async (config) => {
  if (auth?.currentUser) {
    const token = await auth.currentUser.getIdToken();
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

api.interceptors.response.use(
  (res) => res,
  (err) => {
    const message = err.response?.data?.message || err.message || 'Request failed';
    return Promise.reject(Object.assign(new Error(message), { status: err.response?.status, data: err.response?.data }));
  }
);

export const authApi = {
  upsertProfile: (payload) => api.post('/auth/profile', payload).then((r) => r.data),
  me: () => api.get('/auth/me').then((r) => r.data),
};

export const farmsApi = {
  list: () => api.get('/farms').then((r) => r.data),
  get: (farmId) => api.get(`/farms/${farmId}`).then((r) => r.data),
  create: (payload) => api.post('/farms', payload).then((r) => r.data),
  update: (farmId, payload) => api.put(`/farms/${farmId}`, payload).then((r) => r.data),
  remove: (farmId) => api.delete(`/farms/${farmId}`).then((r) => r.data),
  predictions: (farmId) => api.get(`/farms/${farmId}/predictions`).then((r) => r.data),
  spread: (farmId) => api.get(`/farms/${farmId}/spread`).then((r) => r.data),
};

export const predictionsApi = {
  create: (farmId, file, notes) => {
    const form = new FormData();
    form.append('farmId', farmId);
    form.append('image', file);
    if (notes) form.append('notes', notes);
    return api.post('/predictions', form, {
      headers: { 'Content-Type': 'multipart/form-data' },
    }).then((r) => r.data);
  },
  get: (id) => api.get(`/predictions/${id}`).then((r) => r.data),
};

export const productsApi = {
  list: (params) => api.get('/products', { params }).then((r) => r.data),
  create: (formData) =>
    api.post('/products', formData, { headers: { 'Content-Type': 'multipart/form-data' } }).then((r) => r.data),
  update: (id, formData) =>
    api.put(`/products/${id}`, formData, { headers: { 'Content-Type': 'multipart/form-data' } }).then((r) => r.data),
  remove: (id) => api.delete(`/products/${id}`).then((r) => r.data),
};

export const doctorsApi = {
  list: () => api.get('/doctors').then((r) => r.data),
  get: (id) => api.get(`/doctors/${id}`).then((r) => r.data),
  setAvailability: (slots) => api.post('/doctors/availability', { slots }).then((r) => r.data),
  updateProfile: (payload) => api.put('/doctors/profile', payload).then((r) => r.data),
  farmerHistory: (farmerId, farmId) =>
    api.get(`/doctors/farmer/${farmerId}/history`, { params: { farmId } }).then((r) => r.data),
};

export const consultationsApi = {
  book: (payload) => api.post('/consultations', payload).then((r) => r.data),
  list: () => api.get('/consultations').then((r) => r.data),
  get: (id) => api.get(`/consultations/${id}`).then((r) => r.data),
  update: (id, payload) => api.put(`/consultations/${id}`, payload).then((r) => r.data),
  quota: () => api.get('/consultations/quota').then((r) => r.data),

  downloadDoctorReport: (id) =>
  api.get(`/consultations/${id}/report/pdf`, {
    responseType: 'blob',
  }),
};

export const chatApi = {
  send: (payload) => api.post('/chat', payload).then((r) => r.data),
  voice: (payload) => api.post('/chat/voice', payload).then((r) => r.data),
};

export const paymentApi = {
  create: (payload) => api.post('/payment/create', payload).then((r) => r.data),
  confirm: (paymentId) => api.post('/payment/confirm', { paymentId }).then((r) => r.data),
};

export default api;
