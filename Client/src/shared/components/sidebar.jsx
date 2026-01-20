import React from 'react';
import { Link } from 'react-router-dom';
import '../styles/sidebar.css';
import logo from "../../assets/images/logos/logo.png"; // Importa la imagen
import { useAuth } from '../../app/auth/AuthContext';
import { hasPermission } from '../../app/auth/permissions';


const Sidebar = () => {
  const { user } = useAuth();
  const permissions = user?.permissions || [];

  const canViewPatients = hasPermission(permissions, ['patients.read', 'patients.create', 'patients.update']);
  const canViewCash = hasPermission(permissions, ['cash.read', 'cash.manage', 'cash.open', 'cash.close']);
  const canViewConsultas = hasPermission(permissions, ['consultas.read', 'consultas.create', 'consultas.update']);
  const canViewStats = hasPermission(permissions, ['stats.read']);
  const canViewUsers = hasPermission(permissions, ['users.read', 'users.create', 'users.update', 'users.disable']);

  return (
    <div className="sidebar-wrapper">
      <div className="sidebar">
        <nav className="sidebar">
          <div className="logo">
            <img src={logo} alt="Logo" className="sidebar-logo" />
          </div>
          <ul>
            <li>
              <Link to="/">Inicio</Link>
            </li>
            {canViewPatients && (
              <li>
                <Link to="/pacientes">Pacientes</Link>
              </li>
            )}
            {canViewCash && (
              <li>
                <Link to="/caja">Caja</Link>
              </li>
            )}
            {canViewConsultas && (
              <li>
                <Link to="/consultas">Consultas</Link>
              </li>
            )}
            {canViewStats && (
              <li>
                <Link to="/estadisticas">Estadísticas</Link>
              </li>
            )}
            {canViewUsers && (
              <li>
                <Link to="/usuarios">Usuarios</Link>
              </li>
            )}
          </ul>
        </nav>
      </div>
    </div>
  );
};

export default Sidebar;

