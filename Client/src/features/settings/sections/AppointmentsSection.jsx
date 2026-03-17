import React, { useEffect, useState } from 'react';
import { getSettings, updateSettings } from '../../../shared/services/settingsService';

const DAYS = [
  { key: 'lunes', label: 'Lunes' },
  { key: 'martes', label: 'Martes' },
  { key: 'miércoles', label: 'Miércoles' },
  { key: 'jueves', label: 'Jueves' },
  { key: 'viernes', label: 'Viernes' },
  { key: 'sábado', label: 'Sábado' },
  { key: 'domingo', label: 'Domingo' },
];

const AppointmentsSection = () => {
  const [duration, setDuration] = useState(30);
  const [startTime, setStartTime] = useState('09:00');
  const [endTime, setEndTime] = useState('18:00');
  const [workDays, setWorkDays] = useState(['lunes', 'martes', 'miércoles', 'jueves', 'viernes']);
  const [msg, setMsg] = useState(null);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getSettings()
      .then((s) => {
        setDuration(s.defaultAppointmentDuration ?? 30);
        if (s.businessHours) {
          setStartTime(s.businessHours.start || '09:00');
          setEndTime(s.businessHours.end || '18:00');
        }
        if (s.workDays?.length) setWorkDays(s.workDays);
      })
      .catch(() => setMsg({ type: 'error', text: 'Error al cargar configuración' }))
      .finally(() => setLoading(false));
  }, []);

  const toggleDay = (day) => {
    setWorkDays((prev) => prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day]);
  };

  const handleSave = async (e) => {
    e.preventDefault();
    setSaving(true);
    setMsg(null);
    try {
      await updateSettings({
        defaultAppointmentDuration: Number(duration),
        businessHours: { start: startTime, end: endTime },
        workDays,
      });
      setMsg({ type: 'success', text: 'Configuración de citas actualizada' });
    } catch (err) {
      setMsg({ type: 'error', text: err.response?.data?.message || 'Error al guardar' });
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <p>Cargando…</p>;

  return (
    <form onSubmit={handleSave}>
      {msg && <div className={`settings-message ${msg.type}`}>{msg.text}</div>}

      <div className="settings-form-group">
        <label>Duración predeterminada (minutos)</label>
        <select value={duration} onChange={(e) => setDuration(e.target.value)}>
          {[15, 20, 30, 45, 60, 90].map((d) => <option key={d} value={d}>{d} min</option>)}
        </select>
      </div>

      <div className="settings-form-group">
        <label>Horario de atención</label>
        <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
          <input type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} />
          <span>a</span>
          <input type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} />
        </div>
      </div>

      <div className="settings-form-group">
        <label>Días laborales</label>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
          {DAYS.map((d) => (
            <label key={d.key} style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: '0.9rem' }}>
              <input type="checkbox" checked={workDays.includes(d.key)} onChange={() => toggleDay(d.key)} />
              {d.label}
            </label>
          ))}
        </div>
      </div>

      <div className="settings-actions">
        <button type="submit" className="settings-btn-primary" disabled={saving}>
          {saving ? 'Guardando…' : 'Guardar configuración de citas'}
        </button>
      </div>
    </form>
  );
};

export default AppointmentsSection;
