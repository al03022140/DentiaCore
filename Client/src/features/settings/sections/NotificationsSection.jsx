import React, { useState } from 'react';
import { useAuth } from '../../../app/auth/AuthContext';
import { updateMyPreferences } from '../../../shared/services/settingsService';

const NotificationsSection = () => {
  const { user, refreshUser } = useAuth();
  const prefs = user?.preferences?.reminders || {};

  const [pendingDrafts, setPendingDrafts] = useState(prefs.pendingDrafts ?? true);
  const [upcomingAppointments, setUpcomingAppointments] = useState(prefs.upcomingAppointments ?? true);
  const [endOfDay, setEndOfDay] = useState(prefs.endOfDay ?? false);
  const [msg, setMsg] = useState(null);
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    setMsg(null);
    try {
      await updateMyPreferences({
        reminders: { pendingDrafts, upcomingAppointments, endOfDay },
      });
      if (refreshUser) await refreshUser();
      setMsg({ type: 'success', text: 'Notificaciones actualizadas' });
    } catch (err) {
      setMsg({ type: 'error', text: err.response?.data?.message || 'Error al guardar' });
    } finally {
      setSaving(false);
    }
  };

  const Toggle = ({ label, desc, checked, onChange }) => (
    <div className="settings-toggle">
      <div>
        <div className="settings-toggle-label">{label}</div>
        {desc && <div className="settings-toggle-desc">{desc}</div>}
      </div>
      <label className="settings-switch">
        <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
        <span className="slider" />
      </label>
    </div>
  );

  return (
    <div>
      {msg && <div className={`settings-message ${msg.type}`}>{msg.text}</div>}
      <Toggle
        label="Borradores pendientes"
        desc="Recordar notas sin guardar al iniciar sesión"
        checked={pendingDrafts}
        onChange={setPendingDrafts}
      />
      <Toggle
        label="Citas próximas"
        desc="Avisar 15 minutos antes de la siguiente cita"
        checked={upcomingAppointments}
        onChange={setUpcomingAppointments}
      />
      <Toggle
        label="Resumen de fin de día"
        desc="Mostrar resumen antes de cerrar sesión"
        checked={endOfDay}
        onChange={setEndOfDay}
      />
      <div className="settings-actions" style={{ marginTop: '1.5rem' }}>
        <button className="settings-btn-primary" onClick={handleSave} disabled={saving}>
          {saving ? 'Guardando…' : 'Guardar notificaciones'}
        </button>
      </div>
    </div>
  );
};

export default NotificationsSection;
