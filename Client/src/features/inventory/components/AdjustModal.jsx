import React, { useEffect, useState } from 'react';
import PropTypes from 'prop-types';
import { Modal, Input, InputNumber, Radio, message } from 'antd';
import { adjustInventoryStock } from '../../../shared/services/inventory-service';

/**
 * Ajuste de stock con motivo obligatorio (queda en el kardex y en el
 * audit trail). Merma y caducidad siempre restan; ajuste puede sumar
 * (conteo físico encontró más) o restar.
 */
const AdjustModal = ({ visible, onClose, onSaved, item = null }) => {
  const [tipo, setTipo] = useState('ajuste');
  const [direccion, setDireccion] = useState(-1);
  const [cantidad, setCantidad] = useState(null);
  const [motivo, setMotivo] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!visible) return;
    setTipo('ajuste');
    setDireccion(-1);
    setCantidad(null);
    setMotivo('');
  }, [visible]);

  const handleSave = async () => {
    if (!cantidad || cantidad <= 0) {
      message.warning('Indica la cantidad');
      return;
    }
    if (motivo.trim().length < 3) {
      message.warning('El motivo es obligatorio (≥3 caracteres)');
      return;
    }
    setSaving(true);
    try {
      const result = await adjustInventoryStock(item._id, {
        tipo,
        direccion: tipo === 'ajuste' ? direccion : -1,
        cantidad,
        motivo: motivo.trim()
      });
      if (result?.faltante > 0) {
        message.warning(
          `Se aplicó parcialmente — solo había ${cantidad - result.faltante} ${item.unidad} disponibles (faltaron ${result.faltante}).`,
          6
        );
      } else {
        message.success('Movimiento registrado');
      }
      onSaved?.();
      onClose?.();
    } catch (err) {
      message.error(err?.response?.data?.message || 'No se pudo registrar el ajuste');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      title={`Ajustar stock — ${item?.nombre || ''}`}
      open={visible}
      onCancel={onClose}
      onOk={handleSave}
      okText="Registrar"
      cancelText="Cancelar"
      confirmLoading={saving}
      destroyOnClose
    >
      <div className="inventory-form">
        <label className="inventory-form__label">
          Tipo de movimiento
          <Radio.Group
            value={tipo}
            onChange={e => setTipo(e.target.value)}
            optionType="button"
            buttonStyle="solid"
          >
            <Radio.Button value="ajuste">Ajuste</Radio.Button>
            <Radio.Button value="merma">Merma</Radio.Button>
            <Radio.Button value="caducidad">Caducado</Radio.Button>
          </Radio.Group>
        </label>

        {tipo === 'ajuste' && (
          <label className="inventory-form__label">
            Dirección
            <Radio.Group value={direccion} onChange={e => setDireccion(e.target.value)}>
              <Radio value={-1}>Restar</Radio>
              <Radio value={1}>Sumar</Radio>
            </Radio.Group>
          </label>
        )}

        <label className="inventory-form__label">
          Cantidad *{item ? ` (${item.unidad} — stock actual: ${item.stockTotal})` : ''}
          <InputNumber
            value={cantidad}
            onChange={setCantidad}
            min={0}
            max={1000000}
            precision={item?.unidad === 'pieza' ? 0 : undefined}
            disabled={saving}
            style={{ width: '100%' }}
            autoFocus
          />
        </label>

        <label className="inventory-form__label">
          Motivo *
          <Input.TextArea
            value={motivo}
            onChange={e => setMotivo(e.target.value)}
            rows={2}
            maxLength={500}
            disabled={saving}
            placeholder="Ej. conteo físico, envase dañado, lote vencido…"
          />
        </label>
      </div>
    </Modal>
  );
};

AdjustModal.propTypes = {
  visible: PropTypes.bool.isRequired,
  onClose: PropTypes.func.isRequired,
  onSaved: PropTypes.func,
  item: PropTypes.object
};

export default AdjustModal;
