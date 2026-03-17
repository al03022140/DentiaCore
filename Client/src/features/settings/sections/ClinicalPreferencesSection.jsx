import React, { useState } from 'react';
import { useAuth } from '../../../app/auth/AuthContext';
import { updateMyPreferences } from '../../../shared/services/settingsService';
import NoteTemplateEditor from '../components/NoteTemplateEditor';

const DURATIONS = [15, 20, 30, 45, 60, 90];

const ClinicalPreferencesSection = () => {
  const { user, refreshUser } = useAuth();
  const prefs = user?.preferences || {};

  const [duration, setDuration] = useState(prefs.defaultAppointmentDuration || 30);
  const [header, setHeader] = useState(prefs.prescriptionDefaults?.header || '');
  const [footer, setFooter] = useState(prefs.prescriptionDefaults?.footer || '');
  const [msg, setMsg] = useState(null);
  const [saving, setSaving] = useState(false);

  const handleSave = async (e) => {
    e.preventDefault();
    setSaving(true);
    setMsg(null);
    try {
      await updateMyPreferences({
        defaultAppointmentDuration: Number(duration),
        prescriptionDefaults: { header, footer },
      });
      if (refreshUser) await refreshUser();
      setMsg({ type: 'success', text: 'Preferencias clínicas actualizadas' });
    } catch (err) {
      setMsg({ type: 'error', text: err.response?.data?.message || 'Error al guardar' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      <form onSubmit={handleSave}>
        {msg && <div className={`settings-message ${msg.type}`}>{msg.text}</div>}

        <div className="settings-form-group">
          <label>Duración predeterminada de cita (minutos)</label>
          <select value={duration} onChange={(e) => setDuration(e.target.value)}>
            {DURATIONS.map((d) => (
              <option key={d} value={d}>{d} min</option>
            ))}
          </select>
        </div>

        <div className="settings-form-group">
          <label>Encabezado de receta</label>
          <textarea
            rows={3}
            value={header}
            onChange={(e) => setHeader(e.target.value)}
            placeholder="Ej: Dr. Juan Pérez — Cédula 12345"
          />
          <span className="hint">Se mostrará en la parte superior de las recetas generadas</span>
        </div>

        <div className="settings-form-group">
          <label>Pie de receta</label>
          <textarea
            rows={3}
            value={footer}
            onChange={(e) => setFooter(e.target.value)}
            placeholder="Ej: Clínica Dental DentiaCore — Tel. 555-1234"
          />
        </div>

        <div className="settings-actions">
          <button type="submit" className="settings-btn-primary" disabled={saving}>
            {saving ? 'Guardando…' : 'Guardar preferencias'}
          </button>
        </div>
      </form>

      <hr style={{ margin: '2rem 0', borderColor: 'var(--color-border-light)' }} />

      <h3 style={{ marginBottom: '1rem' }}>Plantillas de notas de evolución</h3>
      <NoteTemplateEditor />
    </div>
  );
};

export default ClinicalPreferencesSection;
