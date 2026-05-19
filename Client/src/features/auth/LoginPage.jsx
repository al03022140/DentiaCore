import React, { useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../../app/auth/AuthContext';
import logoDentiaCore from '../../assets/images/logos/DentiaCore.svg';
import './login.css';

const LoginPage = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { login } = useAuth();
  const [email, setEmail] = useState('');
  const [contraseña, setContraseña] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError(null);
    setIsSubmitting(true);

    try {
      // Trim del email para que "  user@x.com" no rebote en el validator
      // del backend (que normaliza con toLowerCase().trim() antes de buscar).
      await login({ email: email.trim(), contraseña });
      // `from` puede venir como state de React Router (cuando ProtectedRoute
      // redirige) o como query param `?from=...` (cuando el interceptor de
      // axios hizo una redirección dura tras refresh fallido).
      const queryFrom = new URLSearchParams(location.search).get('from');
      const target = location.state?.from?.pathname || queryFrom || '/';
      navigate(target, { replace: true });
    } catch (err) {
      setError(err?.response?.data?.message || 'No se pudo iniciar sesión');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="login-page">
      <div className="login-page__inner">
        <div className="login-page__brand">
          <img src={logoDentiaCore} alt="DentiaCore" className="login-page__logo" />
        </div>
        <div className="login-card">
          <h1>Inicio de sesión</h1>
          <p className="login-card__subtitle">Accede con tu correo y contraseña.</p>

          <form onSubmit={handleSubmit} className="login-form" autoComplete="on">
            <label htmlFor="email">Correo</label>
            <div className="login-input-shell">
              <input
                id="email"
                name="email"
                type="email"
                autoComplete="username"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="correo@clinica.com"
                className="login-input-shell__input"
                required
              />
            </div>

            <label htmlFor="password">Contraseña</label>
            <div className="login-input-shell login-input-shell--password">
              <input
                id="password"
                name="password"
                type={showPassword ? 'text' : 'password'}
                autoComplete="current-password"
                value={contraseña}
                onChange={(event) => setContraseña(event.target.value)}
                placeholder="Contraseña"
                className="login-input-shell__input"
                required
              />
              <button
                type="button"
                className="login-input-shell__suffix"
                onClick={() => setShowPassword(s => !s)}
                aria-label={showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
              >
                {showPassword ? (
                  <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M17.94 17.94A10.94 10.94 0 0 1 12 20c-5 0-9.27-3-11-8 1.11-2.99 2.99-5.39 5.28-6.84" />
                    <path d="M1 1l22 22" />
                    <path d="M9.53 9.53A3.5 3.5 0 0 0 14.47 14.47" />
                  </svg>
                ) : (
                  <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7S1 12 1 12z" />
                    <circle cx="12" cy="12" r="3" />
                  </svg>
                )}
              </button>
            </div>

            {error && <div className="login-error">{error}</div>}

            <button type="submit" className="login-submit" disabled={isSubmitting}>
              {isSubmitting ? 'Ingresando...' : 'Entrar'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
};

export default LoginPage;
