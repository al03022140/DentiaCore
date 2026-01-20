import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import API from '../../shared/services/axios-instance';
import { clearAccessToken, getAccessToken, setAccessToken } from '../../shared/services/auth-token';

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
      const token = getAccessToken();
      if (token) {
        await refreshProfile();
      }
      setIsLoading(false);
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
