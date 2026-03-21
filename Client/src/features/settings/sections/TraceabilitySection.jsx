import React, { useCallback, useEffect, useRef, useState } from 'react';
import { getAuditLogs, getAuditUsers, searchAuditPatients } from '../../../shared/services/auditService';

// ── Helpers ──────────────────────────────────────────────────

/** Formatear fecha a DD/MM/YYYY */
function fmtDate(iso) {
  const d = new Date(iso);
  return d.toLocaleDateString('es-MX', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

/** Formatear hora a HH:MM AM/PM */
function fmtTime(iso) {
  const d = new Date(iso);
  return d.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit', hour12: true });
}

/** Agrupar logs por una key que devuelve [groupKey, sortableDate] */
function groupBy(logs, keyFn) {
  const map = new Map();
  for (const log of logs) {
    const key = keyFn(log);
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(log);
  }
  return map;
}

/** Rol legible */
const ROL_LABELS = {
  superadmin: 'Super Admin',
  administrador: 'Administrador',
  doctor: 'Doctor',
  recepcionista: 'Recepcionista',
  asistente: 'Asistente',
};

// ── Componente principal ─────────────────────────────────────

const TraceabilitySection = () => {
  const [tab, setTab] = useState('usuario'); // 'usuario' | 'fecha' | 'paciente'
  const [logs, setLogs] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // Filtros
  const [users, setUsers] = useState([]);
  const [selectedUserId, setSelectedUserId] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [singleDate, setSingleDate] = useState('');

  // Paciente
  const [patientQuery, setPatientQuery] = useState('');
  const [patientResults, setPatientResults] = useState([]);
  const [selectedPatient, setSelectedPatient] = useState(null);
  const [showPatientDropdown, setShowPatientDropdown] = useState(false);
  const patientSearchTimer = useRef(null);
  const dropdownRef = useRef(null);

  // Cargar usuarios al montar
  useEffect(() => {
    getAuditUsers()
      .then(setUsers)
      .catch(() => {});
  }, []);

  // Cerrar dropdown al click fuera
  useEffect(() => {
    const handler = (e) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setShowPatientDropdown(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  // ── Buscar logs ──
  const fetchLogs = useCallback(async (pageNum = 1) => {
    setLoading(true);
    setError(null);
    try {
      const filters = { page: pageNum, limit: 100 };

      if (tab === 'usuario') {
        if (!selectedUserId) { setLogs([]); setTotal(0); setLoading(false); return; }
        filters.userId = selectedUserId;
        if (dateFrom) filters.desde = dateFrom;
        if (dateTo) filters.hasta = dateTo;
      } else if (tab === 'fecha') {
        if (!singleDate) { setLogs([]); setTotal(0); setLoading(false); return; }
        filters.date = singleDate;
      } else if (tab === 'paciente') {
        if (!selectedPatient) { setLogs([]); setTotal(0); setLoading(false); return; }
        filters.patientId = selectedPatient._id;
      }

      const res = await getAuditLogs(filters);
      setLogs(res.logs || []);
      setTotal(res.total || 0);
      setPages(res.pages || 1);
      setPage(pageNum);
    } catch (err) {
      setError(err.response?.data?.message || 'Error al buscar registros');
      setLogs([]);
    } finally {
      setLoading(false);
    }
  }, [tab, selectedUserId, dateFrom, dateTo, singleDate, selectedPatient]);

  // Auto-buscar cuando cambia el filtro principal
  useEffect(() => {
    if (tab === 'usuario' && selectedUserId) fetchLogs(1);
    else if (tab === 'fecha' && singleDate) fetchLogs(1);
    else if (tab === 'paciente' && selectedPatient) fetchLogs(1);
    else { setLogs([]); setTotal(0); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedUserId, singleDate, selectedPatient, dateFrom, dateTo, tab]);

  // ── Buscar pacientes con debounce ──
  const handlePatientSearch = (value) => {
    setPatientQuery(value);
    setSelectedPatient(null);
    if (patientSearchTimer.current) clearTimeout(patientSearchTimer.current);
    if (value.trim().length < 2) {
      setPatientResults([]);
      setShowPatientDropdown(false);
      return;
    }
    patientSearchTimer.current = setTimeout(async () => {
      try {
        const results = await searchAuditPatients(value);
        setPatientResults(results);
        setShowPatientDropdown(true);
      } catch {
        setPatientResults([]);
      }
    }, 300);
  };

  const selectPatient = (p) => {
    setSelectedPatient(p);
    setPatientQuery(p.nombre);
    setShowPatientDropdown(false);
  };

  // ── Reset al cambiar de tab ──
  const changeTab = (t) => {
    setTab(t);
    setLogs([]);
    setTotal(0);
    setError(null);
    setPage(1);
  };

  // ── Exportar PDF (window.print) ──
  const handleExportPDF = () => {
    window.print();
  };

  // ── Renderizado de logs agrupados ──
  const renderLogs = () => {
    if (loading) return <p className="trace-loading">Cargando registros…</p>;
    if (error) return <p className="trace-error">{error}</p>;
    if (logs.length === 0) return <p className="trace-empty">No hay registros para los filtros seleccionados.</p>;

    if (tab === 'usuario') {
      // Agrupar por fecha
      const grouped = groupBy(logs, (l) => fmtDate(l.timestamp));
      return (
        <div className="trace-results">
          <div className="trace-user-header">
            <strong>{logs[0]?.userName || 'Usuario'}</strong>
            <span className="trace-role-badge">{ROL_LABELS[logs[0]?.userRole] || logs[0]?.userRole}</span>
          </div>
          {[...grouped.entries()].map(([dateStr, items]) => (
            <div key={dateStr} className="trace-date-group">
              <div className="trace-date-label">{dateStr}</div>
              <div className="trace-entries">
                {items.map((log) => (
                  <div key={log._id} className="trace-entry">
                    <span className="trace-time">{fmtTime(log.timestamp)}</span>
                    <span className="trace-desc">{log.descripcion}</span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      );
    }

    if (tab === 'fecha') {
      // Agrupar por usuario
      const grouped = groupBy(logs, (l) => l.userName || 'Sistema');
      return (
        <div className="trace-results">
          <div className="trace-date-header">
            {singleDate && fmtDate(singleDate + 'T00:00:00')}
          </div>
          {[...grouped.entries()].map(([userName, items]) => (
            <div key={userName} className="trace-user-group">
              <div className="trace-user-label">
                <strong>{userName}</strong>
                <span className="trace-role-badge">{ROL_LABELS[items[0]?.userRole] || items[0]?.userRole}</span>
              </div>
              <div className="trace-entries">
                {items.map((log) => (
                  <div key={log._id} className="trace-entry">
                    <span className="trace-time">{fmtTime(log.timestamp)}</span>
                    <span className="trace-desc">{log.descripcion}</span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      );
    }

    if (tab === 'paciente') {
      // Agrupar por usuario → fecha
      const grouped = groupBy(logs, (l) => l.userName || 'Sistema');
      return (
        <div className="trace-results">
          <div className="trace-patient-header">
            Paciente: <strong>{selectedPatient?.nombre}</strong>
            {selectedPatient?.paciente_id && <span className="trace-patient-id">({selectedPatient.paciente_id})</span>}
          </div>
          {[...grouped.entries()].map(([userName, userLogs]) => {
            const byDate = groupBy(userLogs, (l) => fmtDate(l.timestamp));
            return (
              <div key={userName} className="trace-user-group">
                <div className="trace-user-label">
                  <strong>{userName}</strong>
                  <span className="trace-role-badge">{ROL_LABELS[userLogs[0]?.userRole] || userLogs[0]?.userRole}</span>
                </div>
                {[...byDate.entries()].map(([dateStr, items]) => (
                  <div key={dateStr} className="trace-date-group">
                    <div className="trace-date-label">{dateStr}</div>
                    <div className="trace-entries">
                      {items.map((log) => (
                        <div key={log._id} className="trace-entry">
                          <span className="trace-time">{fmtTime(log.timestamp)}</span>
                          <span className="trace-desc">{log.descripcion}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            );
          })}
        </div>
      );
    }

    return null;
  };

  return (
    <div className="trace-section">
      <p style={{ marginBottom: '1rem', color: 'var(--color-text-muted)' }}>
        Consulta el registro completo de acciones realizadas en el sistema. Busca por usuario, fecha o paciente.
      </p>

      {/* ── Tabs ── */}
      <div className="trace-tabs">
        <button className={`trace-tab${tab === 'usuario' ? ' active' : ''}`} onClick={() => changeTab('usuario')}>
          Por Usuario
        </button>
        <button className={`trace-tab${tab === 'fecha' ? ' active' : ''}`} onClick={() => changeTab('fecha')}>
          Por Fecha
        </button>
        <button className={`trace-tab${tab === 'paciente' ? ' active' : ''}`} onClick={() => changeTab('paciente')}>
          Por Paciente
        </button>
      </div>

      {/* ── Filtros ── */}
      <div className="trace-filters">
        {tab === 'usuario' && (
          <>
            <div className="settings-form-group">
              <label>Usuario</label>
              <select value={selectedUserId} onChange={(e) => setSelectedUserId(e.target.value)}>
                <option value="">— Seleccionar usuario —</option>
                {users.map((u) => (
                  <option key={u._id} value={u._id}>
                    {u.nombre} ({ROL_LABELS[u.rol] || u.rol})
                  </option>
                ))}
              </select>
            </div>
            <div className="trace-date-range">
              <div className="settings-form-group">
                <label>Desde</label>
                <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
              </div>
              <div className="settings-form-group">
                <label>Hasta</label>
                <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
              </div>
            </div>
          </>
        )}

        {tab === 'fecha' && (
          <div className="settings-form-group">
            <label>Fecha</label>
            <input type="date" value={singleDate} onChange={(e) => setSingleDate(e.target.value)} />
          </div>
        )}

        {tab === 'paciente' && (
          <div className="settings-form-group" ref={dropdownRef} style={{ position: 'relative' }}>
            <label>Buscar paciente</label>
            <input
              type="text"
              value={patientQuery}
              onChange={(e) => handlePatientSearch(e.target.value)}
              placeholder="Escriba el nombre o ID del paciente…"
              autoComplete="off"
            />
            {showPatientDropdown && patientResults.length > 0 && (
              <div className="trace-patient-dropdown">
                {patientResults.map((p) => (
                  <button key={p._id} className="trace-patient-option" onClick={() => selectPatient(p)}>
                    {p.nombre} {p.paciente_id ? `(${p.paciente_id})` : ''}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── Resultados ── */}
      {renderLogs()}

      {/* ── Paginación ── */}
      {pages > 1 && logs.length > 0 && (
        <div className="trace-pagination">
          <button
            className="settings-btn-secondary"
            disabled={page <= 1}
            onClick={() => fetchLogs(page - 1)}
          >
            ← Anterior
          </button>
          <span className="trace-page-info">Página {page} de {pages} — {total} registros</span>
          <button
            className="settings-btn-secondary"
            disabled={page >= pages}
            onClick={() => fetchLogs(page + 1)}
          >
            Siguiente →
          </button>
        </div>
      )}

      {/* ── Total y export ── */}
      {logs.length > 0 && (
        <div className="trace-footer">
          <span className="trace-total">{total} registro{total !== 1 ? 's' : ''} encontrado{total !== 1 ? 's' : ''}</span>
          <button className="settings-btn-primary" onClick={handleExportPDF}>
            Exportar PDF
          </button>
        </div>
      )}
    </div>
  );
};

export default TraceabilitySection;
