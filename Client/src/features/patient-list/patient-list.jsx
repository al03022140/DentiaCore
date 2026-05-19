import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { message, Skeleton } from 'antd';
import './styles/patient-list.css';
import userNot from '../../assets/images/icons/Profile Default.svg';

// Imágenes
import filtroIcon from '../../assets/images/icons/filter.svg';
import arrowIcon from '../../assets/images/icons/arrow.png';
import arrowLeft from '../../assets/images/icons/arrow-left.png';
import arrowRight from '../../assets/images/icons/arrow-right.png';
import plusIcon from '../../assets/images/icons/plus.svg';
import addPatientIcon from '../../assets/images/icons/add_patient.svg';

// Utilidades y API
import { formatName, removeAccents, formatAgeYearsOnly } from '../../shared/utils/formatters';
import { getAllPatients } from '../../shared/services/api';

/* Icono de edad (silueta de persona) – usa currentColor */
const AgeIcon = () => (
  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <circle cx="12" cy="8" r="4" />
    <path d="M4 20c0-4 3.6-7 8-7s8 3 8 7" />
  </svg>
);

/* Icono de última visita (calendario) – usa currentColor */
const VisitIcon = () => (
  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <rect x="3" y="4" width="18" height="18" rx="2" />
    <path d="M3 10h18M8 2v4M16 2v4" />
  </svg>
);

