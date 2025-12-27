import React from 'react';
import { Link } from 'react-router-dom';
import '../styles/sidebar.css';
import logo from "../../assets/images/logos/logo.png"; // Importa la imagen


const Sidebar = () => {
  return (
    <div className="sidebar-wrapper">
  <div className="sidebar">
    <nav className="sidebar">
      <div className="logo">
      <img src={logo} alt="Logo" className="sidebar-logo" />
      </div>
      <ul>
        <li>
          <Link to="/">Inicio</Link> {/* Ruta principal */}
        </li>
        <li>
          <Link to="/pacientes">Pacientes</Link> {/* Debe coincidir con la ruta en App.jsx */}
        </li>
        <li>
          <Link to="/caja">Caja</Link>
        </li>
        <li>
          <Link to="/consultas">Consultas</Link>
        </li>
        <li>
          <Link to="/estadisticas">Estadísticas</Link>
        </li>
        <li>
          <Link to="/configuracion">Configuración</Link>
        </li>
      </ul>
    </nav>
    </div>
    </div>
  );
};

export default Sidebar;

