import React, { useEffect, useRef, useState } from 'react';
import Chart from 'chart.js/auto';

// Lee los tokens del tema activo para que ejes y leyendas sean legibles
// tanto en claro como en oscuro (antes los colores estaban hardcodeados
// para fondo claro y se perdían sobre la tarjeta oscura).
const readThemeColors = () => {
  const cs = getComputedStyle(document.documentElement);
  const pick = (name, fallback) => {
    const value = cs.getPropertyValue(name).trim();
    return value || fallback;
  };
  return {
    text: pick('--color-text-secondary', '#555'),
    grid: pick('--color-border-light', 'rgba(0,0,0,0.06)'),
  };
};

// Las opciones replican las del widget del home (patient-stats) para
// mantener un estilo visual consistente entre Home y Estadísticas:
// grid sutil sólo en Y, leyenda compacta arriba, tooltip por índice,
// padding superior para que la primera barra no roce el header, etc.
const buildOptions = (chartType, datasets) => {
  const showLegend = datasets.length > 1 || !!datasets[0]?.label;
  const isPie = chartType === 'pie' || chartType === 'doughnut';
  const theme = readThemeColors();

  return {
    responsive: true,
    maintainAspectRatio: false,
    layout: { padding: { top: 12 } },
    plugins: {
      legend: {
        display: showLegend,
        position: 'top',
        labels: {
          boxWidth: 8,
          usePointStyle: true,
          pointStyle: 'circle',
          color: theme.text,
          font: { size: 11 },
        },
      },
      tooltip: { mode: isPie ? 'nearest' : 'index', intersect: false },
    },
    scales: isPie ? {} : {
      x: {
        type: 'category',
        grid: { display: false },
        title: { display: false },
        ticks: { autoSkip: true, maxRotation: 0, maxTicksLimit: 8, color: theme.text },
      },
      y: {
        beginAtZero: true,
        grace: '15%',
        title: { display: false },
        ticks: { maxTicksLimit: 6, precision: 0, color: theme.text },
        grid: { color: theme.grid },
      },
    },
  };
};

const ChartRenderer = ({ chartType, labels, datasets }) => {
  const canvasRef = useRef(null);
  const chartRef = useRef(null);
  // Se incrementa al cambiar el tema (data-theme) para reconstruir el chart
  // con los colores correctos sin necesidad de recargar.
  const [themeVersion, setThemeVersion] = useState(0);

  useEffect(() => {
    const observer = new MutationObserver(() => setThemeVersion(v => v + 1));
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['data-theme'],
    });
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!canvasRef.current) {
      return undefined;
    }

    const config = {
      type: chartType,
      data: { labels, datasets },
      options: buildOptions(chartType, datasets),
    };

    if (chartRef.current) {
      chartRef.current.destroy();
    }

    chartRef.current = new Chart(canvasRef.current, config);

    return () => {
      if (chartRef.current) {
        chartRef.current.destroy();
        chartRef.current = null;
      }
    };
  }, [chartType, datasets, labels, themeVersion]);

  return (
    <div className="chart-renderer">
      <canvas ref={canvasRef} aria-hidden="true" />
    </div>
  );
};

export default ChartRenderer;
