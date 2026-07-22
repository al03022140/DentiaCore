import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import './styles/statistics-page.css';
import ChartRenderer from './components/ChartRenderer';
import { fetchMetricData } from './data/statsService';

const METRICS = [
  {
    id: 'total-revenue',
    title: 'Ingresos Totales',
    description: 'Resumen de ingresos consolidados por periodo.',
    category: 'Finanzas',
    temporalities: ['diaria', 'semanal', 'mensual', 'anual'],
    visualizations: ['linea', 'barra', 'pastel']
  },
  {
    id: 'cashbox-performance',
    title: 'Caja por Turno',
    description: 'Cierres por turno y discrepancias detectadas.',
    category: 'Operaciones',
    temporalities: ['diaria', 'semanal', 'mensual'],
    visualizations: ['barra']
  },
  {
    id: 'patient-type-trend',
    title: 'Nuevos vs Recurrentes',
    description: 'Comparativa de pacientes nuevos contra recurrentes.',
    category: 'Pacientes',
    temporalities: ['diaria', 'semanal', 'mensual'],
    visualizations: ['linea', 'barra', 'pastel']
  },
  {
    id: 'no-shows',
    title: 'No Shows y Cancelaciones',
    description: 'Tasa de ausencias y cancelaciones por periodo.',
    category: 'Consultas',
    temporalities: ['diaria', 'semanal', 'mensual'],
    visualizations: ['linea', 'barra']
  },
  {
    id: 'net-earnings',
    title: 'Ganancias Netas',
    description: 'Ingresos menos gastos por periodo. Muestra el margen real de la clínica.',
    category: 'Finanzas',
    temporalities: ['diaria', 'semanal', 'mensual', 'anual'],
    visualizations: ['linea', 'barra']
  },
  {
    id: 'treatment-status',
    title: 'Tratamientos por Estado',
    description: 'Pendientes, en proceso y finalizados por periodo.',
    category: 'Operaciones',
    temporalities: ['semanal', 'mensual', 'anual'],
    visualizations: ['barra', 'linea']
  },
  {
    id: 'inactive-patients',
    title: 'Pacientes Inactivos',
    description: 'Pacientes sin visita reciente clasificados por tiempo sin asistir.',
    category: 'Pacientes',
    temporalities: ['mensual'],
    visualizations: ['barra', 'pastel']
  },
  {
    id: 'common-treatments',
    title: 'Tratamientos Más Comunes',
    description: 'Top 10 de procedimientos realizados con mayor frecuencia.',
    category: 'Operaciones',
    temporalities: ['mensual', 'anual'],
    visualizations: ['barra', 'pastel']
  },
  {
    id: 'treatment-duration',
    title: 'Duración Promedio de Tratamiento',
    description: 'Días promedio de inicio a cierre por tipo de tratamiento.',
    category: 'Operaciones',
    temporalities: ['mensual', 'anual'],
    visualizations: ['barra']
  }
];

const TEMPORALITY_LABELS = {
  diaria: 'Diaria',
  semanal: 'Semanal',
  mensual: 'Mensual',
  anual: 'Anual'
};

const VISUALIZATION_LABELS = {
  linea: 'Linea',
  barra: 'Barra',
  pastel: 'Pastel'
};

const SLOT_COUNT = 4;
const METRIC_ORDER = METRICS.map(metric => metric.id);
// v2: el layout pasó de un mapa por pestaña a un único arreglo plano de slots.
const LOCAL_STORAGE_KEY = 'dent-statistics-layout-v2';

const sortMetricIds = ids => {
  const unique = Array.from(new Set(ids));
  return METRIC_ORDER.filter(id => unique.includes(id));
};

const buildEmptyLayout = () => Array.from({ length: SLOT_COUNT }, () => null);

const sanitizeStoredState = raw => {
  if (!raw || typeof raw !== 'object') {
    return null;
  }

  const occupied = new Set();
  const slots = Array.isArray(raw.layout) ? raw.layout : [];

  const layout = buildEmptyLayout().map((_, index) => {
    const slot = slots[index];
    if (!slot || !METRIC_ORDER.includes(slot.metricId)) {
      return null;
    }
    const metric = METRICS.find(item => item.id === slot.metricId);
    if (!metric) {
      return null;
    }
    const granularity = metric.temporalities.includes(slot.granularity)
      ? slot.granularity
      : metric.temporalities[0];
    const visualization = metric.visualizations.includes(slot.visualization)
      ? slot.visualization
      : metric.visualizations[0];

    occupied.add(metric.id);
    return {
      metricId: metric.id,
      granularity,
      visualization,
      status: 'idle',
      data: null,
      error: null,
      requestId: null
    };
  });

  const available = Array.isArray(raw.availableMetricIds)
    ? sortMetricIds(raw.availableMetricIds.filter(id => METRIC_ORDER.includes(id) && !occupied.has(id)))
    : METRIC_ORDER.filter(id => !occupied.has(id));

  return { layout, availableMetricIds: available };
};

