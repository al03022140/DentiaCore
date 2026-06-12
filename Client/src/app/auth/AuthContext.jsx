import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import API, { triggerTokenRefresh } from '../../shared/services/axios-instance';
import { clearAccessToken, getAccessToken, setAccessToken } from '../../shared/services/auth-token';
import { clearAllDrafts } from '../../shared/hooks/useDraftPersistence';
import { invalidateSettingsCache } from '../../shared/services/settingsService';

// Claves de localStorage con PHI o credenciales de terceros que NO deben
// sobrevivir al cierre de sesión en una estación compartida (M-14 extendido):
//  - accessToken: access token de Google (calendario+email del profesional)
//  - calendarEvents: caché de eventos con nombres de paciente y motivo (1 mes)
//  - google_connected_email / google_selected_calendar: identidad de Google
const SHARED_STATION_KEYS = [
  'accessToken',
  'calendarEvents',
  'google_connected_email',
  'google_selected_calendar',
];

const clearSharedStationStorage = () => {
  try {
    SHARED_STATION_KEYS.forEach((key) => localStorage.removeItem(key));
    // Persistencia paralela del periodontograma (periodontogram_state_<id>):
    // hoy sin uso activo, pero si existe contiene mediciones clínicas.
    Object.keys(localStorage)
      .filter((key) => key.startsWith('periodontogram_state_'))
      .forEach((key) => localStorage.removeItem(key));
  } catch { /* storage no disponible: nada que limpiar */ }
};

const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [isLoading, setIsLoading] = useState(true);

  const applyAuthData = useCallback((data) => {
    if (data?.accessToken) {
      setAccessToken(data.accessToken);
    }
    if (data?.user) {
      setUser(data.user);
    }
  }, []);

  const login = useCallback(async ({ email, contraseña }) => {
    const response = await API.post('/auth/login', { email, contraseña });
    applyAuthData(response.data);
    return response.data;
  }, [applyAuthData]);

  const logout = useCallback(async () => {
    try {
      await API.post('/auth/logout');
    } catch (error) {
      // Ignorar errores de logout
    } finally {
      clearAccessToken();
      // M-14: limpiar drafts con PHI de localStorage al cerrar sesión.
      clearAllDrafts();
      // El siguiente usuario de la estación no debe heredar el calendario de
      // Google ni la caché de eventos (PHI) del usuario anterior.
      clearSharedStationStorage();
      // La caché de settings (3 min) no debe cruzar sesiones de usuario.
      invalidateSettingsCache();
      setUser(null);
    }
  }, []);

  const refreshProfile = useCallback(async () => {
    try {
      const response = await API.get('/auth/me');
      setUser(response.data);
    } catch (error) {
      clearAccessToken();
      setUser(null);
    }
  }, []);

  useEffect(() => {
    const bootstrap = async () => {
      // A-2: el access token ya no se persiste en localStorage, así que al
      // cargar la app siempre está vacío en memoria. Intentamos rehidratarlo
      // vía /auth/refresh usando la cookie httpOnly de refresh. Si hay sesión
      // válida, obtenemos un nuevo access token y cargamos el perfil; si no,
      // quedamos como no autenticados (el usuario verá /login).
      try {
        let token = getAccessToken();
        if (!token) {
          token = await triggerTokenRefresh();
        }
        if (token) {
          await refreshProfile();
        }
      } catch (_e) {
        // Sin sesión válida: nada que hacer, seguimos como invitado.
      } finally {
        setIsLoading(false);
      }
    };

    bootstrap();
  }, [refreshProfile]);

  const value = useMemo(() => ({
    user,
    isAuthenticated: Boolean(user),
    isLoading,
    login,
    logout,
    refreshProfile
  }), [user, isLoading, login, logout, refreshProfile]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth debe usarse dentro de AuthProvider');
  }
  return context;
};
