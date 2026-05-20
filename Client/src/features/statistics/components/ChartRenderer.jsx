import React, { useEffect, useRef } from 'react';
import Chart from 'chart.js/auto';

// Las opciones replican las del widget del home (patient-stats) para
// mantener un estilo visual consistente entre Home y Estadísticas:
// grid sutil sólo en Y, leyenda compacta arriba, tooltip por índice,
// padding superior para que la primera barra no roce el header, etc.
const buildOptions = (chartType, datasets) => {
  const showLegend = datasets.length > 1 || !!datasets[0]?.label;
  const isPie = chartType === 'pie' || chartType === 'doughnut';

  return {
    responsive: true,
    maintainAspectRatio: false,
    layout: { padding: { top: 12 } },
    plugins: {
      legend: {
        display: showLegend,
        position: 'top',
        labels: { boxWidth: 12, font: { size: 11 } },
      },
      tooltip: { mode: isPie ? 'nearest' : 'index', intersect: false },
    },
    scales: isPie ? {} : {
      x: {
        type: 'category',
        grid: { display: false },
        title: { display: false },
        ticks: { autoSkip: true, maxRotation: 0, maxTicksLimit: 8 },
      },
      y: {
        beginAtZero: true,
        grace: '15%',
        title: { display: false },
        ticks: { maxTicksLimit: 6, precision: 0 },
        grid: { color: 'rgba(0,0,0,0.05)' },
      },
    },
  };
};

const ChartRenderer = ({ chartType, labels, datasets }) => {
  const canvasRef = useRef(null);
  const chartRef = useRef(null);

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
  }, [chartType, datasets, labels]);

  return (
    <div className="chart-renderer">
      <canvas ref={canvasRef} aria-hidden="true" />
    </div>
  );
};

export default ChartRenderer;
