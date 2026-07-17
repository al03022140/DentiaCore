import React, { useEffect, useMemo, useState } from 'react';
import PropTypes from 'prop-types';
import { Modal, Input, InputNumber, AutoComplete, message } from 'antd';
import { addInventoryLot, getInventoryItems } from '../../../shared/services/inventory-service';

/**
 * Entrada de stock (lote nuevo con su caducidad).
 * El buscador trabaja sobre el CATÁLOGO completo — incluidos ítems con
 * stock 0 — así reponer algo que se acabó es de dos clics (punto 3 del dueño).
 */
const LotEntryModal = ({ visible, onClose, onSaved, items = [], preselectedItem = null }) => {
  const [query, setQuery] = useState('');
  const [selectedItem, setSelectedItem] = useState(null);
  const [cantidad, setCantidad] = useState(null);
  const [caducidad, setCaducidad] = useState('');
  const [codigoLote, setCodigoLote] = useState('');
  const [saving, setSaving] = useState(false);

  const [catalog, setCatalog] = useState(null);

  useEffect(() => {
    if (!visible) return;
    let cancelled = false;
    setSelectedItem(preselectedItem || null);
    setQuery(preselectedItem ? preselectedItem.nombre : '');
    setCantidad(null);
    setCaducidad('');
    setCodigoLote('');
    // Cargar el catálogo COMPLETO: la prop `items` puede venir filtrada por
    // la búsqueda activa de la página y ocultaría ítems reponibles.
    getInventoryItems({ limit: 500 })
      .then(data => { if (!cancelled) setCatalog(data.items || []); })
      .catch(() => {
        if (cancelled) return;
        setCatalog(null);
        message.error('No se pudo cargar el catálogo completo — la búsqueda puede estar incompleta');
      });
    return () => { cancelled = true; };
  }, [visible, preselectedItem]);

  const source = catalog || items;

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    return source.filter(i => !q || i.nombre.toLowerCase().includes(q));
  }, [source, query]);

  const options = useMemo(() => matches
    .slice(0, 20)
    .map(i => ({
      value: i._id,
      label: (
        <span>
          {i.nombre}
          <span className="inventory-option__meta">
            {' '}· {i.stockTotal} {i.unidad}{i.stockTotal === 0 ? ' — sin stock' : ''}
          </span>
        </span>
      )
    })), [matches]);

  const handleSelect = (value) => {
    const found = source.find(i => i._id === value);
    if (found) {
      setSelectedItem(found);
      setQuery(found.nombre);
    }
  };

  const handleSave = async () => {
    if (!selectedItem) {
      message.warning('Selecciona un ítem del catálogo');
      return;
    }
    if (!cantidad || cantidad <= 0) {
      message.warning('Indica la cantidad que entra');
      return;
    }
    setSaving(true);
    try {
      await addInventoryLot(selectedItem._id, {
        cantidad,
        caducidad: caducidad || null,
        codigoLote: codigoLote.trim() || null
      });
      message.success(`Entrada registrada: ${cantidad} ${selectedItem.unidad} de ${selectedItem.nombre}`);
      onSaved?.();
      onClose?.();
    } catch (err) {
      message.error(err?.response?.data?.message || 'No se pudo registrar la entrada');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      title="Registrar entrada de stock"
      open={visible}
      onCancel={onClose}
      onOk={handleSave}
      okText="Registrar entrada"
      cancelText="Cancelar"
      confirmLoading={saving}
      destroyOnClose
    >
      <div className="inventory-form">
        <label className="inventory-form__label">
          Ítem *
          <AutoComplete
            value={query}
            options={options}
            onChange={(v) => { setQuery(v); setSelectedItem(null); }}
            onSelect={handleSelect}
            placeholder="Busca en el catálogo…"
            style={{ width: '100%' }}
            disabled={!!preselectedItem}
            autoFocus={!preselectedItem}
          />
        </label>
        {matches.length > 20 && (
          <p className="inventory-form__hint">
            Mostrando los primeros 20 de {matches.length} resultados — afina la búsqueda para ver más.
          </p>
        )}

        <div className="inventory-form__row">
          <label className="inventory-form__label">
            Cantidad *{selectedItem ? ` (${selectedItem.unidad})` : ''}
            <InputNumber
              value={cantidad}
              onChange={setCantidad}
              min={0}
              max={1000000}
              precision={selectedItem?.unidad === 'pieza' ? 0 : undefined}
              style={{ width: '100%' }}
            />
          </label>
          <label className="inventory-form__label">
            Caducidad del lote
            <Input
              type="date"
              value={caducidad}
              onChange={e => setCaducidad(e.target.value)}
            />
          </label>
        </div>
        {caducidad && new Date(caducidad) < new Date(new Date().toDateString()) && (
          <p className="inventory-consume__warning">Esta fecha ya pasó — el lote se registrará como caducado.</p>
        )}

        <label className="inventory-form__label">
          Código de lote
          <Input
            value={codigoLote}
            onChange={e => setCodigoLote(e.target.value)}
            maxLength={60}
            placeholder="Opcional — como viene del proveedor"
          />
        </label>

        <p className="inventory-form__hint">
          Si el insumo no caduca (p. ej. instrumental), deja la fecha vacía.
        </p>
      </div>
    </Modal>
  );
};

LotEntryModal.propTypes = {
  visible: PropTypes.bool.isRequired,
  onClose: PropTypes.func.isRequired,
  onSaved: PropTypes.func,
  items: PropTypes.array,
  preselectedItem: PropTypes.object
};

export default LotEntryModal;