const PatientList = () => {
  const [patients, setPatients] = useState([]);
  const [loading, setLoading] = useState(true);
  const [currentPage, setCurrentPage] = useState(1);
  const patientsPerPage = 16;
  const navigate = useNavigate();

  // Estados para búsqueda y orden
  const [searchTerm, setSearchTerm] = useState('');
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const menuRef = useRef(null);
  const [sortType, setSortType] = useState(null);
  const [isAscending, setIsAscending] = useState(true);

  // Carga de pacientes (guard cancelled para no hacer setState tras unmount
  // o en StrictMode al re-disparar el effect).
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setLoading(true);
        const response = await getAllPatients();
        if (cancelled) return;
        const patientsArray = response?.patients ?? response ?? [];
        setPatients(Array.isArray(patientsArray) ? patientsArray : []);
      } catch (error) {
        if (cancelled) return;
        console.error("Error al obtener pacientes:", error);
        message.error(`Error al cargar pacientes: ${error.message || 'Error desconocido'}`);
        setPatients([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
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

  const handleSearchChange = (e) => {
    setSearchTerm(e.target.value);
    setCurrentPage(1);
  };

  // Filtrado memoizado para evitar recálculos innecesarios
  const filteredPatients = useMemo(() => {
    const normalized = removeAccents(searchTerm).toLowerCase().trim();
    if (!normalized) return patients;

    return patients.filter((patient) => {
      // Buscar por paciente_id (empieza con "#")
      if (normalized.startsWith('#')) {
        const searchDigits = normalized.slice(1).trim();
        return patient.paciente_id?.trim().toLowerCase().includes(`#${searchDigits}`);
      }

      // Buscar por _id de MongoDB
      if (patient._id?.toString().toLowerCase().includes(normalized)) return true;

      // Buscar por edad (solo dígitos)
      if (/^\d+$/.test(normalized) && patient.edad === parseInt(normalized, 10)) return true;

      // Buscar por nombre completo
      const nombreCompleto = removeAccents(
        `${patient.apellido_paterno || ''} ${patient.apellido_materno || ''} ${patient.primer_nombre || ''} ${patient.segundo_nombre || ''}`
      ).toLowerCase();

      return nombreCompleto.includes(normalized);
    });
  }, [patients, searchTerm]);

  // Ordenar pacientes
  const handleSortBy = (type) => {
    if (!patients.length) return;

    // Si cambia el tipo de orden, resetear a ascendente; si es el mismo, alternar
    const nextAscending = type === sortType ? !isAscending : true;

    const compareValues = (a, b, key, isDate = false) => {
      const valueA = a[key];
      const valueB = b[key];

      if (valueA == null && valueB == null) return 0;
      if (valueA == null) return nextAscending ? 1 : -1;
      if (valueB == null) return nextAscending ? -1 : 1;

      if (isDate) {
        const dateA = new Date(valueA);
        const dateB = new Date(valueB);
        const isValidA = !isNaN(dateA.getTime());
        const isValidB = !isNaN(dateB.getTime());

        if (!isValidA && !isValidB) return 0;
        if (!isValidA) return nextAscending ? 1 : -1;
        if (!isValidB) return nextAscending ? -1 : 1;

        return nextAscending ? dateA - dateB : dateB - dateA;
      }

      if (typeof valueA === 'string' && typeof valueB === 'string') {
        return nextAscending ? valueA.localeCompare(valueB) : valueB.localeCompare(valueA);
      }

      return nextAscending ? valueA - valueB : valueB - valueA;
    };

    const sortedPatients = [...patients];
    const sortKeys = { apellido: 'apellido_paterno', edad: 'edad', ultimaVisita: 'ultimaVisita' };
    const key = sortKeys[type];
    if (!key) return;

    const isDate = type === 'ultimaVisita';
    sortedPatients.sort((a, b) => compareValues(a, b, key, isDate));

    setPatients(sortedPatients);
    setSortType(type);
    setIsAscending(nextAscending);
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

  if (loading) {
    return (
      <div className="patient-list-wrapper">
        <div className="patient-list-container">
          <div className="patient-list skeleton-list">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="patient-card" style={{ pointerEvents: 'none' }}>
                <Skeleton avatar active paragraph={{ rows: 1 }} />
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="patient-list-wrapper">
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
          <button
            type="button"
            className="add-patient-button button-primary"
            onClick={() => navigate('/add-patient')}
            aria-label="Agregar paciente"
          >
            <img src={addPatientIcon} alt="" aria-hidden className="theme-icon" />
            <span className="add-patient-button__label">Agregar paciente</span>
          </button>

          <div className="filter-button-container">
            <button className="filter-button" onClick={() => setIsMenuOpen(!isMenuOpen)}>
              Ordenar <img src={filtroIcon} alt="filtro" className="filter-icon theme-icon" />
            </button>

            {isMenuOpen && (
              <div className="sort-menu" ref={menuRef}>
                <ul>
                  <li onClick={() => handleSortBy('apellido')}>
                    <span className="sort-menu__label">Apellido (A-Z)</span>
                    <img
                      src={arrowIcon}
                      alt=""
                      aria-hidden="true"
                      className={`arrow-icon sort-menu__arrow ${sortType === 'apellido' ? (isAscending ? 'asc' : 'desc') : 'sort-menu__arrow--placeholder'}`}
                    />
                  </li>
                  <li onClick={() => handleSortBy('edad')}>
                    <span className="sort-menu__label">Edad</span>
                    <img
                      src={arrowIcon}
                      alt=""
                      aria-hidden="true"
                      className={`arrow-icon sort-menu__arrow ${sortType === 'edad' ? (isAscending ? 'asc' : 'desc') : 'sort-menu__arrow--placeholder'}`}
                    />
                  </li>
                  <li onClick={() => handleSortBy('ultimaVisita')}>
                    <span className="sort-menu__label">Última Visita</span>
                    <img
                      src={arrowIcon}
                      alt=""
                      aria-hidden="true"
                      className={`arrow-icon sort-menu__arrow ${sortType === 'ultimaVisita' ? (isAscending ? 'asc' : 'desc') : 'sort-menu__arrow--placeholder'}`}
                    />
                  </li>
                </ul>
              </div>
            )}
          </div>
        </div>

        {/* LISTA DE PACIENTES */}
        <div className="patient-list">
          {currentPatients.length === 0 && (
            <p className="no-patients-msg">
              {searchTerm ? 'No se encontraron pacientes con ese criterio.' : 'No hay pacientes registrados.'}
            </p>
          )}
          {currentPatients.map((patient) => {
            if (!patient) return null;

            const formattedName = formatName(
              patient.apellido_paterno,
              patient.apellido_materno,
              patient.primer_nombre,
              patient.segundo_nombre
            );

            const fullName = [patient.apellido_paterno, patient.apellido_materno, patient.primer_nombre, patient.segundo_nombre]
              .filter(Boolean).join(' ');

            const patientId = patient.paciente_id || patient._id;
            const lastVisit = patient.ultimaVisita || "Sin dato";
            const age = formatAgeYearsOnly(patient.fecha_nacimiento) || "—";
            const photoURL = patient.photoURL || userNot;

            return (
              <div
                key={patient._id}
                className="patient-card"
                onClick={() => handlePatientClick(patient._id)}
                title={fullName}
              >
                <div className="patient-photo">
                  <img
                    src={photoURL}
                    alt="Foto del paciente"
                    className={photoURL === userNot ? 'profile-default-avatar' : undefined}
                    onError={(e) => {
                      e.target.onerror = null;
                      e.target.src = userNot;
                      e.target.classList.add('profile-default-avatar');
                    }}
                  />
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
                    <span className="patient-age" title="Edad">
                      <AgeIcon />
                      {age}
                    </span>
                    <span className="patient-visit" title="Última visita">
                      <VisitIcon />
                      {lastVisit}
                    </span>
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
