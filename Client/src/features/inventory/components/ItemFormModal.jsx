import React, { useEffect, useState } from 'react';
import PropTypes from 'prop-types';
import { Modal, Input, InputNumber, AutoComplete, Switch, message } from 'antd';
import { createInventoryItem, updateInventoryItem } from '../../../shared/services/inventory-service';

/* Sugerencias de unidad de conteo; el campo sigue aceptando texto libre */
const UNIDADES_COMUNES = [
  'pieza', 'jeringa', 'cartucho', 'ampolleta', 'caja', 'frasco',
  'tubo', 'sobre', 'par', 'rollo', 'ml', 'g'
];

/**
 * Alta/edición de un ítem del catálogo.
 * En alta permite capturar un stock inicial (lote) en el mismo paso.
 */
const ItemFormModal = ({ visible, onClose, onSaved, item = null, categorias = [] }) => {
  const isEditing = !!item;

  const [nombre, setNombre] = useState('');
  const [categoria, setCategoria] = useState('');
  const [unidad, setUnidad] = useState('pieza');
  const [descripcion, setDescripcion] = useState('');
  const [stockMinimo, setStockMinimo] = useState(0);
  const [activo, setActivo] = useState(true);
  // Stock inicial (solo alta)
  const [cantidadInicial, setCantidadInicial] = useState(null);
  const [caducidadInicial, setCaducidadInicial] = useState('');
  const [codigoLoteInicial, setCodigoLoteInicial] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!visible) return;
    setNombre(item?.nombre || '');
    setCategoria(item?.categoria || '');
    setUnidad(item?.unidad || 'pieza');
    setDescripcion(item?.descripcion || '');
    setStockMinimo(item?.stockMinimo ?? 0);
    setActivo(item?.activo ?? true);
    setCantidadInicial(null);
    setCaducidadInicial('');
    setCodigoLoteInicial('');
  }, [visible, item]);

  const handleSave = async () => {
    if (!nombre.trim()) {
      message.warning('El nombre es obligatorio');
      return;
    }
    if (!isEditing && (caducidadInicial || codigoLoteInicial.trim()) && !(cantidadInicial > 0)) {
      message.warning('Indica la cantidad del stock inicial (o borra la caducidad/código de lote si no vas a capturar stock ahora)');
      return;
    }
    setSaving(true);
    try {
      if (isEditing) {
        // Solo se manda lo que el usuario realmente tocó en esta sesión del
        // modal — así una edición concurrente de otro usuario (p. ej. quien
        // desactiva el ítem) no se pisa en silencio al reenviar un snapshot
        // desactualizado del resto de los campos.
        const payload = {};
        if (nombre.trim() !== item.nombre) payload.nombre = nombre.trim();
        if (categoria.trim() !== (item.categoria || '')) payload.categoria = categoria.trim() || 'Otro';
        if (unidad.trim() !== (item.unidad || '')) payload.unidad = unidad.trim() || 'pieza';
        if (descripcion.trim() !== (item.descripcion || '')) payload.descripcion = descripcion.trim();
        if ((stockMinimo || 0) !== (item.stockMinimo ?? 0)) payload.stockMinimo = stockMinimo || 0;
        if (activo !== (item.activo ?? true)) payload.activo = activo;
        if (Object.keys(payload).length === 0) {
          onClose?.();
          return;
        }
        await updateInventoryItem(item._id, payload);
        message.success('Ítem actualizado');
      } else {
        const payload = {
          nombre: nombre.trim(),
          categoria: categoria.trim() || 'Otro',
          unidad: unidad.trim() || 'pieza',
          descripcion: descripcion.trim(),
          stockMinimo: stockMinimo || 0
        };
        if (cantidadInicial > 0) {
          payload.loteInicial = {
            cantidad: cantidadInicial,
            caducidad: caducidadInicial || null,
            codigoLote: codigoLoteInicial.trim() || null
          };
        }
        await createInventoryItem(payload);
        message.success('Ítem agregado al catálogo');
      }
      onSaved?.();
      onClose?.();
    } catch (err) {
      message.error(err?.response?.data?.message || 'No se pudo guardar el ítem');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      title={isEditing ? `Editar ítem — ${item?.nombre}` : 'Nuevo ítem de inventario'}
      open={visible}
      onCancel={onClose}
      onOk={handleSave}
      okText={isEditing ? 'Guardar cambios' : 'Agregar'}
      cancelText="Cancelar"
      confirmLoading={saving}
      destroyOnClose
    >
      <div className="inventory-form">
        <label className="inventory-form__label">
          Nombre *
          <Input
            value={nombre}
            onChange={e => setNombre(e.target.value)}
            placeholder="Ej. Anestesia lidocaína 2%"
            maxLength={120}
            autoFocus
          />
        </label>

        <div className="inventory-form__row">
          <label className="inventory-form__label">
            Categoría
            <AutoComplete
              value={categoria}
              onChange={setCategoria}
              options={categorias.map(c => ({ value: c }))}
              placeholder="Ej. Anestesia"
              filterOption={(input, option) =>
                option.value.toLowerCase().includes(input.toLowerCase())
              }
              maxLength={60}
              style={{ width: '100%' }}
            />
          </label>
          <label className="inventory-form__label">
            Unidad
            <AutoComplete
              value={unidad}
              onChange={setUnidad}
              options={UNIDADES_COMUNES.map(u => ({ value: u }))}
              filterOption={(input, option) =>
                option.value.toLowerCase().includes(input.toLowerCase())
              }
              placeholder="pieza, cartucho, caja, ml…"
              maxLength={30}
              style={{ width: '100%' }}
            />
          </label>
        </div>

        <label className="inventory-form__label">
          Descripción
          <Input.TextArea
            value={descripcion}
            onChange={e => setDescripcion(e.target.value)}
            rows={2}
            maxLength={500}
          />
        </label>

        <div className="inventory-form__row">
          <label className="inventory-form__label">
            Stock mínimo (alerta)
            <InputNumber
              value={stockMinimo}
              onChange={v => setStockMinimo(v ?? 0)}
              min={0}
              style={{ width: '100%' }}
            />
          </label>
          {isEditing && (
            <label className="inventory-form__label inventory-form__label--switch">
              Activo
              <Switch checked={activo} onChange={setActivo} />
            </label>
          )}
        </div>

        {!isEditing && (
          <fieldset className="inventory-form__fieldset">
            <legend>Stock inicial (opcional)</legend>
            <div className="inventory-form__row">
              <label className="inventory-form__label">
                Cantidad
                <InputNumber
                  value={cantidadInicial}
                  onChange={setCantidadInicial}
                  min={0}
                  max={1000000}
                  style={{ width: '100%' }}
                />
              </label>
              <label className="inventory-form__label">
                Caducidad
                <Input
                  type="date"
                  value={caducidadInicial}
                  onChange={e => setCaducidadInicial(e.target.value)}
                />
              </label>
            </div>
            <label className="inventory-form__label">
              Código de lote
              <Input
                value={codigoLoteInicial}
                onChange={e => setCodigoLoteInicial(e.target.value)}
                maxLength={60}
                placeholder="Opcional"
              />
            </label>
          </fieldset>
        )}
      </div>
    </Modal>
  );
};

ItemFormModal.propTypes = {
  visible: PropTypes.bool.isRequired,
  onClose: PropTypes.func.isRequired,
  onSaved: PropTypes.func,
  item: PropTypes.object,
  categorias: PropTypes.arrayOf(PropTypes.string)
};

export default ItemFormModal;
