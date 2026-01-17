import React, { useEffect, useRef } from 'react';
import Chart from 'chart.js/auto';

const ChartRenderer = ({ chartType, labels, datasets }) => {
  const canvasRef = useRef(null);
  const chartRef = useRef(null);

  useEffect(() => {
    if (!canvasRef.current) {
      return undefined;
    }

    const config = {
      type: chartType,
      data: {
        labels,
        datasets
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            display: datasets.length > 1 || !!datasets[0]?.label,
            position: 'top'
          }
        },
        scales: chartType === 'pie' ? {} : {
          x: {
            ticks: {
              autoSkip: true,
              maxRotation: 0
            }
          },
          y: {
            beginAtZero: true
          }
        }
      }
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
