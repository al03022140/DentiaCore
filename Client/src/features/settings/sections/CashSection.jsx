import React, { useEffect, useMemo, useState } from 'react';
import { Popconfirm } from 'antd';
import { getSettings, updateSettings } from '../../../shared/services/settingsService';
import { formatMoney } from '../../../shared/utils/money';

// Tope superior del precio default — alineado con el schema del servidor
// (clinicSettings.MAX_SERVICE_PRICE). Si se baja en el back, ajustar aquí.
const MAX_SERVICE_PRICE = 100_000_000;
const MAX_SERVICE_NAME = 80;
const MAX_CATEGORY_NAME = 60;

// Monedas soportadas — debe coincidir con clinicSettings.SUPPORTED_CURRENCIES
// en el servidor. Si se agregan/quitan opciones, sincronizar ambos lados.
const SUPPORTED_CURRENCIES = [
  { code: 'MXN', label: 'MXN — Peso mexicano' },
  { code: 'USD', label: 'USD — Dólar estadounidense' },
  { code: 'EUR', label: 'EUR — Euro' },
  { code: 'COP', label: 'COP — Peso colombiano' },
  { code: 'ARS', label: 'ARS — Peso argentino' },
  { code: 'CLP', label: 'CLP — Peso chileno' },
  { code: 'PEN', label: 'PEN — Sol peruano' }
];

// Compara contenidos por estructura — usado para detectar dirty state.
const isEqual = (a, b) => JSON.stringify(a) === JSON.stringify(b);

