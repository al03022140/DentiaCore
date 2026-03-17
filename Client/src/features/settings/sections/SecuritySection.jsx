import React, { useEffect, useState } from 'react';
import { getSettings, updateSettings } from '../../../shared/services/settingsService';

const SecuritySection = () => {
  const [inactivityTimeout, setInactivityTimeout] = useState(15);
  const [maxLoginAttempts, setMaxLoginAttempts] = useState(5);
  const [lockDuration, setLockDuration] = useState(15);
  const [msg, setMsg] = useState(null);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getSettings()
      .then((s) => {
        setInactivityTimeout(s.inactivityTimeout ?? 15);
        setMaxLoginAttempts(s.maxLoginAttempts ?? 5);
        setLockDuration(s.lockDuration ?? 15);
      })
      .catch(() => setMsg({ type: 'error', text: 'Error al cargar configuración' }))
      .finally(() => setLoading(false));
  }, []);

  const handleSave = async (e) => {
    e.preventDefault();
    setSaving(true);
    setMsg(null);
    try {
      await updateSettings({
        inactivityTimeout: Number(inactivityTimeout),
        maxLoginAttempts: Number(maxLoginAttempts),
        lockDuration: Number(lockDuration),
      });
      setMsg({ type: 'success', text: 'Configuración de seguridad actualizada' });
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
        <label>Tiempo de inactividad antes de bloqueo (minutos)</label>
        <input type="number" min={1} max={120} value={inactivityTimeout} onChange={(e) => setInactivityTimeout(e.target.value)} />
        <span className="hint">Se bloqueará la sesión tras este tiempo sin actividad</span>
      </div>
      <div className="settings-form-group">
        <label>Intentos máximos de inicio de sesión</label>
        <input type="number" min={1} max={20} value={maxLoginAttempts} onChange={(e) => setMaxLoginAttempts(e.target.value)} />
      </div>
      <div className="settings-form-group">
        <label>Duración del bloqueo tras intentos fallidos (minutos)</label>
        <input type="number" min={1} max={60} value={lockDuration} onChange={(e) => setLockDuration(e.target.value)} />
      </div>
      <div className="settings-actions">
        <button type="submit" className="settings-btn-primary" disabled={saving}>
          {saving ? 'Guardando…' : 'Guardar seguridad'}
        </button>
      </div>
    </form>
  );
};

export default SecuritySection;
