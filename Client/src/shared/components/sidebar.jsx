import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import '../styles/sidebar.css';
import logo from "../../assets/images/logos/DentiaCore.svg";
import { useAuth } from '../../app/auth/AuthContext';
import { hasPermission } from '../../app/auth/permissions';
import { useSidebar } from '../context/SidebarContext';


const Sidebar = () => {
  const { user } = useAuth();
  const { isOpen, isMobile, close } = useSidebar();
  const location = useLocation();
  const permissions = user?.permissions || [];

  const canViewPatients = hasPermission(permissions, ['patients.read', 'patients.create', 'patients.update']);
  const canViewCash = hasPermission(permissions, ['cash.read', 'cash.manage', 'cash.open', 'cash.close']);
  const canViewConsultas = hasPermission(permissions, ['consultas.read', 'consultas.create', 'consultas.update']);
  const canViewStats = hasPermission(permissions, ['stats.read']);

  const handleNavClick = () => {
    close();
  };

  return (
    <>
      {isMobile && isOpen && (
        <div className="sidebar-overlay" onClick={close} />
      )}
      <div className={`sidebar-wrapper ${isOpen ? 'sidebar--open' : 'sidebar--closed'} ${isMobile ? 'sidebar--mobile' : ''}`}>
        <div className="sidebar">
          <nav className="sidebar">
            <div className="logo">
              <img src={logo} alt="DentiaCore" className="sidebar-logo sidebar-logo--white" />
            </div>
            <ul>
              <li>
                <Link to="/" onClick={handleNavClick} className={location.pathname === '/' ? 'active' : ''}>Inicio</Link>
              </li>
              {canViewPatients && (
                <li>
                  <Link to="/pacientes" onClick={handleNavClick} className={location.pathname.startsWith('/pacientes') || location.pathname.startsWith('/patient') ? 'active' : ''}>Pacientes</Link>
                </li>
              )}
              {canViewCash && (
                <li>
                  <Link to="/caja" onClick={handleNavClick} className={location.pathname === '/caja' ? 'active' : ''}>Caja</Link>
                </li>
              )}
              {canViewConsultas && (
                <li>
                  <Link to="/consultas" onClick={handleNavClick} className={location.pathname === '/consultas' ? 'active' : ''}>Consultas</Link>
                </li>
              )}
              {canViewStats && (
                <li>
                  <Link to="/estadisticas" onClick={handleNavClick} className={location.pathname === '/estadisticas' ? 'active' : ''}>Estadísticas</Link>
                </li>
              )}
              <li>
                <Link to="/configuracion" onClick={handleNavClick} className={location.pathname.startsWith('/configuracion') ? 'active' : ''}>Configuración</Link>
              </li>
            </ul>
          </nav>
        </div>
      </div>
    </>
  );
};

export default Sidebar;
