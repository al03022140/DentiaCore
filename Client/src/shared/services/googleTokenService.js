// ── Tokens de Google Calendar (helpers compartidos) ───────────────────────────
// Usado por main-page/components/calendar.jsx y consultas/components/
// CreateAppointmentModal.jsx para no duplicar la lógica de obtención/renovación.
//
// A-3/A-4: el refresh token de Google NUNCA se guarda en el cliente. Vive sólo
// en la cookie httpOnly `google_refresh_token` (server-side). En localStorage
// se persiste únicamente el access token (corta vida) + expiración + un
// MARCADOR no-secreto ('cookie') para que la lógica de renovación (que se
// apoya en `refreshToken` para decidir si puede renovar) siga funcionando sin
// exponer ningún secreto a XSS/localStorage.
//
// Los endpoints /google/auth/token y /google/refresh-token exigen la sesión de
// la app (middleware authenticate → JWT en Authorization). Por eso se usa la
// instancia compartida de axios (API): su interceptor adjunta el Bearer del
// JWT en memoria, renueva la sesión y reintenta ante 401, y withCredentials
// envía las cookies httpOnly de Google que el server necesita.
import API from './axios-instance';

const GOOGLE_TOKEN_KEY = 'accessToken';
export const REFRESH_MARKER = 'cookie';

export const storeGoogleTokenWithExpiration = (token, expiresIn = 3600) => {
  const expirationTime = Date.now() + expiresIn * 1000;
  localStorage.setItem(
    GOOGLE_TOKEN_KEY,
    JSON.stringify({ token, expiration: expirationTime, refreshToken: REFRESH_MARKER })
  );
};

export const getStoredGoogleToken = () => {
  try {
    const tokenData = localStorage.getItem(GOOGLE_TOKEN_KEY);
    if (!tokenData) return null;
    if (!tokenData.startsWith('{')) return tokenData;
    const parsed = JSON.parse(tokenData);
    if (!parsed.token || !parsed.expiration) return parsed.token || parsed;
    const timeUntilExpiry = parsed.expiration - Date.now();
    if (timeUntilExpiry > 0) {
      return { token: parsed.token, refreshToken: parsed.refreshToken, needsRefresh: timeUntilExpiry < 5 * 60 * 1000 };
    }
    if (!parsed.refreshToken) localStorage.removeItem(GOOGLE_TOKEN_KEY);
    return parsed.refreshToken ? { token: null, refreshToken: parsed.refreshToken, needsRefresh: true } : null;
  } catch {
    localStorage.removeItem(GOOGLE_TOKEN_KEY);
    return null;
  }
};

// Renueva el access token de Google server-side: el refresh token viaja en la
// cookie httpOnly, por lo que el body va vacío. Devuelve el nuevo access token
// o null si no se pudo renovar.
export const renewGoogleAccessToken = async () => {
  try {
    const { data } = await API.post('/google/refresh-token', {});
    storeGoogleTokenWithExpiration(data.accessToken, data.expiresIn);
    return data.accessToken;
  } catch (error) {
    // El servidor respondió (p. ej. 400 sin cookie de refresh o 500 de
    // Google): el marcador local ya no sirve → limpiarlo para que la UI
    // muestre "reconectar". Un error de red (sin response) no invalida nada.
    // Nota: el 401 de sesión de la app lo resuelve el interceptor de axios
    // (refresh + reintento) antes de llegar aquí.
    if (error.response) {
      localStorage.removeItem(GOOGLE_TOKEN_KEY);
    }
    return null;
  }
};

// Lee el access token recién emitido tras el OAuth callback (el server lo dejó
// en cookie httpOnly y ?google_auth=success). Lo persiste y lo devuelve junto
// con su expiración. Lanza si el server rechaza (el caller decide el mensaje).
export const fetchGoogleSessionToken = async () => {
  const { data } = await API.get('/google/auth/token');
  storeGoogleTokenWithExpiration(data.accessToken, data.expiresIn);
  return data;
};

// "Access token de Google fresco": devuelve el vigente, renovándolo vía cookie
// si expiró o está por expirar. Devuelve null si no hay sesión de Google.
export const getFreshGoogleToken = async () => {
  const stored = getStoredGoogleToken();
  if (!stored) return null;
  if (typeof stored === 'string') return stored;
  if (stored.token && !stored.needsRefresh) return stored.token;
  if (stored.refreshToken) {
    const renewed = await renewGoogleAccessToken();
    if (renewed) return renewed;
  }
  // Renovación fallida: si el token actual aún no expira, úsalo como último recurso.
  return stored.token || null;
};
