import { useCallback, useEffect, useRef } from 'react';
import { useAuth } from '../../app/auth/AuthContext';
import { triggerTokenRefresh } from '../services/axios-instance';
import { getAccessToken } from '../services/auth-token';

// Refresca con margen antes de que el access token (15 min por defecto)
// expire. 10 min cubre cómodamente cualquier valor razonable de JWT_ACCESS_TTL.
const HEARTBEAT_MS = 10 * 60 * 1000;
// Throttle: no refrescar más de una vez por minuto aunque el usuario alterne
// foco rápidamente entre apps. Un refresh exitoso renueva por 15 min, así
// que pegarle cada visibilitychange sería gasto puro.
const MIN_INTERVAL_MS = 60 * 1000;

/**
 * Mantiene viva la sesión refrescando el access token de forma proactiva:
 *
 *  - Al recuperar foco/visibilidad de la ventana (caso del bug: el usuario
 *    estaba en otra app y vuelve a DentiaCore con el token ya vencido en
 *    segundo plano).
 *  - Cada 10 minutos como heartbeat para sesiones largas activas.
 *
 * El refresh respeta el lock interno del interceptor de axios — si éste
 * dispara su propio refresh al recibir un 401, no se ejecutan dos en paralelo.
 *
 * Si el refresh falla (refresh token también expirado / revocado), no
 * forzamos logout aquí: dejamos que el siguiente request real reciba 401 y
 * que el interceptor maneje el redirect. Así, si justo en ese momento hay
 * un borrador pendiente, `useDraftPersistence` ya lo guardó en localStorage.
 */
export const useSessionKeepAlive = () => {
  const { user } = useAuth();
  const lastRefreshRef = useRef(0);
  const inFlightRef = useRef(false);

  const tryRefresh = useCallback(async (reason) => {
    if (!user) return;
    if (!getAccessToken()) return;
    if (inFlightRef.current) return;
    const now = Date.now();
    if (now - lastRefreshRef.current < MIN_INTERVAL_MS) return;

    inFlightRef.current = true;
    try {
      await triggerTokenRefresh();
      lastRefreshRef.current = Date.now();
    } catch (err) {
      // Silencioso. El refresh puede fallar legítimamente (refresh token
      // expirado tras 7 días). El interceptor manejará el 401 cuando el
      // usuario interactúe; en ese punto los drafts ya están en localStorage.
      if (import.meta.env.DEV) {
        console.debug('[SessionKeepAlive] refresh falló (', reason, '):', err?.message);
      }
    } finally {
      inFlightRef.current = false;
    }
  }, [user]);

  useEffect(() => {
    if (!user) return undefined;

    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        tryRefresh('visibility');
      }
    };
    const onFocus = () => tryRefresh('focus');
    const onOnline = () => tryRefresh('online');

    document.addEventListener('visibilitychange', onVisibilityChange);
    window.addEventListener('focus', onFocus);
    window.addEventListener('online', onOnline);

    const heartbeat = setInterval(() => tryRefresh('heartbeat'), HEARTBEAT_MS);

    return () => {
      document.removeEventListener('visibilitychange', onVisibilityChange);
      window.removeEventListener('focus', onFocus);
      window.removeEventListener('online', onOnline);
      clearInterval(heartbeat);
    };
  }, [user, tryRefresh]);
};

export default useSessionKeepAlive;
