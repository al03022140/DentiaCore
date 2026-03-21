import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { message } from 'antd';
import './styles/patient-list.css';
import userNot from '../../assets/images/avatars/UserNot.png';

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

const PatientList = () => {
  const [patients, setPatients] = useState([]);
  const [loading, setLoading] = useState(true);
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
        setLoading(true);
        const response = await getAllPatients();
        const patientsArray = response?.patients ?? response ?? [];
        setPatients(Array.isArray(patientsArray) ? patientsArray : []);
      } catch (error) {
        console.error("Error al obtener pacientes:", error);
        message.error(`Error al cargar pacientes: ${error.message || 'Error desconocido'}`);
        setPatients([]);
      } finally {
        setLoading(false);
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
          <p className="no-patients-msg">Cargando pacientes...</p>
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
          <button className="add-patient-button" onClick={() => navigate('/add-patient')}>
            <img src={addPatientIcon} alt="Agregar Paciente" />
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