const CashSection = () => {
  // initial preserva el snapshot servidor para diff y restore
  const [initial, setInitial] = useState({ cashCategories: [], currency: 'MXN', serviceCatalog: [] });
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
        const cats = Array.isArray(s.cashCategories) ? s.cashCategories : [];
        const svcs = Array.isArray(s.serviceCatalog) ? s.serviceCatalog : [];
        const cur = s.currency || 'MXN';
        setCategories(cats);
        setCurrency(cur);
        setServiceCatalog(svcs);
        setInitial({ cashCategories: cats, currency: cur, serviceCatalog: svcs });
      })
      .catch(() => setMsg({ type: 'error', text: 'Error al cargar configuración' }))
      .finally(() => setLoading(false));
  }, []);

  const isDirty = useMemo(() => (
    !isEqual(initial.cashCategories, categories)
    || initial.currency !== currency
    || !isEqual(initial.serviceCatalog, serviceCatalog)
  ), [initial, categories, currency, serviceCatalog]);

  // Aviso de salir sin guardar — protege contra pérdida accidental de cambios.
  useEffect(() => {
    if (!isDirty) return undefined;
    const handler = (e) => {
      e.preventDefault();
      // El mensaje real depende del browser (string ignorado en Chrome moderno).
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [isDirty]);

  // Resta el msg al modificar para no mostrar "guardado" tras nuevos cambios.
  useEffect(() => { if (msg) setMsg(null); }, [categories, currency, serviceCatalog]); // eslint-disable-line react-hooks/exhaustive-deps

  // Normaliza nombre: trim + colapsar espacios. Compara case-insensitive para
  // detectar duplicados pero preserva el casing introducido por el usuario.
  const normalizeName = (raw) => String(raw || '').trim().replace(/\s+/g, ' ');
  const isDupCategory = (name) => {
    const k = name.toLowerCase();
    return categories.some((c) => c.toLowerCase() === k);
  };
  const isDupService = (name) => {
    const k = name.toLowerCase();
    return serviceCatalog.some((s) => s.nombre.toLowerCase() === k);
  };

  const addCategory = () => {
    const trimmed = normalizeName(newCat);
    if (!trimmed) return;
    if (trimmed.length > MAX_CATEGORY_NAME) {
      setMsg({ type: 'error', text: `La categoría no puede superar ${MAX_CATEGORY_NAME} caracteres` });
      return;
    }
    if (isDupCategory(trimmed)) {
      setMsg({ type: 'error', text: `Ya existe la categoría "${trimmed}"` });
      return;
    }
    setCategories((prev) => [...prev, trimmed]);
    setNewCat('');
  };

  const removeCategory = (cat) => {
    setCategories((prev) => prev.filter((c) => c !== cat));
  };

  const addService = () => {
    const nombre = normalizeName(newServiceName);
    const precio = parseFloat(newServicePrice);
    if (!nombre) {
      setMsg({ type: 'error', text: 'El nombre del servicio es obligatorio' });
      return;
    }
    if (nombre.length > MAX_SERVICE_NAME) {
      setMsg({ type: 'error', text: `El nombre no puede superar ${MAX_SERVICE_NAME} caracteres` });
      return;
    }
    if (!Number.isFinite(precio) || precio < 0) {
      setMsg({ type: 'error', text: 'El precio debe ser un número ≥ 0' });
      return;
    }
    if (precio > MAX_SERVICE_PRICE) {
      setMsg({ type: 'error', text: `El precio excede el máximo permitido (${formatMoney(MAX_SERVICE_PRICE)})` });
      return;
    }
    if (isDupService(nombre)) {
      setMsg({ type: 'error', text: `Ya existe el servicio "${nombre}"` });
      return;
    }
    setServiceCatalog((prev) => [...prev, {
      nombre,
      precioDefault: Math.round(precio * 100) / 100
    }]);
    setNewServiceName('');
    setNewServicePrice('');
  };

  const removeService = (nombre) => {
    setServiceCatalog((prev) => prev.filter((s) => s.nombre !== nombre));
  };

  const resetChanges = () => {
    setCategories(initial.cashCategories);
    setCurrency(initial.currency);
    setServiceCatalog(initial.serviceCatalog);
    setNewCat('');
    setNewServiceName('');
    setNewServicePrice('');
    setMsg(null);
  };

  const handleSave = async (e) => {
    e.preventDefault();
    if (saving || !isDirty) return;
    setSaving(true);
    setMsg(null);
    try {
      const saved = await updateSettings({ cashCategories: categories, currency, serviceCatalog });
      // Sincronizar snapshot con lo que efectivamente persistió (incluye dedup/normalize del server)
      setInitial({
        cashCategories: saved.cashCategories || [],
        currency: saved.currency || 'MXN',
        serviceCatalog: saved.serviceCatalog || []
      });
      setCategories(saved.cashCategories || []);
      setCurrency(saved.currency || 'MXN');
      setServiceCatalog(saved.serviceCatalog || []);
      setMsg({ type: 'success', text: 'Configuración de caja actualizada' });
    } catch (err) {
      const detail = err?.response?.data?.errors?.[0]?.msg;
      setMsg({ type: 'error', text: detail || err?.response?.data?.message || 'Error al guardar' });
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <p>Cargando…</p>;

  return (
    <form onSubmit={handleSave}>
      {msg && <div className={`settings-message ${msg.type}`}>{msg.text}</div>}
      {isDirty && !msg && (
        <div className="settings-message info">
          Hay cambios sin guardar.
        </div>
      )}

      <div className="settings-form-group">
        <label>Moneda</label>
        <select value={currency} onChange={(e) => setCurrency(e.target.value)}>
          {SUPPORTED_CURRENCIES.map((c) => (
            <option key={c.code} value={c.code}>{c.label}</option>
          ))}
        </select>
        <p style={{ fontSize: '0.78rem', color: 'var(--color-text-secondary)', marginTop: 4 }}>
          Esta moneda se aplica a todos los importes mostrados en Caja y en la ficha del paciente.
        </p>
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
              <Popconfirm
                title="¿Quitar esta categoría?"
                description="Los movimientos existentes con esta categoría no se modifican."
                okText="Quitar"
                cancelText="Cancelar"
                onConfirm={() => removeCategory(cat)}
              >
                <button
                  type="button"
                  aria-label={`Quitar categoría ${cat}`}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', fontWeight: 700, color: 'var(--color-danger)' }}
                >
                  ×
                </button>
              </Popconfirm>
            </span>
          ))}
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', alignItems: 'center' }}>
          <input
            value={newCat}
            onChange={(e) => setNewCat(e.target.value)}
            placeholder="Nueva categoría"
            maxLength={MAX_CATEGORY_NAME}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addCategory(); } }}
          />
          <button type="button" className="settings-btn-secondary settings-btn--with-icon" onClick={addCategory}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M12 5v14M5 12h14" />
            </svg>
            Agregar
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
                <span><strong>{svc.nombre}</strong> — {formatMoney(svc.precioDefault)}</span>
                <Popconfirm
                  title="¿Quitar este servicio del catálogo?"
                  description="Los cobros que ya lo usaron no se modifican."
                  okText="Quitar"
                  cancelText="Cancelar"
                  onConfirm={() => removeService(svc.nombre)}
                >
                  <button
                    type="button"
                    aria-label={`Quitar servicio ${svc.nombre}`}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', fontWeight: 700, color: 'var(--color-danger)', fontSize: '1rem' }}
                  >
                    ×
                  </button>
                </Popconfirm>
              </div>
            ))}
          </div>
        )}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', alignItems: 'center' }}>
          <input
            value={newServiceName}
            onChange={(e) => setNewServiceName(e.target.value)}
            placeholder="Nombre del servicio"
            maxLength={MAX_SERVICE_NAME}
            style={{ flex: '2 1 140px' }}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addService(); } }}
          />
          <input
            type="number"
            value={newServicePrice}
            onChange={(e) => setNewServicePrice(e.target.value)}
            placeholder="Precio"
            min="0"
            max={MAX_SERVICE_PRICE}
            step="0.01"
            style={{ flex: '1 1 88px' }}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addService(); } }}
          />
          <button type="button" className="settings-btn-secondary settings-btn--with-icon" onClick={addService}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M12 5v14M5 12h14" />
            </svg>
            Agregar
          </button>
        </div>
      </div>

      <div className="settings-actions" style={{ display: 'flex', gap: '0.5rem' }}>
        <button type="submit" className="settings-btn-primary" disabled={saving || !isDirty}>
          {saving ? 'Guardando…' : 'Guardar configuración de caja'}
        </button>
        {isDirty && (
          <Popconfirm
            title="¿Descartar cambios?"
            description="Se restaurarán los valores guardados previamente."
            okText="Descartar"
            cancelText="Volver"
            onConfirm={resetChanges}
          >
            <button type="button" className="settings-btn-secondary" disabled={saving}>
              Descartar
            </button>
          </Popconfirm>
        )}
      </div>
    </form>
  );
};

export default CashSection;
