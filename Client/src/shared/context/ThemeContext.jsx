import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import API from '../services/axios-instance';

const ThemeContext = createContext(null);

const THEME_KEY = 'dentia-theme';

export const ThemeProvider = ({ children }) => {
  const [theme, setThemeState] = useState(() => {
    try { return localStorage.getItem(THEME_KEY) || 'system'; } catch { return 'system'; }
  });

  const applyTheme = useCallback((t) => {
    const root = document.documentElement;
    if (t === 'system') {
      const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
      root.setAttribute('data-theme', prefersDark ? 'dark' : 'light');
    } else {
      root.setAttribute('data-theme', t);
    }
    /* Mismo tick que setAttribute: el motor del odontograma repinta sin depender del orden del MutationObserver */
    window.dispatchEvent(new CustomEvent('dentia-theme-change'));
  }, []);

  const setTheme = useCallback(async (newTheme) => {
    setThemeState(newTheme);
    try { localStorage.setItem(THEME_KEY, newTheme); } catch { /* ignore */ }
    applyTheme(newTheme);
    try {
      await API.patch('/settings/me/preferences', { theme: newTheme });
    } catch { /* sync silently */ }
  }, [applyTheme]);

  useEffect(() => {
    applyTheme(theme);
    const mql = window.matchMedia('(prefers-color-scheme: dark)');
    const handler = () => { if (theme === 'system') applyTheme('system'); };
    mql.addEventListener('change', handler);
    return () => mql.removeEventListener('change', handler);
  }, [theme, applyTheme]);

  /* Vista previa e impresión: fondo claro y texto oscuro aunque la UI esté en modo oscuro */
  useEffect(() => {
    const beforePrint = () => {
      document.documentElement.setAttribute('data-theme', 'light');
      window.dispatchEvent(new CustomEvent('dentia-theme-change'));
    };
    const afterPrint = () => {
      applyTheme(theme);
    };
    window.addEventListener('beforeprint', beforePrint);
    window.addEventListener('afterprint', afterPrint);
    return () => {
      window.removeEventListener('beforeprint', beforePrint);
      window.removeEventListener('afterprint', afterPrint);
    };
  }, [theme, applyTheme]);

  const value = useMemo(() => ({ theme, setTheme }), [theme, setTheme]);

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
};

export const useTheme = () => {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme debe usarse dentro de ThemeProvider');
  return ctx;
};
