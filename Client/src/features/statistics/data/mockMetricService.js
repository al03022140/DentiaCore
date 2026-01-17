const BASE_DELAY = 450;

const randomBetween = (min, max) => Math.round(Math.random() * (max - min) + min);

const generateTrendDataset = (granularity, scale = 1000) => {
  const steps = {
    diaria: 7,
    semanal: 8,
    mensual: 12,
    anual: 5
  }[granularity] || 6;

  const labels = Array.from({ length: steps }, (_, index) => index + 1).map(step => {
    switch (granularity) {
      case 'diaria':
        return `Dia ${step}`;
      case 'semanal':
        return `Sem ${step}`;
      case 'mensual':
        return `Mes ${step}`;
      case 'anual':
        return `Año ${2021 + step}`;
      default:
        return `Valor ${step}`;
    }
  });

  const base = randomBetween(scale * 0.5, scale * 0.9);
  const datasets = [
    {
      label: 'Serie principal',
      data: labels.map((_, idx) => base + Math.sin(idx) * scale * 0.1 + randomBetween(-scale * 0.05, scale * 0.15)),
      backgroundColor: 'rgba(58, 123, 213, 0.3)',
      borderColor: 'rgba(58, 123, 213, 0.9)',
      fill: true,
      tension: 0.3
    }
  ];

  return { labels, datasets };
};

const generateCompareDataset = (items = 5) => {
  const labels = Array.from({ length: items }, (_, idx) => `Item ${idx + 1}`);
  const datasets = [
    {
      label: 'Actual',
      data: labels.map(() => randomBetween(80, 180)),
      backgroundColor: labels.map(() => 'rgba(46, 204, 113, 0.7)'),
      borderColor: labels.map(() => 'rgba(39, 174, 96, 1)'),
      borderWidth: 1
    }
  ];

  return { labels, datasets };
};

const generatePieDataset = (segments = 4) => {
  const labels = Array.from({ length: segments }, (_, idx) => `Segmento ${idx + 1}`);
  const palette = [
    'rgba(52, 152, 219, 0.85)',
    'rgba(155, 89, 182, 0.85)',
    'rgba(241, 196, 15, 0.85)',
    'rgba(230, 126, 34, 0.85)',
    'rgba(46, 204, 113, 0.85)'
  ];
  const datasets = [
    {
      data: labels.map(() => randomBetween(10, 40)),
      backgroundColor: labels.map((_, idx) => palette[idx % palette.length]),
      borderWidth: 0
    }
  ];

  return { labels, datasets };
};

export const fetchMetricData = (metricId, { granularity, visualization }) => {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      try {
        let payload;
        switch (metricId) {
          case 'total-revenue':
            payload = generateTrendDataset(granularity, 1500);
            break;
          case 'cashbox-performance':
            payload = generateCompareDataset(6);
            break;
          case 'patient-cohorts':
            payload = generateTrendDataset(granularity, 600);
            break;
          case 'patient-type-trend':
            payload = {
              labels: ['Nuevos', 'Recurrentes'],
              datasets: [
                {
                  label: 'Pacientes',
                  data: [randomBetween(40, 120), randomBetween(50, 150)],
                  backgroundColor: ['rgba(52, 152, 219, 0.85)', 'rgba(46, 204, 113, 0.85)'],
                  borderWidth: 0
                }
              ]
            };
            break;
          case 'no-shows':
            payload = generateTrendDataset(granularity, 90);
            break;
          case 'inventory-alerts':
            payload = generateCompareDataset(8);
            break;
          case 'productivity':
            payload = generateTrendDataset(granularity, 45);
            break;
          case 'service-comparison':
            payload = generateCompareDataset(5);
            break;
          default:
            payload = generateTrendDataset(granularity, 100);
            break;
        }

        const chartType = (() => {
          if (visualization === 'pastel') {
            return 'pie';
          }
          if (visualization === 'linea') {
            return 'line';
          }
          if (visualization === 'heatmap') {
            return 'bar';
          }
          return visualization;
        })();

        resolve({ chartType, ...payload });
      } catch (error) {
        reject(error);
      }
    }, BASE_DELAY + randomBetween(100, 450));

    if (Math.random() < 0.02) {
      clearTimeout(timeout);
      reject(new Error('No fue posible cargar los datos.'));
    }
  });
};
