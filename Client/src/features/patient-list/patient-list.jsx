import React, { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom'; 
import './styles/patient-list.css';
import userNot from '../../assets/images/avatars/UserNot.png';

// Imágenes
import filtroIcon from '../../assets/images/icons/filtro.png'; 
import arrowIcon from '../../assets/images/icons/arrow.png';
import arrowLeft from '../../assets/images/icons/arrow-left.png';
import arrowRight from '../../assets/images/icons/arrow-right.png';
import plusIcon from '../../assets/images/icons/plus.png';

// Utilidades y API
import { formatName, removeAccents, formatDate, formatAge, formatAgeYearsOnly } from '../../shared/utils/formatters';
import { getAllPatients } from '../../shared/services/patient-service';

const PatientList = () => {
  const [patients, setPatients] = useState([]);
  const [currentPage, setCurrentPage] = useState(1);
  const patientsPerPage = 15;
  const navigate = useNavigate();

  // Estados para búsqueda y orden
  const [searchTerm, setSearchTerm] = useState('');
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const menuRef = useRef(null);
  const [sortType, setSortType] = useState(null);
  const [isAscending, setIsAscending] = useState(true);

  // Carga de pacientes
  useEffect(() => {
    const fetchPatients = async () => {
      try {
        const response = await getAllPatients();
        // Asegurar que siempre sea un array
        const patientsArray = Array.isArray(response) ? response : 
                            Array.isArray(response?.patients) ? response.patients : 
                            Array.isArray(response?.data) ? response.data : [];
        setPatients(patientsArray);
      } catch (error) {
        console.error("Error al obtener pacientes:", error);
        // Mostrar mensaje de error al usuario
        alert(`Error al cargar pacientes: ${error.message || 'Error desconocido'}`);
        // En caso de error, asegurar que el estado sea un array vacío
        setPatients([]);
      }
    };
    fetchPatients();
  }, []);

  // Cerrar menú al hacer clic fuera
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (menuRef.current && !menuRef.current.contains(event.target)) {
        setIsMenuOpen(false);
      }
    };

    if (isMenuOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [isMenuOpen]);

  // Manejador de búsqueda
  const handleSearchChange = (e) => {
    setSearchTerm(e.target.value);
    setCurrentPage(1);
  };

  // Usar la función removeAccents de utils/formatters.js
  const searchTermNormalized = removeAccents(searchTerm).toLowerCase().trim();

  // Asegurar que filteredPatients siempre sea un array
  const filteredPatients = Array.isArray(patients) ? patients.filter((patient) => {
    // Si no se ha ingresado término, se muestran todos
    if (!searchTermNormalized) return true;

    // Caso 1: Si el término empieza con "#", buscar en el paciente_id personalizado
    if (searchTermNormalized.startsWith('#')) {
      // Remover el símbolo '#' y espacios extra del término ingresado
      const searchDigits = searchTermNormalized.slice(1).trim();
      // Comparar agregando '#' al valor almacenado y eliminando espacios extra del mismo
      return patient.paciente_id && patient.paciente_id.trim().toLowerCase().includes(`#${searchDigits}`);
    }

    // Caso 2: Revisar si el _id de MongoDB (convertido a string) contiene el término
    if (patient._id && patient._id.toString().toLowerCase().includes(searchTermNormalized)) {
      return true;
    }

    // Caso 3: Si el término es numérico (solo dígitos), comparar con la edad
    if (/^\d+$/.test(searchTermNormalized)) {
      const searchNumber = parseInt(searchTermNormalized, 10);
      if (patient.edad === searchNumber) return true;
    }

    // Caso 4: Por defecto, buscar por nombre completo (sin acentos y en minúsculas)
    const nombreCompleto = removeAccents(
      `${patient.apellido_paterno || ''} ${patient.apellido_materno || ''} ${patient.primer_nombre || ''} ${patient.segundo_nombre || ''}`
    ).toLowerCase();

    return nombreCompleto.includes(searchTermNormalized);
  }) : [];

  // Ordenar pacientes
  const handleSortBy = (type) => {
    if (!patients.length) return;
    
    const sortedPatients = [...patients];
  
    const compareValues = (a, b, key, isDate = false) => {
      // Manejo seguro de valores nulos o indefinidos
      let valueA = a[key];
      let valueB = b[key];
      
      // Si ambos valores son nulos o indefinidos, se consideran iguales
      if (valueA == null && valueB == null) return 0;
      
      // Si solo uno es nulo o indefinido, se coloca al final en orden ascendente
      if (valueA == null) return isAscending ? 1 : -1;
      if (valueB == null) return isAscending ? -1 : 1;
      
      if (isDate) {
        // Manejo seguro de fechas inválidas
        const dateA = new Date(valueA);
        const dateB = new Date(valueB);
        
        // Verificar si las fechas son válidas
        const isValidDateA = !isNaN(dateA.getTime());
        const isValidDateB = !isNaN(dateB.getTime());
        
        // Si ambas fechas son inválidas, se consideran iguales
        if (!isValidDateA && !isValidDateB) return 0;
        
        // Si solo una fecha es inválida, se coloca al final
        if (!isValidDateA) return isAscending ? 1 : -1;
        if (!isValidDateB) return isAscending ? -1 : 1;
        
        return isAscending ? dateA.getTime() - dateB.getTime() : dateB.getTime() - dateA.getTime();
      } else if (typeof valueA === 'string' && typeof valueB === 'string') {
        return isAscending ? valueA.localeCompare(valueB) : valueB.localeCompare(valueA);
      }
  
      return isAscending ? valueA - valueB : valueB - valueA;
    };
  
    switch (type) {
      case 'apellido':
        sortedPatients.sort((a, b) => compareValues(a, b, 'apellido_paterno'));
        break;
      case 'edad':
        sortedPatients.sort((a, b) => compareValues(a, b, 'edad'));
        break;
      case 'ultimaVisita':
        sortedPatients.sort((a, b) => compareValues(a, b, 'ultimaVisita', true));
        break;
      case 'fechaCreacion': // Nueva opción: ordenar por fecha de creación
        sortedPatients.sort((a, b) => compareValues(a, b, 'fechaCreacion', true));
        break;
      default:
        return;
    }
  
    setPatients(sortedPatients);
    setSortType(type);
    setIsAscending(!isAscending);
  };

  // Calcular paginación
  const indexOfLastPatient = currentPage * patientsPerPage;
  const indexOfFirstPatient = indexOfLastPatient - patientsPerPage;
  const currentPatients = filteredPatients.slice(indexOfFirstPatient, indexOfLastPatient);
  const totalPages = Math.ceil(filteredPatients.length / patientsPerPage);

  // Manejo de paginación
  const handlePageChange = (pageNumber) => setCurrentPage(pageNumber);
  const handlePrevPage = () => currentPage > 1 && setCurrentPage(currentPage - 1);
  const handleNextPage = () => currentPage < totalPages && setCurrentPage(currentPage + 1);

  // Navegar a detalle del paciente
  const handlePatientClick = (patientId) => {
    navigate(`/patient/${patientId}`);
  };

  return (
    <div className="patient-list-wrapper">
      {/* BARRA DE BÚSQUEDA */}
      <div className="patient-list-container">
        <div className="search-container">
          <input 
            type="text"
            placeholder="Buscar paciente..."
            value={searchTerm}
            onChange={handleSearchChange}
            className="search-input"
          />
        </div>

        {/* ACCIONES (Agregar Paciente y Ordenar) */}
        <div className="actions-container">
          <button className="add-patient-button" onClick={() => navigate('/add-patient')}>
            <img src={plusIcon} alt="Agregar Paciente" />
          </button>

          <div className="filter-button-container">
            <button className="filter-button" onClick={() => setIsMenuOpen(!isMenuOpen)}>
              Ordenar <img src={filtroIcon} alt="filtro" className="filter-icon"/>
            </button>

            {isMenuOpen && (
              <div className="sort-menu" ref={menuRef}>
                <ul>
                  <li onClick={() => handleSortBy('apellido')}>
                    Apellido (A-Z)
                    {sortType === 'apellido' && (
                      <img
                        src={arrowIcon}
                        alt="orden"
                        className={`arrow-icon ${isAscending ? 'asc' : 'desc'}`}
                      />
                    )}
                  </li>
                  <li onClick={() => handleSortBy('edad')}>
                    Edad
                    {sortType === 'edad' && (
                      <img
                        src={arrowIcon}
                        alt="orden"
                        className={`arrow-icon ${isAscending ? 'asc' : 'desc'}`}
                      />
                    )}
                  </li>
                  <li onClick={() => handleSortBy('ultimaVisita')}>
                    Última Visita
                    {sortType === 'ultimaVisita' && (
                      <img
                        src={arrowIcon}
                        alt="orden"
                        className={`arrow-icon ${isAscending ? 'asc' : 'desc'}`}
                      />
                    )}
                  </li>
                </ul>
              </div>
            )}
          </div>
        </div>

        {/* LISTA DE PACIENTES */}
        <div className="patient-list">
          {currentPatients.map((patient) => {
            if (!patient) return null;

            const formattedName = formatName(
              patient.apellido_paterno,
              patient.apellido_materno,
              patient.primer_nombre,
              patient.segundo_nombre
            );

            const fullName = `${patient.apellido_paterno || ''} ${patient.apellido_materno || ''} ${patient.primer_nombre || ''} ${patient.segundo_nombre || ''}`.trim();

            const patientId = patient.paciente_id ? patient.paciente_id : patient._id;
            const lastVisit = patient.ultimaVisita || "No hay datos";
            const age = formatAgeYearsOnly(patient.fecha_nacimiento) || "No hay datos";
            const photoURL = patient.photoURL || userNot;

            return (
              <div
                key={patient._id}
                className="patient-card"
                onClick={() => handlePatientClick(patient._id)}
              >
                <div className="patient-photo">
                  <img src={photoURL} alt="Foto del paciente" />
                </div>
                <div className="patient-info">
                  <div className="patient-top">
                    <span className="patient-id">{patientId}</span>
                    
                    {/* Nombre con Tooltip */}
                    <span className="patient-name-container">
                      {formattedName}
                      <span className="tooltip">{fullName}</span>
                    </span>
                  </div>
                  <div className="patient-bottom">
                    <span className="patient-age">Edad: {age}</span>
                    <span className="patient-visit">Últ. Visita: {lastVisit}</span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Paginación */}
        {totalPages > 0 && (
          <div className="pagination">
            {currentPage > 1 && (
              <img
                src={arrowLeft}
                alt="Anterior"
                className="pagination-arrow left"
                onClick={handlePrevPage}
              />
            )}
            {Array.from({ length: totalPages }, (_, i) => (
              <span
                key={i}
                onClick={() => handlePageChange(i + 1)}
                className={`page-number ${currentPage === i + 1 ? 'active' : ''}`}
              >
                {i + 1}
              </span>
            ))}
            {currentPage < totalPages && (
              <img
                src={arrowRight}
                alt="Siguiente"
                className="pagination-arrow right"
                onClick={handleNextPage}
              />
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default PatientList;