const serializeLayout = layout =>
  layout.map(slot => (slot
    ? {
        metricId: slot.metricId,
        granularity: slot.granularity,
        visualization: slot.visualization
      }
    : null));

const readStoredState = () => {
  if (typeof window === 'undefined') {
    return null;
  }
  try {
    const raw = window.localStorage.getItem(LOCAL_STORAGE_KEY);
    if (!raw) {
      return null;
    }
    return sanitizeStoredState(JSON.parse(raw));
  } catch (error) {
    console.warn('No se pudo restaurar el layout de estadisticas:', error);
    return null;
  }
};

const StatisticsPage = () => {
  const bootStateRef = useRef();
  if (bootStateRef.current === undefined) {
    bootStateRef.current = readStoredState();
  }
  const bootState = bootStateRef.current;

  const metricMap = useMemo(() => {
    const map = new Map();
    METRICS.forEach(metric => {
      map.set(metric.id, metric);
    });
    return map;
  }, []);

  const [availableMetricIds, setAvailableMetricIds] = useState(bootState?.availableMetricIds ?? METRIC_ORDER);
  const [layout, setLayout] = useState(() => {
    if (bootState?.layout) {
      return bootState.layout.map(slot => (slot ? { ...slot } : null));
    }
    return buildEmptyLayout();
  });
  const [draggedMetricId, setDraggedMetricId] = useState(null);
  const [highlightSlotKey, setHighlightSlotKey] = useState(null);
  const [openGranularityMenu, setOpenGranularityMenu] = useState(null);
  const [announcement, setAnnouncement] = useState('');
  const requestCounterRef = useRef(0);

  const startDataFetch = useCallback((slotIndex, metricId, granularity, visualization) => {
    if (!metricMap.has(metricId)) {
      return;
    }

    const requestId = requestCounterRef.current + 1;
    requestCounterRef.current = requestId;

    setLayout(prevLayout => {
      const nextSlots = [...prevLayout];
      nextSlots[slotIndex] = {
        metricId,
        granularity,
        visualization,
        status: 'loading',
        data: null,
        error: null,
        requestId
      };
      return nextSlots;
    });

    fetchMetricData(metricId, { granularity, visualization })
      .then(response => {
        setLayout(prevLayout => {
          const nextSlots = [...prevLayout];
          const current = nextSlots[slotIndex];
          if (!current || current.metricId !== metricId || current.requestId !== requestId) {
            return prevLayout;
          }

          nextSlots[slotIndex] = {
            ...current,
            status: 'ready',
            data: response,
            error: null
          };

          return nextSlots;
        });
      })
      .catch(error => {
        setLayout(prevLayout => {
          const nextSlots = [...prevLayout];
          const current = nextSlots[slotIndex];
          if (!current || current.metricId !== metricId || current.requestId !== requestId) {
            return prevLayout;
          }

          nextSlots[slotIndex] = {
            ...current,
            status: 'error',
            data: null,
            error: error.message || 'No se pudo cargar la metrica.'
          };

          return nextSlots;
        });
      });
  }, [metricMap]);

  const announce = useCallback(message => {
    setAnnouncement(message);
  }, []);

  const handleDragStart = (event, metricId) => {
    setDraggedMetricId(metricId);
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('text/plain', metricId);
    const metric = getMetric(metricId);
    announce(`Métrica ${metric?.title || metricId} seleccionada para mover.`);
  };

  const handleDragEnd = () => {
    setDraggedMetricId(null);
    setHighlightSlotKey(null);
  };

  const handleDragOverSlot = (event, slotIndex) => {
    if (!draggedMetricId) {
      return;
    }
    event.preventDefault();
    setHighlightSlotKey(`${slotIndex}`);
  };

  const handleDropOnSlot = (event, slotIndex) => {
    event.preventDefault();
    const metricId = event.dataTransfer.getData('text/plain') || draggedMetricId;
    if (!metricId || !availableMetricIds.includes(metricId)) {
      setHighlightSlotKey(null);
      return;
    }

    const metricDefinition = metricMap.get(metricId);
    const currentSlot = layout[slotIndex];
    setOpenGranularityMenu(null);

    if (!metricDefinition) {
      announce('No se puede colocar aquí.');
      setHighlightSlotKey(null);
      return;
    }

    startDataFetch(
      slotIndex,
      metricId,
      metricDefinition.temporalities[0],
      metricDefinition.visualizations[0]
    );

    setAvailableMetricIds(prevIds => {
      let nextIds = prevIds.filter(id => id !== metricId);
      if (currentSlot?.metricId && currentSlot.metricId !== metricId) {
        nextIds = [...nextIds, currentSlot.metricId];
      }
      return sortMetricIds(nextIds);
    });

    announce(`Métrica ${metricDefinition.title} colocada en slot ${slotIndex + 1}.`);

    setDraggedMetricId(null);
    setHighlightSlotKey(null);
  };

  const handleReturnMetric = (slotIndex) => {
    const slotData = layout[slotIndex];
    if (!slotData) {
      return;
    }

    setOpenGranularityMenu(prev => (prev === `${slotIndex}` ? null : prev));

    setLayout(prevLayout => {
      const nextSlots = [...prevLayout];
      nextSlots[slotIndex] = null;
      return nextSlots;
    });

    setAvailableMetricIds(prevIds => sortMetricIds([...prevIds, slotData.metricId]));
    setHighlightSlotKey(null);
    const metric = getMetric(slotData.metricId);
    announce(`Métrica ${metric?.title || slotData.metricId} devuelta a la lista.`);
  };

  const handleGranularityChange = (slotIndex, granularity) => {
    const slotData = layout[slotIndex];
    if (!slotData) {
      return;
    }

    startDataFetch(slotIndex, slotData.metricId, granularity, slotData.visualization);
  };

  const handleVisualizationChange = (slotIndex, visualization) => {
    const slotData = layout[slotIndex];
    if (!slotData) {
      return;
    }

    startDataFetch(slotIndex, slotData.metricId, slotData.granularity, visualization);
  };

  const getMetric = metricId => metricMap.get(metricId);

  const toggleGranularityMenu = (slotKey) => {
    setOpenGranularityMenu(prev => (prev === slotKey ? null : slotKey));
  };

  const closeGranularityMenu = () => {
    setOpenGranularityMenu(null);
  };

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    const payload = {
      availableMetricIds,
      layout: serializeLayout(layout)
    };

    window.localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(payload));
  }, [availableMetricIds, layout]);

  useEffect(() => {
    if (!bootState) {
      return;
    }

    (bootState.layout || []).forEach((slot, index) => {
      if (slot) {
        startDataFetch(index, slot.metricId, slot.granularity, slot.visualization);
      }
    });
  }, [bootState, startDataFetch]);

  const renderSlot = (slotIndex) => {
    const slotKey = `${slotIndex}`;
    const slotData = layout[slotIndex];

    if (!slotData) {
      return (
        <div
          key={slotKey}
          className={`chart-slot chart-slot--empty ${highlightSlotKey === slotKey ? 'chart-slot--active' : ''}`}
          onDragOver={event => handleDragOverSlot(event, slotIndex)}
          onDrop={event => handleDropOnSlot(event, slotIndex)}
          onDragLeave={() => setHighlightSlotKey(null)}
          role="button"
          tabIndex={0}
          aria-label="Slot vacio. Arrastra una metrica para asignarla"
          aria-dropeffect="move"
        >
          <div className="slot-placeholder">
            <span className="slot-placeholder__headline">Asignar grafica</span>
            <span className="slot-placeholder__caption">Arrastra una metrica desde la derecha</span>
          </div>
        </div>
      );
    }

    const metric = getMetric(slotData.metricId);

    return (
      <div
        key={slotKey}
        className={`chart-slot chart-slot--filled ${highlightSlotKey === slotKey ? 'chart-slot--active' : ''}`}
        onDragOver={event => handleDragOverSlot(event, slotIndex)}
        onDrop={event => handleDropOnSlot(event, slotIndex)}
        onDragLeave={() => setHighlightSlotKey(null)}
        role="button"
        tabIndex={0}
        aria-dropeffect="move"
        aria-label={`Slot ${slotIndex + 1}, ${metric.title}, Temporalidad ${TEMPORALITY_LABELS[slotData.granularity]}`}
      >
        <button
          type="button"
          className="chart-slot__remove"
          onClick={() => handleReturnMetric(slotIndex)}
          aria-label="Quitar gráfica"
        >
          ✕
        </button>
        <div className="chart-slot__header">
          <h4 className="chart-slot__title">{metric.title}</h4>
          <div className="chart-slot__controls">
            <div className="chart-slot__title-block">
              <span className="chart-slot__granularity-label">Temporalidad</span>
              <div
                className="chart-slot__granularity-dropdown"
                onBlur={event => {
                  const next = event.relatedTarget;
                  if (next && event.currentTarget.contains(next)) {
                    return;
                  }
                  requestAnimationFrame(() => {
                    if (!event.currentTarget.contains(document.activeElement)) {
                      closeGranularityMenu();
                    }
                  });
                }}
              >
                <button
                  type="button"
                  className="chart-slot__granularity"
                  aria-haspopup="listbox"
                  aria-label={`Temporalidad actual ${TEMPORALITY_LABELS[slotData.granularity]}`}
                  aria-expanded={openGranularityMenu === slotKey}
                  onClick={() => toggleGranularityMenu(slotKey)}
                >
                  <span>{TEMPORALITY_LABELS[slotData.granularity]}</span>
                  <span className="chart-slot__caret" aria-hidden="true">▾</span>
                </button>
                <ul
                  className={`chart-slot__granularity-menu ${openGranularityMenu === slotKey ? 'chart-slot__granularity-menu--open' : ''}`}
                  role="listbox"
                >
                  {metric.temporalities.map(option => (
                    <li key={option}>
                      <button
                        type="button"
                        role="option"
                        aria-selected={slotData.granularity === option}
                        onClick={() => {
                          handleGranularityChange(slotIndex, option);
                          closeGranularityMenu();
                        }}
                      >
                        {TEMPORALITY_LABELS[option]}
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
            <div className="chart-slot__viz-scroll" aria-label="Tipo de gráfica">
              <div className="chart-slot__viz-options">
                {metric.visualizations.map(option => (
                  <button
                    key={option}
                    type="button"
                    className={`viz-chip ${slotData.visualization === option ? 'viz-chip--active' : ''}`}
                    onClick={() => handleVisualizationChange(slotIndex, option)}
                  >
                    {VISUALIZATION_LABELS[option]}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
        <div className="chart-slot__body">
          {slotData.status === 'loading' && (
            <div className="chart-slot__loader" role="status" aria-live="polite">
              <span className="chart-slot__spinner" aria-hidden="true" />
              <span>Cargando datos...</span>
            </div>
          )}
          {slotData.status === 'error' && (
            <div className="chart-slot__state" role="alert">
              <p className="chart-slot__status-text chart-slot__status-text--error">
                {slotData.error || 'No se pudo cargar la metrica.'}
              </p>
              <button
                type="button"
                className="chart-slot__retry"
                onClick={() => startDataFetch(slotIndex, slotData.metricId, slotData.granularity, slotData.visualization)}
              >
                Reintentar
              </button>
            </div>
          )}
          {slotData.status === 'ready' && slotData.data && (
            <ChartRenderer
              chartType={slotData.data.chartType}
              labels={slotData.data.labels}
              datasets={slotData.data.datasets}
            />
          )}
          {slotData.status === 'idle' && !slotData.data && (
            <div className="chart-slot__status-text">Selecciona una configuracion para ver datos.</div>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="statistics-page">
      <div aria-live="polite" aria-atomic="true" className="sr-only" role="status">
        {announcement || ' '}
      </div>
      <div className="statistics-page__left">
        <div className="statistics-chart-grid">
          {Array.from({ length: SLOT_COUNT }, (_, index) => renderSlot(index))}
        </div>
      </div>

      <aside className="statistics-page__right">
        <header className="metrics-panel__header">
          <h3>Métricas</h3>
          <p>Arrastra para componer el tablero.</p>
        </header>
        <div className="metrics-panel__list" role="list">
          {availableMetricIds.map(metricId => {
            const metric = getMetric(metricId);
            return (
              <article
                key={metricId}
                className="metrics-card"
                draggable
                onDragStart={event => handleDragStart(event, metricId)}
                onDragEnd={handleDragEnd}
                tabIndex={0}
                role="listitem"
                aria-grabbed={draggedMetricId === metricId}
              >
                <header className="metrics-card__header">
                  <h4>{metric.title}</h4>
                  <span className="metrics-card__category">{metric.category}</span>
                </header>
                <div className="metrics-card__temporalities">
                  {metric.temporalities.map(option => (
                    <span key={option} className="metric-chip">
                      {TEMPORALITY_LABELS[option]}
                    </span>
                  ))}
                </div>
                <div className="metrics-card__visualizations">
                  {metric.visualizations.map(option => (
                    <span key={option} className="metric-chip metric-chip--ghost">
                      {VISUALIZATION_LABELS[option]}
                    </span>
                  ))}
                </div>
                <p className="metrics-card__description">{metric.description}</p>
              </article>
            );
          })}

          {availableMetricIds.length === 0 && (
            <div className="metrics-panel__empty">Todas las metricas estan asignadas.</div>
          )}
        </div>
      </aside>
    </div>
  );
};

export default StatisticsPage;
