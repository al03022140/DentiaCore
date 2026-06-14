import React, { useEffect, useState } from 'react';
import { getSettings, updateSettings } from '../../../shared/services/settingsService';

// Los días se guardan como enteros 0-6 (convención JS getDay(): 0=domingo)
// para coincidir con el modelo `workDays: [Number]` y el validador del server
// (`isInt 0-6`). Antes el cliente enviaba nombres en español, que el validador
// rechazaba con 400 → el formulario nunca podía guardarse.
const DAYS = [
  { key: 1, label: 'Lunes' },
  { key: 2, label: 'Martes' },
  { key: 3, label: 'Miércoles' },
  { key: 4, label: 'Jueves' },
  { key: 5, label: 'Viernes' },
  { key: 6, label: 'Sábado' },
  { key: 0, label: 'Domingo' },
];

const AppointmentsSection = () => {
  const [duration, setDuration] = useState(30);
  const [startTime, setStartTime] = useState('09:00');
  const [endTime, setEndTime] = useState('18:00');
  const [workDays, setWorkDays] = useState([1, 2, 3, 4, 5]);
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
        // Reflejar un [] persistido (distinguir "no configurado" de "vacío
        // explícito"): si el server manda un array, usarlo tal cual.
        if (Array.isArray(s.workDays)) setWorkDays(s.workDays);
      })
      .catch(() => setMsg({ type: 'error', text: 'Error al cargar configuración' }))
      .finally(() => setLoading(false));
  }, []);

  const toggleDay = (day) => {
    setWorkDays((prev) => prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day]);
  };

  const handleSave = async (e) => {
    e.preventDefault();
    setMsg(null);
    // Validar ANTES de marcar saving (evita el early-return con saving colgado).
    // Comparación lexicográfica válida con HH:MM de ancho fijo.
    if (startTime >= endTime) {
      setMsg({ type: 'error', text: 'La hora de inicio debe ser anterior a la de fin' });
      return;
    }
    if (workDays.length < 1) {
      setMsg({ type: 'error', text: 'Selecciona al menos un día laboral' });
      return;
    }
    setSaving(true);
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
        {/* Opciones alineadas con el enum del modelo/validador del server
            (defaultAppointmentDuration). 90 no estaba permitido en el back
            (causaba 400 al guardar), por eso se omite. */}
        <select value={duration} onChange={(e) => setDuration(e.target.value)}>
          {[15, 20, 30, 45, 60].map((d) => <option key={d} value={d}>{d} min</option>)}
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
