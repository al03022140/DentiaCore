import API from '../../../shared/services/axios-instance';

const GRANULARITY_API_MAP = {
  diaria: 'day',
  semanal: 'week',
  mensual: 'month',
  anual: 'year'
};

const CHART_TYPE_MAP = {
  linea: 'line',
  barra: 'bar',
  pastel: 'pie',
  heatmap: 'bar'
};

// Paleta alineada con `Client/src/features/main-page/components/patient-stats.jsx`
// para que las gráficas de Estadísticas se vean iguales que el widget del Home.
const COLOR_PALETTE = [
  { bg: 'rgba(75, 192, 192, 0.25)',  border: 'rgba(75, 192, 192, 1)'  },
  { bg: 'rgba(54, 162, 235, 0.25)',  border: 'rgba(54, 162, 235, 1)'  },
  { bg: 'rgba(255, 159, 64, 0.25)',  border: 'rgba(255, 159, 64, 1)'  },
  { bg: 'rgba(153, 102, 255, 0.25)', border: 'rgba(153, 102, 255, 1)' }
];

const PIE_PALETTE = [
  'rgba(75, 192, 192, 0.85)',
  'rgba(54, 162, 235, 0.85)',
  'rgba(255, 159, 64, 0.85)',
  'rgba(153, 102, 255, 0.85)'
];

const buildParams = granularity => ({
  group: GRANULARITY_API_MAP[granularity] || granularity
});

const styleDatasets = (datasets, visualization) => {
  return datasets.map((ds, idx) => {
    const color = COLOR_PALETTE[idx % COLOR_PALETTE.length];

    if (visualization === 'pastel') {
      return {
        ...ds,
        backgroundColor: ds.data.map((_, i) => PIE_PALETTE[i % PIE_PALETTE.length]),
        borderColor: '#fff',
        borderWidth: 2
      };
    }

    const isLine = visualization === 'linea';
    return {
      ...ds,
      backgroundColor: color.bg,
      borderColor: color.border,
      fill: isLine,
      tension: isLine ? 0.35 : 0,
      borderWidth: isLine ? 2 : 1,
      pointRadius: isLine ? 3 : 0,
      pointHoverRadius: isLine ? 5 : 0
    };
  });
};

// ─── Endpoint fetchers ──────────────────────────────────

const fetchTotalRevenue = async (granularity, visualization) => {
  const params = buildParams(granularity);
  const { data } = await API.get('/stats/summary', { params });

  return {
    chartType: CHART_TYPE_MAP[visualization] || 'line',
    labels: data.revenue.labels,
    datasets: styleDatasets([{
      label: 'Ingresos ($)',
      data: data.revenue.data
    }], visualization)
  };
};

const fetchCashboxPerformance = async (granularity, visualization) => {
  const params = buildParams(granularity);
  const { data } = await API.get('/stats/cashbox-performance', { params });

  return {
    chartType: CHART_TYPE_MAP[visualization] || 'bar',
    labels: data.labels,
    datasets: styleDatasets(data.datasets, visualization)
  };
};

const fetchPatientTypeTrend = async (granularity, visualization) => {
  const params = buildParams(granularity);
  const { data } = await API.get('/stats/patients-trend', { params });

  return {
    chartType: CHART_TYPE_MAP[visualization] || 'bar',
    labels: data.labels,
    datasets: styleDatasets(data.datasets, visualization)
  };
};

const fetchNoShows = async (granularity, visualization) => {
  const params = buildParams(granularity);
  const { data } = await API.get('/stats/no-shows', { params });

  return {
    chartType: CHART_TYPE_MAP[visualization] || 'line',
    labels: data.labels,
    datasets: styleDatasets(data.datasets, visualization)
  };
};

const fetchProductivity = async (granularity, visualization) => {
  const params = buildParams(granularity);
  const { data } = await API.get('/stats/productivity', { params });

  return {
    chartType: CHART_TYPE_MAP[visualization] || 'line',
    labels: data.labels,
    datasets: styleDatasets(data.datasets, visualization)
  };
};

const fetchNetEarnings = async (granularity, visualization) => {
  const params = buildParams(granularity);
  const { data } = await API.get('/stats/net-earnings', { params });

  return {
    chartType: CHART_TYPE_MAP[visualization] || 'bar',
    labels: data.labels,
    datasets: styleDatasets(data.datasets, visualization)
  };
};

const fetchTreatmentStatus = async (granularity, visualization) => {
  const params = buildParams(granularity);
  const { data } = await API.get('/stats/treatment-status', { params });

  return {
    chartType: CHART_TYPE_MAP[visualization] || 'bar',
    labels: data.labels,
    datasets: styleDatasets(data.datasets, visualization)
  };
};

const fetchInactivePatients = async (_granularity, visualization) => {
  const { data } = await API.get('/stats/inactive-patients');

  return {
    chartType: CHART_TYPE_MAP[visualization] || 'bar',
    labels: data.labels,
    datasets: styleDatasets(data.datasets, visualization)
  };
};

const fetchCommonTreatments = async (_granularity, visualization) => {
  const { data } = await API.get('/stats/common-treatments');

  return {
    chartType: CHART_TYPE_MAP[visualization] || 'bar',
    labels: data.labels,
    datasets: styleDatasets(data.datasets, visualization)
  };
};

const fetchTreatmentDuration = async (_granularity, visualization) => {
  const { data } = await API.get('/stats/treatment-duration');

  return {
    chartType: CHART_TYPE_MAP[visualization] || 'bar',
    labels: data.labels,
    datasets: styleDatasets(data.datasets, visualization)
  };
};

// ─── Dispatcher principal ───────────────────────────────

const METRIC_FETCHERS = {
  'total-revenue': fetchTotalRevenue,
  'cashbox-performance': fetchCashboxPerformance,
  'patient-type-trend': fetchPatientTypeTrend,
  'no-shows': fetchNoShows,
  'net-earnings': fetchNetEarnings,
  'treatment-status': fetchTreatmentStatus,
  'inactive-patients': fetchInactivePatients,
  'common-treatments': fetchCommonTreatments,
  'treatment-duration': fetchTreatmentDuration
};

/**
 * Obtiene los datos reales de una métrica desde el backend.
 *
 * @param {string} metricId
 * @param {{ granularity: string, visualization: string }} options
 * @returns {Promise<{ chartType: string, labels: string[], datasets: object[] }>}
 */
export const fetchMetricData = async (metricId, { granularity, visualization }) => {
  const fetcher = METRIC_FETCHERS[metricId];

  if (!fetcher) {
    console.warn(`[statsService] Metrica "${metricId}" sin fetcher definido.`);
    return {
      chartType: CHART_TYPE_MAP[visualization] || 'bar',
      labels: [],
      datasets: []
    };
  }

  return fetcher(granularity, visualization);
};
