import { useEffect, useState, useCallback } from 'react';
import { getAuditTimeline } from '../../shared/services/auditService';
import './audit-timeline.css';
import plusIcon from '../../assets/images/icons/plus.svg';
import pencilIcon from '../../assets/images/icons/pencil.svg';
import eyeIcon from '../../assets/images/icons/eye.svg';
import checkCircle2Icon from '../../assets/images/icons/check circle 2.svg';
import trazability2Icon from '../../assets/images/icons/trazability 2.svg';

// Iconos por tipo de evento
const EVENT_ICONS = {
  creacion_registro:      <img src={plusIcon} alt="+" width="18" height="18" className="theme-icon" />,
  modificacion_registro:  <img src={pencilIcon} alt="editar" width="18" height="18" className="theme-icon" />,
  soft_delete:            '🗑️',
  firma_electronica:      '✍️',
  firma_lote:             '📝',
  acceso_expediente:      <img src={eyeIcon} alt="ver" width="18" height="18" className="theme-icon" />,
  captura_extemporanea:   '⏰',
  addendum:               '📎',
  borrador_creado:        '📄',
  borrador_aprobado:      <img src={checkCircle2Icon} alt="aprobado" width="18" height="18" className="theme-icon" />,
  borrador_rechazado:     '❌',
  plantilla_usada:        <img src={trazability2Icon} alt="plantilla" width="18" height="18" className="theme-icon" />,
};

const EVENT_COLORS = {
  creacion_registro:      '#38a169',
  modificacion_registro:  '#3182ce',
  soft_delete:            '#e53e3e',
  firma_electronica:      '#805ad5',
  firma_lote:             '#805ad5',
  acceso_expediente:      '#718096',
  captura_extemporanea:   '#d69e2e',
};

/**
 * Componente de Timeline de Auditoría por paciente.
 *
 * Muestra una línea temporal con todos los eventos del expediente
 * del paciente, incluyendo cambios antes/después.
 *
 * @param {object} props
 * @param {string} props.patientId - ID del paciente
 */
export default function AuditTimelinePage({ patientId }) {
  const [timeline, setTimeline] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [expandedId, setExpandedId] = useState(null);

  const fetchTimeline = useCallback(async (pageNum) => {
    if (!patientId) return;
    setLoading(true);
    setError(null);
    try {
      const data = await getAuditTimeline(patientId, { page: pageNum, limit: 50 });
      setTimeline(data.timeline || []);
      setTotalPages(data.pages || 1);
    } catch (err) {
      setError(err.response?.data?.error || 'Error al cargar timeline');
    } finally {
      setLoading(false);
    }
  }, [patientId]);

  useEffect(() => {
    fetchTimeline(page);
  }, [page, fetchTimeline]);

  const toggleExpand = (id) => {
    setExpandedId(prev => prev === id ? null : id);
  };

  const formatDate = (ts) => {
    if (!ts) return '';
    return new Date(ts).toLocaleDateString('es-MX', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  if (!patientId) {
    return <div className="audit-timeline__empty">Seleccione un paciente para ver su timeline.</div>;
  }

  return (
    <div className="audit-timeline">
      <h3 className="audit-timeline__title">Timeline de Auditoría</h3>

      {error && <div className="audit-timeline__error">{error}</div>}

      {loading ? (
        <div className="audit-timeline__loading">Cargando...</div>
      ) : timeline.length === 0 ? (
        <div className="audit-timeline__empty">No hay eventos registrados.</div>
      ) : (
        <div className="audit-timeline__list">
          {timeline.map((entry) => {
            const icon = EVENT_ICONS[entry.evento] || '📌';
            const color = EVENT_COLORS[entry.evento] || '#718096';
            const isExpanded = expandedId === entry._id;
            const hasDetails = entry.detalles && (entry.detalles.antes || entry.detalles.despues);

            return (
              <div key={entry._id} className="audit-timeline__item">
                <div className="audit-timeline__marker" style={{ borderColor: color }}>
                  <span>{icon}</span>
                </div>
                <div className="audit-timeline__content">
                  <div
                    className={`audit-timeline__header ${hasDetails ? 'audit-timeline__header--clickable' : ''}`}
                    onClick={() => hasDetails && toggleExpand(entry._id)}
                  >
                    <span className="audit-timeline__desc">{entry.descripcion}</span>
                    <span className="audit-timeline__meta">
                      {entry.userName} &middot; {formatDate(entry.timestamp)}
                    </span>
                    {hasDetails && (
                      <span className="audit-timeline__expand-icon">
                        {isExpanded ? '▾' : '▸'}
                      </span>
                    )}
                  </div>

                  {entry.camposEditados && entry.camposEditados.length > 0 && (
                    <div className="audit-timeline__campos">
                      Campos: {entry.camposEditados.join(', ')}
                    </div>
                  )}

                  {isExpanded && hasDetails && (
                    <div className="audit-timeline__diff">
                      {entry.detalles.antes && (
                        <div className="audit-timeline__diff-section audit-timeline__diff--antes">
                          <strong>Antes:</strong>
                          <pre>{JSON.stringify(entry.detalles.antes, null, 2)}</pre>
                        </div>
                      )}
                      {entry.detalles.despues && (
                        <div className="audit-timeline__diff-section audit-timeline__diff--despues">
                          <strong>Después:</strong>
                          <pre>{JSON.stringify(entry.detalles.despues, null, 2)}</pre>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {totalPages > 1 && (
        <div className="audit-timeline__pagination">
          <button
            disabled={page <= 1}
            onClick={() => setPage(p => Math.max(1, p - 1))}
          >
            ← Anterior
          </button>
          <span>Página {page} de {totalPages}</span>
          <button
            disabled={page >= totalPages}
            onClick={() => setPage(p => p + 1)}
          >
            Siguiente →
          </button>
        </div>
      )}
    </div>
  );
}
