import axios from 'axios';
import { clearAccessToken, getAccessToken, setAccessToken } from './auth-token';

const API_URL = (
  typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.VITE_API_URL
)
  || process.env.VITE_API_URL
  || process.env.API_URL
  || 'http://localhost:5002';

const API = axios.create({
  baseURL: `${API_URL}/api`,
  timeout: 10000,
  withCredentials: true,
  headers: {
    'Accept': 'application/json'
    // Content-Type se omite intencionalmente para permitir que Axios
    // lo maneje automáticamente según el tipo de datos (FormData, JSON, etc.)
  }
});

const authClient = axios.create({
  baseURL: `${API_URL}/api`,
  timeout: 10000,
  withCredentials: true,
  headers: {
    'Accept': 'application/json'
  }
});

let isRefreshing = false;
let pendingRequests = [];

const processQueue = (error, token = null) => {
  pendingRequests.forEach(({ resolve, reject }) => {
    if (error) {
      reject(error);
    } else {
      resolve(token);
    }
  });
  pendingRequests = [];
};

const refreshAccessToken = async () => {
  const response = await authClient.post('/auth/refresh');
  const accessToken = response.data?.accessToken;
  if (accessToken) {
    setAccessToken(accessToken);
  }
  return accessToken;
};

// Interceptor para logging de peticiones (solo en desarrollo)
if (import.meta.env.DEV || process.env.NODE_ENV === 'development') {
  API.interceptors.request.use(request => {
    console.log('Starting Request:', request.method?.toUpperCase(), request.url);
    return request;
  });
}

API.interceptors.request.use(config => {
  const token = getAccessToken();
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

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
    const originalRequest = error.config;

    if (error.response?.status === 401 && !originalRequest?._retry) {
      if (
        originalRequest?.url?.includes('/auth/login') ||
        originalRequest?.url?.includes('/auth/refresh') ||
        originalRequest?.url?.includes('/auth/verify-pin')
      ) {
        return Promise.reject(error);
      }

      if (isRefreshing) {
        return new Promise((resolve, reject) => {
          pendingRequests.push({ resolve, reject });
        }).then(token => {
          originalRequest.headers.Authorization = `Bearer ${token}`;
          return API(originalRequest);
        });
      }

      originalRequest._retry = true;
      isRefreshing = true;

      return refreshAccessToken()
        .then(token => {
          processQueue(null, token);
          originalRequest.headers.Authorization = `Bearer ${token}`;
          return API(originalRequest);
        })
        .catch(refreshError => {
          processQueue(refreshError, null);
          clearAccessToken();
          window.location.href = '/login';
          return Promise.reject(refreshError);
        })
        .finally(() => {
          isRefreshing = false;
        });
    }

    if (error.response?.status === 403) {
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);

// TODO: Integrar axios-retry para reintentos automáticos si es necesario
// import axiosRetry from 'axios-retry';
// axiosRetry(API, { retries: 3 });

// TODO: Exponer helpers para cancelación de peticiones (AbortController)

export default API;