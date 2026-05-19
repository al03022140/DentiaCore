import React, { useEffect, useRef, useState, useCallback } from 'react';
import Chart from 'chart.js/auto';
import { Skeleton } from 'antd';
import "../styles/patient-stats.css";
import API from '../../../shared/services/axios-instance';

const STAT_OPTIONS = [
  { key: 'patients-trend',      label: 'Tendencia de pacientes',   yLabel: 'Pacientes',  type: 'bar'  },
  { key: 'cashbox-performance', label: 'Rendimiento de caja',       yLabel: 'Ingresos',   type: 'bar'  },
  { key: 'no-shows',            label: 'Citas no presentadas',      yLabel: 'Citas',      type: 'bar'  },
  { key: 'productivity',        label: 'Productividad',             yLabel: 'Valor',      type: 'line' },
];

const PALETTE = [
  { bg: 'rgba(75, 192, 192, 0.25)',  border: 'rgba(75, 192, 192, 1)'  },
  { bg: 'rgba(54, 162, 235, 0.25)',  border: 'rgba(54, 162, 235, 1)'  },
  { bg: 'rgba(255, 159, 64, 0.25)',  border: 'rgba(255, 159, 64, 1)'  },
  { bg: 'rgba(153, 102, 255, 0.25)', border: 'rgba(153, 102, 255, 1)' },
];

const PatientStats = () => {
    const chartRef = useRef(null);
    const chartInstanceRef = useRef(null);
    const menuRef = useRef(null);

    const [chartData, setChartData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [selectedKey, setSelectedKey] = useState(
        () => localStorage.getItem('home_stat_key') || 'patients-trend'
    );
    const [menuOpen, setMenuOpen] = useState(false);

    const selectedStat = STAT_OPTIONS.find(o => o.key === selectedKey) || STAT_OPTIONS[0];

    const fetchStats = useCallback(async (key) => {
        try {
            setLoading(true);
            setError(null);
            const now = new Date();
            const from = new Date(now.getFullYear(), 0, 1).toISOString();
            const to = now.toISOString();
            const { data } = await API.get(`/stats/${key}`, {
                params: { from, to, group: 'month' }
            });
            setChartData(data);
        } catch (err) {
            console.error('Error fetching stats:', err);
            setError('No se pudieron cargar las estadísticas');
            setChartData(null);
        } finally {
            setLoading(false);
        }
    }, []);

    // Fetch con AbortController para cancelar la request anterior cuando el
    // usuario cambia rápido de selectedKey (race condition: si la primera
    // tarda más en responder, sobreescribe los datos de la segunda).
    useEffect(() => {
        const controller = new AbortController();
        let cancelled = false;
        (async () => {
            try {
                setLoading(true);
                setError(null);
                const now = new Date();
                const from = new Date(now.getFullYear(), 0, 1).toISOString();
                const to = now.toISOString();
                const { data } = await API.get(`/stats/${selectedKey}`, {
                    params: { from, to, group: 'month' },
                    signal: controller.signal,
                });
                if (cancelled) return;
                setChartData(data);
            } catch (err) {
                if (cancelled || controller.signal.aborted) return;
                console.error('Error fetching stats:', err);
                setError('No se pudieron cargar las estadísticas');
                setChartData(null);
            } finally {
                if (!cancelled) setLoading(false);
            }
        })();
        return () => {
            cancelled = true;
            controller.abort();
        };
    }, [selectedKey]);

    // Close menu on outside click
    useEffect(() => {
        const handler = (e) => {
            if (menuRef.current && !menuRef.current.contains(e.target)) setMenuOpen(false);
        };
        if (menuOpen) document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, [menuOpen]);

    useEffect(() => {
        if (!chartRef.current || !chartData) return;

        const ctx = chartRef.current.getContext('2d');
        if (chartInstanceRef.current) chartInstanceRef.current.destroy();

        // Normalize: summary returns { revenue } shape
        const labels = chartData.labels || chartData.revenue?.labels || [];
        const rawDatasets = chartData.datasets || chartData.revenue?.datasets
            ? (chartData.datasets || (chartData.revenue
                ? [{ label: 'Ingresos', data: chartData.revenue.data }]
                : []))
            : [];

        chartInstanceRef.current = new Chart(ctx, {
            type: selectedStat.type,
            data: {
                labels,
                datasets: rawDatasets.map((ds, i) => ({
                    label: ds.label,
                    data: ds.data,
                    backgroundColor: PALETTE[i % PALETTE.length].bg,
                    borderColor: PALETTE[i % PALETTE.length].border,
                    borderWidth: selectedStat.type === 'line' ? 2 : 1,
                    fill: selectedStat.type === 'line',
                    tension: 0.35,
                    pointRadius: selectedStat.type === 'line' ? 3 : 0,
                })),
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                layout: { padding: { top: 12 } },
                scales: {
                    x: {
                        type: 'category',
                        grid: { display: false },
                        title: { display: false },
                    },
                    y: {
                        beginAtZero: true,
                        grace: '15%',
                        title: { display: false },
                        ticks: { stepSize: 1, maxTicksLimit: 6 },
                        grid: { color: 'rgba(0,0,0,0.05)' },
                    },
                },
                plugins: {
                    legend: { position: 'top', labels: { boxWidth: 12, font: { size: 11 } } },
                    tooltip: { mode: 'index', intersect: false },
                },
            },
        });

        return () => { if (chartInstanceRef.current) chartInstanceRef.current.destroy(); };
    }, [chartData, selectedStat]);

    const handleSelectStat = (key) => {
        localStorage.setItem('home_stat_key', key);
        setSelectedKey(key);
        setMenuOpen(false);
    };

    return (
        <div className="patient-stats-container">
            <div className="patient-stats-header">
                <span className="patient-stats-title">{selectedStat.label}</span>
                <div className="patient-stats-menu" ref={menuRef}>
                    <button
                        className="patient-stats-dots"
                        onClick={() => setMenuOpen(o => !o)}
                        title="Cambiar estadística"
                        aria-label="Opciones de estadística"
                    >
                        <span /><span /><span />
                    </button>
                    {menuOpen && (
                        <div className="patient-stats-dropdown">
                            {STAT_OPTIONS.map(opt => (
                                <button
                                    key={opt.key}
                                    className={`patient-stats-dropdown__item${opt.key === selectedKey ? ' active' : ''}`}
                                    onClick={() => handleSelectStat(opt.key)}
                                >
                                    {opt.label}
                                </button>
                            ))}
                        </div>
                    )}
                </div>
            </div>

            {loading ? (
                <div className="patient-stats-body">
                    <Skeleton active paragraph={{ rows: 4 }} />
                </div>
            ) : error ? (
                <div className="patient-stats-body">
                    <p className="patient-stats-error">{error}</p>
                </div>
            ) : (
                <div className="patient-stats-body">
                    <canvas ref={chartRef} />
                </div>
            )}
        </div>
    );
};

export default PatientStats;
