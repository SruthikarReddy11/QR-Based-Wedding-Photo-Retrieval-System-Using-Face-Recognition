import axios from 'axios';

export const API_BASE = import.meta.env.VITE_API_URL
  ? import.meta.env.VITE_API_URL.replace(/\/api\/v1\/?$/, '')
  : typeof window !== 'undefined' && !['localhost', '127.0.0.1'].includes(window.location.hostname)
  ? window.location.origin
  : 'http://localhost:5000';

export const getImageUrl = (path: string): string => {
  if (!path) return '';
  if (path.startsWith('http://') || path.startsWith('https://')) return path;
  return `${API_BASE}${path.startsWith('/') ? '' : '/'}${path}`;
};

export const api = axios.create({
  baseURL:
    import.meta.env.VITE_API_URL ||
    (typeof window !== 'undefined' && !['localhost', '127.0.0.1'].includes(window.location.hostname)
      ? `${window.location.origin}/api/v1`
      : 'http://localhost:5000/api/v1'),
  headers: {
    'Content-Type': 'application/json',
  },
});

api.interceptors.request.use((config) => {
  // If authorization header is already explicitly provided (e.g. from getAdminHeaders), preserve it
  const existingAuth =
    config.headers.get?.('Authorization') ||
    config.headers.Authorization ||
    (config.headers as any)['authorization'];

  if (!existingAuth) {
    const isAdminRoute = config.url?.includes('/admin') && !config.url?.includes('/admin/verify-pin');
    const adminToken = localStorage.getItem('wedsnap_admin_token');
    const userToken = localStorage.getItem('wedsnap_token');

    if (isAdminRoute && adminToken) {
      config.headers.Authorization = `Bearer ${adminToken}`;
    } else if (userToken) {
      config.headers.Authorization = `Bearer ${userToken}`;
    }
  }
  return config;
});

api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      const isAdminRoute = error.config?.url?.includes('/admin');
      if (!isAdminRoute) {
        localStorage.removeItem('wedsnap_token');
        localStorage.removeItem('wedsnap_user');
        if (window.location.pathname.startsWith('/dashboard')) {
          window.location.href = '/login';
        }
      }
    }
    return Promise.reject(error);
  }
);

