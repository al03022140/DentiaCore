import React, { useEffect, useState, useRef } from 'react';
import { getSettings, updateSettings, uploadLogo, deleteLogo, getLogoUrl } from '../../../shared/services/settingsService';

const ClinicSection = () => {
  const [form, setForm] = useState({ clinicName: '', address: '', phone: '' });
  const [hasLogo, setHasLogo] = useState(false);
  const [logoKey, setLogoKey] = useState(0);
  const [msg, setMsg] = useState(null);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const fileRef = useRef(null);

  useEffect(() => {
    getSettings()
      .then((s) => {
        setForm({ clinicName: s.clinicName || '', address: s.address || '', phone: s.phone || '' });
        setHasLogo(!!s.logoUrl);
      })
      .catch(() => setMsg({ type: 'error', text: 'Error al cargar configuración' }))
      .finally(() => setLoading(false));
  }, []);

  const handleChange = (field) => (e) => setForm((prev) => ({ ...prev, [field]: e.target.value }));

  const handleSave = async (e) => {
    e.preventDefault();
    setSaving(true);
    setMsg(null);
    try {
      await updateSettings(form);
      setMsg({ type: 'success', text: 'Datos de la clínica actualizados' });
    } catch (err) {
      setMsg({ type: 'error', text: err.response?.data?.message || 'Error al guardar' });
    } finally {
      setSaving(false);
    }
  };

  const handleLogoUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setMsg(null);
    try {
      await uploadLogo(file);
      setHasLogo(true);
      setLogoKey((k) => k + 1);
      setMsg({ type: 'success', text: 'Logo actualizado' });
    } catch (err) {
      setMsg({ type: 'error', text: err.response?.data?.message || 'Error al subir logo' });
    }
    if (fileRef.current) fileRef.current.value = '';
  };

  const handleLogoDelete = async () => {
    setMsg(null);
    try {
      await deleteLogo();
      setHasLogo(false);
      setMsg({ type: 'success', text: 'Logo eliminado' });
    } catch (err) {
      setMsg({ type: 'error', text: err.response?.data?.message || 'Error al eliminar logo' });
    }
  };

  if (loading) return <p>Cargando…</p>;

  return (
    <div>
      <form onSubmit={handleSave}>
        {msg && <div className={`settings-message ${msg.type}`}>{msg.text}</div>}
        <div className="settings-form-group">
          <label>Nombre de la clínica</label>
          <input value={form.clinicName} onChange={handleChange('clinicName')} required />
        </div>
        <div className="settings-form-group">
          <label>Dirección</label>
          <input value={form.address} onChange={handleChange('address')} />
        </div>
        <div className="settings-form-group">
          <label>Teléfono</label>
          <input value={form.phone} onChange={handleChange('phone')} />
        </div>
        <div className="settings-actions">
          <button type="submit" className="settings-btn-primary" disabled={saving}>
            {saving ? 'Guardando…' : 'Guardar datos de la clínica'}
          </button>
        </div>
      </form>

      <hr style={{ margin: '2rem 0', borderColor: 'var(--color-border-light)' }} />

      <h3 style={{ marginBottom: '1rem' }}>Logo de la clínica</h3>
      {hasLogo && (
        <div style={{ marginBottom: '1rem' }}>
          <img
            key={logoKey}
            src={`${getLogoUrl()}?t=${logoKey}`}
            alt="Logo de la clínica"
            style={{ maxWidth: '200px', maxHeight: '120px', objectFit: 'contain', borderRadius: 'var(--border-radius-md)', border: '1px solid var(--color-border-light)' }}
          />
        </div>
      )}
      <div className="settings-actions">
        <label className="settings-btn-secondary" style={{ cursor: 'pointer' }}>
          {hasLogo ? 'Cambiar logo' : 'Subir logo'}
          <input
            ref={fileRef}
            type="file"
            accept="image/png,image/jpeg,image/svg+xml"
            onChange={handleLogoUpload}
            style={{ display: 'none' }}
          />
        </label>
        {hasLogo && (
          <button type="button" className="settings-btn-danger" onClick={handleLogoDelete}>Eliminar logo</button>
        )}
      </div>
      <span className="hint" style={{ display: 'block', marginTop: 'var(--spacing-sm)' }}>PNG, JPG o SVG. Máximo 1MB. Se muestra en documentos impresos.</span>
    </div>
  );
};

export default ClinicSection;
