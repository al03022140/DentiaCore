import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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

/** Agrupa logs en un Map<key, log[]> usando keyFn(log). */
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

// Tope de página del servidor (auditController clampa a 500): usarlo en el
// export minimiza requests al traer todas las páginas del filtro.
const EXPORT_LIMIT = 500;

// ── Componente principal ─────────────────────────────────────

const TraceabilitySection = () => {
  const [tab, setTab] = useState('usuario'); // 'usuario' | 'fecha' | 'paciente'
  const [logs, setLogs] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [exporting, setExporting] = useState(false);
  // Conjunto completo (todas las páginas) que se monta solo durante el export.
  const [exportLogs, setExportLogs] = useState(null);

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

  // Toggle para ocultar eventos de desbloqueo de pantalla (modo cortina).
  // Suelen ser muchos y poco relevantes para auditar acciones clínicas.
  const [hideUnlocks, setHideUnlocks] = useState(false);

  // Durante el export se monta el conjunto completo; el resto del tiempo es la
  // página actual. Render, header y footer derivan de aquí.
  const sourceLogs = exportLogs ?? logs;

  // Logs después de aplicar el filtro de desbloqueos.
  const filteredLogs = useMemo(
    () => (hideUnlocks ? sourceLogs.filter((l) => l.evento !== 'pantalla_desbloqueada') : sourceLogs),
    [sourceLogs, hideUnlocks]
  );
  const hiddenUnlocksCount = useMemo(
    () => sourceLogs.filter((l) => l.evento === 'pantalla_desbloqueada').length,
    [sourceLogs]
  );

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

  // Filtros del tab actual (sin page/limit), o null si faltan datos o el rango
  // es inválido. Rango invertido (Desde > Hasta) avisa explícitamente en vez de
  // fingir "no hay registros". Comparación lexicográfica válida con YYYY-MM-DD.
  const buildFilters = useCallback(() => {
    if (tab === 'usuario') {
      if (!selectedUserId) return null;
      if (dateFrom && dateTo && dateFrom > dateTo) {
        setError("El rango de fechas es inválido: 'Desde' es posterior a 'Hasta'.");
        return null;
      }
      const f = { userId: selectedUserId };
      if (dateFrom) f.desde = dateFrom;
      if (dateTo) f.hasta = dateTo;
      return f;
    }
    if (tab === 'fecha') return singleDate ? { date: singleDate } : null;
    if (tab === 'paciente') return selectedPatient ? { patientId: selectedPatient._id } : null;
    return null;
  }, [tab, selectedUserId, dateFrom, dateTo, singleDate, selectedPatient]);

  // ── Buscar logs (una página) ──
  const fetchLogs = useCallback(async (pageNum = 1) => {
    const base = buildFilters();
    if (!base) { setLogs([]); setTotal(0); return; }
    setLoading(true);
    setError(null);
    try {
      const res = await getAuditLogs({ ...base, page: pageNum, limit: 100 });
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
  }, [buildFilters]);

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

  // ── Exportar PDF: trae TODAS las páginas del filtro actual (no solo la
  // visible) y las imprime, para que el PDF sea el registro completo. ──
  const handleExportPDF = async () => {
    if (loading || exporting || total === 0) return;
    const base = buildFilters();
    if (!base) return;
    setExporting(true);
    setError(null);
    try {
      const all = [];
      let pageNum = 1;
      let totalPages = 1;
      do {
        const res = await getAuditLogs({ ...base, page: pageNum, limit: EXPORT_LIMIT });
        all.push(...(res.logs || []));
        totalPages = res.pages || 1;
        pageNum += 1;
      } while (pageNum <= totalPages);
      if (all.length === 0) {
        setError('No hay registros para exportar.');
        setExporting(false);
        return;
      }
      setExportLogs(all);
    } catch {
      setError('No se pudieron exportar todos los registros. Intenta de nuevo.');
      setExporting(false);
    }
  };

  // Cuando exportLogs ya está en el DOM, imprimir en el siguiente frame y luego
  // limpiar para volver a la vista paginada.
  useEffect(() => {
    if (!exportLogs) return undefined;
    const id = requestAnimationFrame(() => {
      window.print();
      setExportLogs(null);
      setExporting(false);
    });
    return () => cancelAnimationFrame(id);
  }, [exportLogs]);

  // ── Renderizado de logs agrupados ──
  const renderLogs = () => {
    if (loading) return <p className="trace-loading">Cargando registros…</p>;
    if (error) return <p className="trace-error">{error}</p>;
    if (logs.length === 0) return <p className="trace-empty">No hay registros para los filtros seleccionados.</p>;
    if (filteredLogs.length === 0) {
      return (
        <p className="trace-empty">
          Todos los registros visibles son desbloqueos de pantalla y están ocultos. Desactiva el filtro para verlos.
        </p>
      );
    }

    if (tab === 'usuario') {
      // Agrupar por fecha
      const grouped = groupBy(filteredLogs, (l) => fmtDate(l.timestamp));
      return (
        <div className="trace-results">
          <div className="trace-user-header">
            <strong>{filteredLogs[0]?.userName || 'Usuario'}</strong>
            <span className="trace-role-badge">{ROL_LABELS[filteredLogs[0]?.userRole] || filteredLogs[0]?.userRole}</span>
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
      const grouped = groupBy(filteredLogs, (l) => l.userName || 'Sistema');
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
      const grouped = groupBy(filteredLogs, (l) => l.userName || 'Sistema');
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

      {/* ── Toggle: ocultar desbloqueos de pantalla ── */}
      {logs.length > 0 && (
        <div className="trace-filter-toggle">
          <label className="trace-toggle-label">
            <input
              type="checkbox"
              checked={hideUnlocks}
              onChange={(e) => setHideUnlocks(e.target.checked)}
            />
            <span>
              Ocultar desbloqueos de pantalla
              {hiddenUnlocksCount > 0 && (
                <span className="trace-toggle-count"> ({hiddenUnlocksCount})</span>
              )}
            </span>
          </label>
        </div>
      )}

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
          <span className="trace-total">
            {total} registro{total !== 1 ? 's' : ''} encontrado{total !== 1 ? 's' : ''}
            {hideUnlocks && hiddenUnlocksCount > 0 && (
              <> · mostrando {filteredLogs.length}</>
            )}
          </span>
          <button
            className="settings-btn-primary"
            onClick={handleExportPDF}
            disabled={loading || exporting || total === 0}
          >
            {exporting ? 'Exportando…' : 'Exportar PDF'}
          </button>
        </div>
      )}
    </div>
  );
};

export default TraceabilitySection;
