import React from 'react';
import { useAuth } from '../../app/auth/AuthContext';
import logo from "../../assets/images/logos/logo.png";
import '../styles/header.css';

const Header = () => {
  const { logout, user } = useAuth();

  const handleLogout = async () => {
    await logout();
    // Redirigir a la pantalla de login
    window.location.href = '/login';
  };

  return (
    <div className="header">
      <h1>Buenos días, {user?.nombre || 'Dr. Jefferson'}</h1>
      <div className="header-actions">
        <button className="logout-button" onClick={handleLogout} title="Cerrar sesión">Cerrar sesión</button>
      </div>
    </div>
  );
};

export default Header;

