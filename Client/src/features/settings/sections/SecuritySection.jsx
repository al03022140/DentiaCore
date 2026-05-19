import React, { useEffect, useState } from 'react';
import { getSettings, updateSettings } from '../../../shared/services/settingsService';
import { SETTINGS_UPDATED_EVENT } from '../../../shared/components/LockScreen';

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
      const payload = {
        inactivityTimeout: Number(inactivityTimeout),
        maxLoginAttempts: Number(maxLoginAttempts),
        lockDuration: Number(lockDuration),
      };
      await updateSettings(payload);
      // Avisar al LockScreen para que aplique el nuevo timeout sin recargar
      window.dispatchEvent(new CustomEvent(SETTINGS_UPDATED_EVENT, { detail: payload }));
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
        <label>Tiempo antes de cerrar sesión por inactividad (minutos)</label>
        <input type="number" min={1} max={120} value={inactivityTimeout} onChange={(e) => setInactivityTimeout(e.target.value)} />
        <span className="hint">
          Tras este tiempo sin mouse, teclado ni scroll se bloqueará la sesión y se pedirá el PIN.
          Tras {maxLoginAttempts} intentos fallidos de PIN se cierra sesión por completo.
        </span>
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
