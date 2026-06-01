// A-2: el access token (JWT de la app) se mantiene SOLO EN MEMORIA, no en
// localStorage. Un token en localStorage es legible por cualquier script
// inyectado (XSS) — crítico en una app con PHI. La sesión persiste igualmente
// porque el backend emite una cookie httpOnly de refresh: al recargar, el
// bootstrap del AuthContext llama a /auth/refresh y rehidrata el access token
// en memoria. Al cerrar pestaña se pierde el token en memoria, pero la cookie
// permite recuperar la sesión silenciosamente (o caer a /login si expiró).
//
// Nota: se migran (y limpian) tokens previos que hubieran quedado en
// localStorage de versiones anteriores, para no dejar el secreto allí.
const LEGACY_KEY = 'dentia_access_token';

let inMemoryToken = null;

try {
  // Limpieza única de cualquier token heredado en localStorage.
  if (typeof localStorage !== 'undefined' && localStorage.getItem(LEGACY_KEY)) {
    localStorage.removeItem(LEGACY_KEY);
  }
} catch (_e) {
  // localStorage no disponible — sin problema, sólo usamos memoria.
}

export const getAccessToken = () => inMemoryToken;

export const setAccessToken = (token) => {
  inMemoryToken = token || null;
};

export const clearAccessToken = () => {
  inMemoryToken = null;
};
