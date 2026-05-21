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

// Refresh proactivo coordinado con el lock interno del interceptor:
// si ya hay un refresh en vuelo, se engancha a esa misma promesa en lugar
// de disparar uno paralelo (evita race conditions con el bloque del 401).
export const triggerTokenRefresh = () => {
  if (isRefreshing) {
    return new Promise((resolve, reject) => {
      pendingRequests.push({ resolve, reject });
    });
  }
  isRefreshing = true;
  return refreshAccessToken()
    .then((token) => {
      processQueue(null, token);
      return token;
    })
    .catch((err) => {
      processQueue(err, null);
      throw err;
    })
    .finally(() => {
      isRefreshing = false;
    });
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
        // Sólo excluir verify-pin si el servidor devuelve valid:false (PIN incorrecto).
        // Si valid es undefined, es el middleware de auth rechazando por token expirado
        // → dejar pasar al bloque de refresh para que se renueve y se reintente.
        (originalRequest?.url?.includes('/auth/verify-pin') && error.response?.data?.valid === false)
      ) {
        return Promise.reject(error);
      }

      if (isRefreshing) {
        return new Promise((resolve, reject) => {
          pendingRequests.push({ resolve, reject });
        }).then(token => {
          // Marcamos _retry también para los requests encolados. Si por algún
          // motivo este reintento vuelve a recibir 401, no debe entrar de
          // nuevo al ciclo de refresh (evita un segundo refresh innecesario
          // o un bucle si el nuevo access token también se rechaza).
          originalRequest._retry = true;
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
          // Preservar la ruta actual para volver tras el login. Sin esto,
          // el usuario que estaba en /patient/123 acaba siempre en /.
          const currentPath = window.location.pathname + window.location.search;
          if (currentPath && !currentPath.startsWith('/login')) {
            window.location.href = `/login?from=${encodeURIComponent(currentPath)}`;
          } else {
            window.location.href = '/login';
          }
          return Promise.reject(refreshError);
        })
        .finally(() => {
          isRefreshing = false;
        });
    }

    // No redirigir automáticamente en 403: muchos 403 son "permiso
    // insuficiente para esta acción" con la sesión perfectamente válida.
    // Forzar /login en esos casos rompía el flujo del usuario. Cada vista
    // debe manejar el 403 mostrando un mensaje de "no autorizado".
    return Promise.reject(error);
  }
);

// TODO: Integrar axios-retry para reintentos automáticos si es necesario
// import axiosRetry from 'axios-retry';
// axiosRetry(API, { retries: 3 });

// TODO: Exponer helpers para cancelación de peticiones (AbortController)

export default API;