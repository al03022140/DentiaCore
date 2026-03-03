import React, { useEffect, useRef, useMemo } from 'react';
import Chart from 'chart.js/auto'; // Esto ya incluye todo lo necesario
import "../styles/patient-stats.css";

const PatientStats = () => {
    const chartRef = useRef(null); // Referencia al canvas
    const chartInstanceRef = useRef(null); // Referencia al gráfico de Chart.js

    // Configuración del gráfico (reutilizable)
    const chartConfig = useMemo(
        () => ({
            type: 'bar',
            data: {
                labels: ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio'],
                datasets: [
                    {
                        label: 'Pacientes',
                        data: [65, 59, 80, 81, 56, 55, 40],
                        backgroundColor: 'rgba(75, 192, 192, 0.2)',
                        borderColor: 'rgba(75, 192, 192, 1)',
                        borderWidth: 1,
                    },
                ],
            },
            options: {
                responsive: true, // Ajuste automático al tamaño del contenedor
                maintainAspectRatio: false, // Permitir que el gráfico ocupe el espacio del contenedor
                scales: {
                    x: {
                        type: 'category',
                        title: {
                            display: true,
                            text: 'Meses',
                        },
                    },
                    y: {
                        beginAtZero: true, // Inicia en 0 para claridad
                        title: {
                            display: true,
                            text: 'Número de Pacientes',
                        },
                    },
                },
                plugins: {
                    legend: {
                        position: 'top',
                    },
                },
            },
        }),
        []
    );

    useEffect(() => {
        const ctx = chartRef.current.getContext('2d');
        // Si existe un gráfico previo, destruirlo antes de crear uno nuevo
        if (chartInstanceRef.current) {
            chartInstanceRef.current.destroy();
        }
        // Crear un nuevo gráfico (responsive: true ya maneja el resize automáticamente)
        chartInstanceRef.current = new Chart(ctx, chartConfig);

        // Limpieza: destruir el gráfico al desmontar el componente
        return () => {
            if (chartInstanceRef.current) {
                chartInstanceRef.current.destroy();
            }
        };
    }, [chartConfig]);

    return (
        <div className="patient-stats-container">
            <canvas ref={chartRef}></canvas>
        </div>
    );
};

export default PatientStats;