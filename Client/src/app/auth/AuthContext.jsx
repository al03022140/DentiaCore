import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import API, { triggerTokenRefresh } from '../../shared/services/axios-instance';
import { clearAccessToken, getAccessToken, setAccessToken } from '../../shared/services/auth-token';
import { clearAllDrafts } from '../../shared/hooks/useDraftPersistence';

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
