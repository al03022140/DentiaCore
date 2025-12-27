import axios from 'axios';

const API_URL = (
  typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.VITE_API_URL
)
  || process.env.VITE_API_URL
  || process.env.API_URL
  || 'http://localhost:5002';

const API = axios.create({
  baseURL: `${API_URL}/api`,
  timeout: 10000,
  headers: {
    'Accept': 'application/json'
    // Content-Type se omite intencionalmente para permitir que Axios
    // lo maneje automáticamente según el tipo de datos (FormData, JSON, etc.)
  }
});

// Interceptor para logging de peticiones (solo en desarrollo)
if (import.meta.env.DEV || process.env.NODE_ENV === 'development') {
  API.interceptors.request.use(request => {
    console.log('Starting Request:', request.method?.toUpperCase(), request.url);
    return request;
  });
}

API.interceptors.response.use(
  response => {
    if (import.meta.env.DEV || process.env.NODE_ENV === 'development') {
      console.log('Response:', response.status, response.config.url);
    }
    return response;
  },
  error => {
    if (import.meta.env.DEV || process.env.NODE_ENV === 'development') {
      console.error('API Error:', error.response?.status, error.config?.url, error.message);
    }
    // Manejo global de errores de autenticación
    if (error.response?.status === 401 || error.response?.status === 403) {
      // TODO: Implementar logout() o redirección a login
      // Por ejemplo: window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);

// TODO: Integrar axios-retry para reintentos automáticos si es necesario
// import axiosRetry from 'axios-retry';
// axiosRetry(API, { retries: 3 });

// TODO: Exponer helpers para cancelación de peticiones (AbortController)

export default API;