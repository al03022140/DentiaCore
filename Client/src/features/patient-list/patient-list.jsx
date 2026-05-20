import { memo, useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { message, Skeleton } from 'antd';
import './styles/patient-list.css';
import userNot from '../../assets/images/icons/Profile Default.svg';

// Imágenes
import filtroIcon from '../../assets/images/icons/filter.svg';
import arrowIcon from '../../assets/images/icons/arrow.png';
import arrowLeft from '../../assets/images/icons/arrow-left.png';
import arrowRight from '../../assets/images/icons/arrow-right.png';
import addPatientIcon from '../../assets/images/icons/add_patient.svg';

// Utilidades y API
import { formatName, removeAccents, formatAgeYearsOnly } from '../../shared/utils/formatters';
import { getAllPatients } from '../../shared/services/api';

// Formato compacto DD/MM/YY para que la fecha quepa en el chip de
// "última visita" sin desbordar la card (el row tiene overflow:hidden y
// flex-wrap:nowrap; el año a 4 dígitos cortaba el texto).
const formatVisitDate = (date) => {
  if (!date) return null;
  const d = new Date(date);
  if (Number.isNaN(d.getTime())) return null;
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const yy = String(d.getFullYear()).slice(-2);
  return `${dd}/${mm}/${yy}`;
};

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

/**
 * Card individual del paciente, memoizada. Vive fuera del padre para que
 * React.memo pueda evitar re-renders cuando el usuario cambia búsqueda,
 * orden o página y solo unas pocas cards realmente cambian.
 */
const PatientCard = memo(function PatientCard({ patient, onClick }) {
  const formattedName = formatName(
    patient.apellido_paterno,
    patient.apellido_materno,
    patient.primer_nombre,
    patient.segundo_nombre
  );

  const fullName = [
    patient.apellido_paterno,
    patient.apellido_materno,
    patient.primer_nombre,
    patient.segundo_nombre
  ].filter(Boolean).join(' ');

  const patientId = patient.paciente_id || patient._id;
  // ultimaVisita viene del backend como ISO (o null). Mostramos DD/MM/YY
  // para no desbordar el chip; el tooltip lleva el detalle completo.
  const lastVisit = formatVisitDate(patient.ultimaVisita) || 'Sin dato';
  const lastVisitTooltip = patient.ultimaVisita
    ? new Date(patient.ultimaVisita).toLocaleDateString('es-MX', { day: '2-digit', month: 'long', year: 'numeric' })
    : 'Sin visitas registradas';
  const age = formatAgeYearsOnly(patient.fecha_nacimiento) || '—';
  const photoURL = patient.photoURL || userNot;
  const isDefaultPhoto = !patient.photoURL;

  const handleClick = useCallback(() => {
    onClick(patient._id);
  }, [onClick, patient._id]);

  const handleImgError = useCallback((e) => {
    e.target.onerror = null;
    e.target.src = userNot;
    e.target.classList.add('profile-default-avatar');
  }, []);

  return (
    <div
      className="patient-card"
      onClick={handleClick}
      title={fullName}
    >
      <div className="patient-photo">
        <img
          src={photoURL}
          alt="Foto del paciente"
          loading="lazy"
          decoding="async"
          className={isDefaultPhoto ? 'profile-default-avatar' : undefined}
          onError={handleImgError}
        />
      </div>
      <div className="patient-info">
        <div className="patient-top">
          <span className="patient-id">{patientId}</span>
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
          <span className="patient-visit" title={`Última visita: ${lastVisitTooltip}`}>
            <VisitIcon />
            {lastVisit}
          </span>
        </div>
      </div>
    </div>
  );
});

/**
 * Construye la ventana de páginas a mostrar (máx 7 botones + elipsis).
 * Ejemplos:
 *   total=5,  current=3 -> [1,2,3,4,5]
 *   total=20, current=1 -> [1,2,3,4,5,'…',20]
 *   total=20, current=10-> [1,'…',9,10,11,'…',20]
 *   total=20, current=20-> [1,'…',16,17,18,19,20]
 */
const buildPageWindow = (current, total) => {
  if (total <= 7) {
    return Array.from({ length: total }, (_, i) => i + 1);
  }
  if (current <= 4) {
    return [1, 2, 3, 4, 5, '…', total];
  }
  if (current >= total - 3) {
    return [1, '…', total - 4, total - 3, total - 2, total - 1, total];
  }
  return [1, '…', current - 1, current, current + 1, '…', total];
};

/**
 * Paginación memoizada. Si hay miles de pacientes, esto evita renderizar
 * cientos de spans (uno por página) y los re-renders correspondientes.
 */
const Pagination = memo(function Pagination({ currentPage, totalPages, onPageChange, onPrev, onNext }) {
  const pages = useMemo(() => buildPageWindow(currentPage, totalPages), [currentPage, totalPages]);

  if (totalPages <= 0) return null;

  return (
    <div className="pagination">
      {currentPage > 1 && (
        <img
          src={arrowLeft}
          alt="Anterior"
          className="pagination-arrow left"
          onClick={onPrev}
        />
      )}
      {pages.map((page, i) =>
        page === '…' ? (
          <span key={`ellipsis-${i}`} className="page-number page-number--ellipsis">…</span>
        ) : (
          <span
            key={page}
            onClick={() => onPageChange(page)}
            className={`page-number ${currentPage === page ? 'active' : ''}`}
          >
            {page}
          </span>
        )
      )}
      {currentPage < totalPages && (
        <img
          src={arrowRight}
          alt="Siguiente"
          className="pagination-arrow right"
          onClick={onNext}
        />
      )}
    </div>
  );
});

const SORT_KEYS = {
  apellido: 'apellido_paterno',
  edad: 'edad',
  ultimaVisita: 'ultimaVisita'
};
const PATIENTS_PER_PAGE = 16;

const PatientList = () => {
  const [patients, setPatients] = useState([]);
  const [loading, setLoading] = useState(true);
  const [currentPage, setCurrentPage] = useState(1);
  const navigate = useNavigate();

  // Estados para búsqueda y orden
  const [searchTerm, setSearchTerm] = useState('');
  // useDeferredValue mantiene el input responsive: el campo se actualiza
  // inmediatamente, pero el filtrado pesado de la lista se hace con un
  // valor diferido. Reemplaza un debounce manual sin perder reactividad.
  const deferredSearchTerm = useDeferredValue(searchTerm);
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

  const handleSearchChange = useCallback((e) => {
    setSearchTerm(e.target.value);
    setCurrentPage(1);
  }, []);

  // Filtrado memoizado sobre el término diferido para no bloquear el input
  const filteredPatients = useMemo(() => {
    const normalized = removeAccents(deferredSearchTerm).toLowerCase().trim();
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
  }, [patients, deferredSearchTerm]);

  // Ordenar pacientes: actualiza solo la config; el sort real se aplica
  // sobre el resultado del filtro en un useMemo derivado para no mutar
  // `patients` (lo cual antes hacía que limpiar el filtro mostrara un
  // orden distinto al original cargado).
  const handleSortBy = useCallback((type) => {
    if (!SORT_KEYS[type]) return;
    setSortType((prev) => {
      const nextAscending = type === prev ? !isAscending : true;
      setIsAscending(nextAscending);
      return type;
    });
  }, [isAscending]);

  // Sort derivado sobre los pacientes filtrados (no muta `patients`).
  const sortedFilteredPatients = useMemo(() => {
    if (!sortType) return filteredPatients;
    const key = SORT_KEYS[sortType];
    if (!key) return filteredPatients;
    const isDate = sortType === 'ultimaVisita';

    const compareValues = (a, b) => {
      const valueA = a[key];
      const valueB = b[key];

      if (valueA == null && valueB == null) return 0;
      if (valueA == null) return isAscending ? 1 : -1;
      if (valueB == null) return isAscending ? -1 : 1;

      if (isDate) {
        const dateA = new Date(valueA);
        const dateB = new Date(valueB);
        const isValidA = !isNaN(dateA.getTime());
        const isValidB = !isNaN(dateB.getTime());

        if (!isValidA && !isValidB) return 0;
        if (!isValidA) return isAscending ? 1 : -1;
        if (!isValidB) return isAscending ? -1 : 1;

        return isAscending ? dateA - dateB : dateB - dateA;
      }

      if (typeof valueA === 'string' && typeof valueB === 'string') {
        return isAscending ? valueA.localeCompare(valueB) : valueB.localeCompare(valueA);
      }

      return isAscending ? valueA - valueB : valueB - valueA;
    };

    return [...filteredPatients].sort(compareValues);
  }, [filteredPatients, sortType, isAscending]);

  // Calcular paginación
  const totalPages = Math.ceil(sortedFilteredPatients.length / PATIENTS_PER_PAGE);
  const currentPatients = useMemo(() => {
    const indexOfLastPatient = currentPage * PATIENTS_PER_PAGE;
    const indexOfFirstPatient = indexOfLastPatient - PATIENTS_PER_PAGE;
    return sortedFilteredPatients.slice(indexOfFirstPatient, indexOfLastPatient);
  }, [sortedFilteredPatients, currentPage]);

  // Manejo de paginación (estables para la Pagination memoizada)
  const handlePageChange = useCallback((pageNumber) => setCurrentPage(pageNumber), []);
  const handlePrevPage = useCallback(() => setCurrentPage((p) => Math.max(1, p - 1)), []);
  const handleNextPage = useCallback(() => {
    setCurrentPage((p) => Math.min(totalPages || 1, p + 1));
  }, [totalPages]);

  // Navegar a detalle del paciente (estable para PatientCard memoizada)
  const handlePatientClick = useCallback((patientId) => {
    navigate(`/patient/${patientId}`);
  }, [navigate]);

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
          {currentPatients.map((patient) => (
            patient ? (
              <PatientCard
                key={patient._id}
                patient={patient}
                onClick={handlePatientClick}
              />
            ) : null
          ))}
        </div>

        <Pagination
          currentPage={currentPage}
          totalPages={totalPages}
          onPageChange={handlePageChange}
          onPrev={handlePrevPage}
          onNext={handleNextPage}
        />
      </div>
    </div>
  );
};

export default memo(PatientList);
