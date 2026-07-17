import React, { useEffect, useMemo, useState } from 'react';
import PropTypes from 'prop-types';
import { Modal, Button, InputNumber, AutoComplete, Select, message, Alert } from 'antd';
import {
  getInventoryItems,
  getInventoryKits,
  consumeInventory
} from '../../../shared/services/inventory-service';

/**
 * Registro de materiales consumidos en una cita.
 *
 * - El buscador muestra el stock disponible de cada ítem.
 * - Si la cita tiene procedimientos (`appointment.items`), se sugiere
 *   automáticamente el kit que coincida (decisión del dueño: el kit
 *   SUGIERE y el usuario confirma — nunca descuento automático).
 * - Stock insuficiente NO bloquea: el backend descuenta lo disponible y
 *   reporta el faltante (queda en el kardex).
 */
const ConsumeMaterialsModal = ({ visible, onClose, appointment = null, onSaved }) => {
  const [items, setItems] = useState([]);
  const [kits, setKits] = useState([]);
  const [rows, setRows] = useState([]);
  const [saving, setSaving] = useState(false);
  const [suggestedKit, setSuggestedKit] = useState(null);

  useEffect(() => {
    if (!visible) return;
    let cancelled = false;
    setRows([{ item_id: null, query: '', cantidad: 1 }]);
    setSuggestedKit(null);
    Promise.all([
      getInventoryItems({ limit: 500 }).catch(() => ({ items: [] })),
      getInventoryKits().catch(() => [])
    ]).then(([itemsData, kitsData]) => {
      if (cancelled) return;
      setItems(itemsData.items || []);
      setKits(kitsData || []);

      // Sugerir kit por coincidencia con los procedimientos de la cita.
      // Normaliza acentos además de mayúsculas — "Extracción"/"Extraccion"
      // no deben dejar de matchear solo por una tilde.
      const normalizar = (s) => (s || '').trim().toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu, '');
      const servicios = (appointment?.items || []).map(i => normalizar(i.nombre));
      const match = (kitsData || []).find(k =>
        k.servicioNombre && servicios.includes(normalizar(k.servicioNombre))
      );
      if (match) setSuggestedKit(match);
    });
    return () => { cancelled = true; };
  }, [visible, appointment]);

  const applyKit = (kit) => {
    if (!kit) return;
    const kitRows = (kit.materiales || [])
      .filter(m => m.item_id)
      .map(m => ({
        item_id: m.item_id._id || m.item_id,
        query: m.item_id.nombre || '',
        cantidad: m.cantidad
      }));
    if (!kitRows.length) {
      message.warning('El kit no tiene materiales válidos');
      return;
    }
    setRows(kitRows);
    message.success(`Kit "${kit.nombre}" aplicado — revisa y ajusta las cantidades`);
  };

  const setRow = (idx, patch) => {
    setRows(prev => prev.map((row, i) => (i === idx ? { ...row, ...patch } : row)));
  };

  const optionsFor = useMemo(() => (q) => {
    const query = (q || '').trim().toLowerCase();
    return items
      .filter(i => !query || i.nombre.toLowerCase().includes(query))
      .slice(0, 20)
      .map(i => ({
        value: i._id,
        label: `${i.nombre} — ${i.stockTotal} ${i.unidad} disponibles`
      }));
  }, [items]);

  const stockDe = (itemId) => items.find(i => i._id === itemId)?.stockTotal ?? null;

  const handleSave = async () => {
    const pendientes = rows.filter(r => !r.item_id && (r.query || '').trim());
    if (pendientes.length) {
      message.warning('Hay texto sin resolver a un material del catálogo — selecciónalo de la lista o borra la fila antes de guardar.');
      return;
    }
    const materiales = rows.filter(r => r.item_id && r.cantidad > 0);
    if (!materiales.length) {
      message.warning('Agrega al menos un material');
      return;
    }
    setSaving(true);
    try {
      const result = await consumeInventory({
        cita_id: appointment._id,
        materiales: materiales.map(r => ({ item_id: r.item_id, cantidad: r.cantidad }))
      });
      const conFaltante = (result.registrados || []).filter(r => r.faltante > 0);
      if (conFaltante.length) {
        message.warning(
          `Registrado, pero faltó stock en: ${conFaltante.map(f => `${f.nombre} (faltaron ${f.faltante})`).join(', ')}`
        , 6);
      } else {
        message.success('Materiales registrados en la cita');
      }
      if ((result.errores || []).length) {
        message.error(`Algunos materiales no se registraron: ${result.errores.map(e => e.message).join('; ')}`, 6);
      }
      onSaved?.(result);
      onClose?.();
    } catch (err) {
      message.error(err?.response?.data?.message || 'No se pudo registrar el consumo');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      title="Registrar materiales utilizados"
      open={visible}
      onCancel={onClose}
      onOk={handleSave}
      okText="Registrar consumo"
      cancelText="Cancelar"
      confirmLoading={saving}
      destroyOnClose
      width={560}
    >
      <div className="inventory-form">
        {suggestedKit && (
          <Alert
            type="info"
            showIcon
            className="inventory-consume__suggestion"
            message={
              <span>
                Esta cita incluye <strong>{suggestedKit.servicioNombre}</strong> — puedes
                prellenar con el kit &quot;{suggestedKit.nombre}&quot;.
              </span>
            }
            action={
              <Button size="small" type="primary" onClick={() => applyKit(suggestedKit)}>
                Aplicar kit
              </Button>
            }
          />
        )}

        {kits.length > 0 && (
          <label className="inventory-form__label">
            Prellenar desde un kit
            <Select
              placeholder="Elegir kit (opcional)"
              options={kits.map(k => ({ value: k._id, label: k.nombre }))}
              onChange={(kitId) => applyKit(kits.find(k => k._id === kitId))}
              style={{ width: '100%' }}
              allowClear
            />
          </label>
        )}

        <div className="inventory-form__label">Materiales</div>
        {rows.map((row, idx) => {
          const stock = stockDe(row.item_id);
          const insuficiente = stock !== null && row.cantidad > stock;
          return (
            <div key={idx}>
              <div className="inventory-form__row inventory-form__row--material">
                <AutoComplete
                  value={row.query}
                  options={optionsFor(row.query)}
                  onChange={(v) => setRow(idx, { query: v, item_id: null })}
                  onSelect={(value) => {
                    const found = items.find(i => i._id === value);
                    if (found) setRow(idx, { item_id: found._id, query: found.nombre });
                  }}
                  placeholder="Buscar material…"
                  style={{ flex: 1 }}
                />
                <InputNumber
                  value={row.cantidad}
                  onChange={v => setRow(idx, { cantidad: v ?? 1 })}
                  min={0.001}
                  max={1000000}
                  precision={items.find(i => i._id === row.item_id)?.unidad === 'pieza' ? 0 : undefined}
                  style={{ width: 90 }}
                />
                <Button
                  size="small"
                  danger
                  onClick={() => setRows(prev => prev.filter((_, i) => i !== idx))}
                >
                  ✕
                </Button>
              </div>
              {insuficiente && (
                <p className="inventory-consume__warning">
                  Stock disponible: {stock}. Se descontará lo disponible y quedará
                  registrado el faltante.
                </p>
              )}
            </div>
          );
        })}
        <Button
          size="small"
          onClick={() => setRows(prev => [...prev, { item_id: null, query: '', cantidad: 1 }])}
        >
          + Agregar material
        </Button>
      </div>
    </Modal>
  );
};

ConsumeMaterialsModal.propTypes = {
  visible: PropTypes.bool.isRequired,
  onClose: PropTypes.func.isRequired,
  appointment: PropTypes.object,
  onSaved: PropTypes.func
};

export default ConsumeMaterialsModal;
