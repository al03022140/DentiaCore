import React, { useEffect, useState } from 'react';
import plusIcon from '../../../assets/images/icons/plus.svg';
import menosIcon from '../../../assets/images/icons/menos.svg';
import { getSettings, updateSettings } from '../../../shared/services/settingsService';

const CashSection = () => {
  const [categories, setCategories] = useState([]);
  const [currency, setCurrency] = useState('MXN');
  const [serviceCatalog, setServiceCatalog] = useState([]);
  const [newCat, setNewCat] = useState('');
  const [newServiceName, setNewServiceName] = useState('');
  const [newServicePrice, setNewServicePrice] = useState('');
  const [msg, setMsg] = useState(null);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getSettings()
      .then((s) => {
        setCategories(s.cashCategories || []);
        setCurrency(s.currency || 'MXN');
        setServiceCatalog(s.serviceCatalog || []);
      })
      .catch(() => setMsg({ type: 'error', text: 'Error al cargar configuración' }))
      .finally(() => setLoading(false));
  }, []);

  const addCategory = () => {
    const trimmed = newCat.trim();
    if (!trimmed || categories.includes(trimmed)) return;
    setCategories((prev) => [...prev, trimmed]);
    setNewCat('');
  };

  const removeCategory = (cat) => {
    setCategories((prev) => prev.filter((c) => c !== cat));
  };

  const addService = () => {
    const nombre = newServiceName.trim();
    const precio = parseFloat(newServicePrice);
    if (!nombre || isNaN(precio) || precio < 0) return;
    if (serviceCatalog.some(s => s.nombre === nombre)) return;
    setServiceCatalog(prev => [...prev, { nombre, precioDefault: precio }]);
    setNewServiceName('');
    setNewServicePrice('');
  };

  const removeService = (nombre) => {
    setServiceCatalog(prev => prev.filter(s => s.nombre !== nombre));
  };

  const handleSave = async (e) => {
    e.preventDefault();
    setSaving(true);
    setMsg(null);
    try {
      await updateSettings({ cashCategories: categories, currency, serviceCatalog });
      setMsg({ type: 'success', text: 'Configuración de caja actualizada' });
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
        <label>Moneda</label>
        <select value={currency} onChange={(e) => setCurrency(e.target.value)}>
          <option value="MXN">MXN — Peso mexicano</option>
          <option value="USD">USD — Dólar estadounidense</option>
          <option value="EUR">EUR — Euro</option>
        </select>
      </div>

      <div className="settings-form-group">
        <label>Categorías de movimiento</label>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', marginBottom: '0.5rem' }}>
          {categories.map((cat) => (
            <span
              key={cat}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 4,
                padding: '4px 10px', background: 'var(--color-blue-500-12)',
                borderRadius: 'var(--border-radius-full)', fontSize: '0.85rem',
              }}
            >
              {cat}
              <button
                type="button"
                onClick={() => removeCategory(cat)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', fontWeight: 700, color: 'var(--color-danger)' }}
              >
                ×
              </button>
            </span>
          ))}
        </div>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <input
            value={newCat}
            onChange={(e) => setNewCat(e.target.value)}
            placeholder="Nueva categoría"
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addCategory(); } }}
          />
          <button type="button" className="settings-btn-secondary" onClick={addCategory}>Agregar</button>
                  <button type="button" className="settings-btn-secondary" onClick={addCategory}>
                    <img src={plusIcon} alt="Agregar" width="16" height="16" style={{verticalAlign:'middle',marginRight:4}} /> Agregar
                  </button>
        </div>
      </div>

      <div className="settings-form-group">
        <label>Catálogo de Servicios</label>
        <p style={{ fontSize: '0.85rem', color: 'var(--color-text-secondary)', margin: '0 0 0.5rem' }}>
          Servicios disponibles para cobrar a pacientes. El precio puede ajustarse al momento de cobrar.
        </p>
        {serviceCatalog.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', marginBottom: '0.75rem' }}>
            {serviceCatalog.map((svc) => (
              <div
                key={svc.nombre}
                style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  padding: '6px 12px', background: 'var(--color-blue-500-12)',
                  borderRadius: 'var(--border-radius-md)', fontSize: '0.9rem',
                }}
              >
                <span><strong>{svc.nombre}</strong> — ${svc.precioDefault.toLocaleString()}</span>
                <button
                  type="button"
                  onClick={() => removeService(svc.nombre)}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', fontWeight: 700, color: 'var(--color-danger)', fontSize: '1rem' }}
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        )}
        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
          <input
            value={newServiceName}
            onChange={(e) => setNewServiceName(e.target.value)}
            placeholder="Nombre del servicio"
            style={{ flex: 2 }}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addService(); } }}
          />
          <input
            type="number"
            value={newServicePrice}
            onChange={(e) => setNewServicePrice(e.target.value)}
            placeholder="Precio"
            min="0"
            step="0.01"
            style={{ flex: 1 }}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addService(); } }}
          />
          <button type="button" className="settings-btn-secondary" onClick={addService}>Agregar</button>
                  <button type="button" className="settings-btn-secondary" onClick={addService}>
                    <img src={plusIcon} alt="Agregar" width="16" height="16" style={{verticalAlign:'middle',marginRight:4}} /> Agregar
                  </button>
        </div>
      </div>

      <div className="settings-actions">
        <button type="submit" className="settings-btn-primary" disabled={saving}>
          {saving ? 'Guardando…' : 'Guardar configuración de caja'}
        </button>
      </div>
    </form>
  );
};

export default CashSection;
