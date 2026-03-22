import React, { useEffect, useRef, useState } from 'react';
import Chart from 'chart.js/auto';
import { Skeleton } from 'antd';
import "../styles/patient-stats.css";
import API from '../../../shared/services/axios-instance';

const PatientStats = () => {
    const chartRef = useRef(null);
    const chartInstanceRef = useRef(null);
    const [chartData, setChartData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    useEffect(() => {
        const fetchStats = async () => {
            try {
                setLoading(true);
                const now = new Date();
                const from = new Date(now.getFullYear(), 0, 1).toISOString();
                const to = now.toISOString();
                const { data } = await API.get('/stats/patients-trend', {
                    params: { from, to, group: 'month' }
                });
                setChartData(data);
                setError(null);
            } catch (err) {
                console.error('Error fetching patient stats:', err);
                setError('No se pudieron cargar las estadísticas');
                setChartData(null);
            } finally {
                setLoading(false);
            }
        };
        fetchStats();
    }, []);

    useEffect(() => {
        if (!chartRef.current || !chartData) return;

        const ctx = chartRef.current.getContext('2d');
        if (chartInstanceRef.current) {
            chartInstanceRef.current.destroy();
        }

        const colors = {
            new: { bg: 'rgba(75, 192, 192, 0.2)', border: 'rgba(75, 192, 192, 1)' },
            returning: { bg: 'rgba(54, 162, 235, 0.2)', border: 'rgba(54, 162, 235, 1)' }
        };

        chartInstanceRef.current = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: chartData.labels || [],
                datasets: (chartData.datasets || []).map((ds, i) => ({
                    label: ds.label,
                    data: ds.data,
                    backgroundColor: i === 0 ? colors.new.bg : colors.returning.bg,
                    borderColor: i === 0 ? colors.new.border : colors.returning.border,
                    borderWidth: 1,
                })),
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                    x: {
                        type: 'category',
                        title: { display: true, text: 'Periodo' },
                    },
                    y: {
                        beginAtZero: true,
                        title: { display: true, text: 'Pacientes' },
                        ticks: { stepSize: 1 },
                    },
                },
                plugins: {
                    legend: { position: 'top' },
                },
            },
        });

        return () => {
            if (chartInstanceRef.current) {
                chartInstanceRef.current.destroy();
            }
        };
    }, [chartData]);

    if (loading) {
        return (
            <div className="patient-stats-container">
                <Skeleton active paragraph={{ rows: 4 }} />
            </div>
        );
    }

    if (error) {
        return (
            <div className="patient-stats-container">
                <p className="patient-stats-error">{error}</p>
            </div>
        );
    }

    return (
        <div className="patient-stats-container">
            <canvas ref={chartRef}></canvas>
        </div>
    );
};

export default PatientStats;
