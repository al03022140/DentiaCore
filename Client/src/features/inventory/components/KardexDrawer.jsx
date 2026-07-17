import React, { useEffect, useState } from 'react';
import PropTypes from 'prop-types';
import { Drawer, List, Tag, Spin, Empty, message } from 'antd';
import { getInventoryMovements } from '../../../shared/services/inventory-service';
import { formatDateTime } from '../../../shared/utils/formatters';

const TIPO_META = {
  entrada:   { color: 'green',   label: 'Entrada' },
  consumo:   { color: 'blue',    label: 'Consumo' },
  ajuste:    { color: 'gold',    label: 'Ajuste' },
  merma:     { color: 'volcano', label: 'Merma' },
  caducidad: { color: 'red',     label: 'Caducado' },
  reversa:   { color: 'purple',  label: 'Reversa' }
};

const signo = (mov) => {
  if (mov.tipo === 'entrada' || mov.tipo === 'reversa') return '+';
  if (mov.tipo === 'ajuste' && mov.direccion === 1) return '+';
  return '−';
};

/**
 * Kardex del ítem: bitácora inmutable de movimientos, del más reciente
 * al más antiguo, con saldo resultante por movimiento.
 */
const KardexDrawer = ({ open, onClose, item = null }) => {
  const [movements, setMovements] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open || !item?._id) return;
    let cancelled = false;
    setLoading(true);
    getInventoryMovements(item._id, { limit: 100 })
      .then(data => { if (!cancelled) setMovements(data.movements || []); })
      .catch(() => {
        if (cancelled) return;
        setMovements([]);
        message.error('No se pudo cargar el kardex');
      })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [open, item?._id]);

  return (
    <Drawer
      title={`Kardex — ${item?.nombre || ''}`}
      open={open}
      onClose={onClose}
      width={420}
    >
      {loading ? (
        <div className="inventory-kardex__loading"><Spin /></div>
      ) : movements.length === 0 ? (
        <Empty description="Sin movimientos" />
      ) : (
        <List
          dataSource={movements}
          rowKey={m => m._id}
          renderItem={(mov) => {
            const meta = TIPO_META[mov.tipo] || { color: 'default', label: mov.tipo };
            return (
              <List.Item className="inventory-kardex__row">
                <div className="inventory-kardex__main">
                  <div>
                    <Tag color={meta.color}>{meta.label}</Tag>
                    <strong>{signo(mov)}{mov.cantidad}</strong>
                    <span className="inventory-kardex__saldo"> → saldo {mov.stockResultante}</span>
                  </div>
                  <div className="inventory-kardex__meta">
                    {formatDateTime(mov.createdAt)}
                    {mov.usuario_id?.nombre ? ` · ${mov.usuario_id.nombre}` : ''}
                  </div>
                  {mov.paciente_id && (
                    <div className="inventory-kardex__meta">
                      Paciente: {[mov.paciente_id.nombre, mov.paciente_id.apellidos].filter(Boolean).join(' ')}
                    </div>
                  )}
                  {mov.motivo && <div className="inventory-kardex__motivo">{mov.motivo}</div>}
                </div>
              </List.Item>
            );
          }}
        />
      )}
    </Drawer>
  );
};

KardexDrawer.propTypes = {
  open: PropTypes.bool.isRequired,
  onClose: PropTypes.func.isRequired,
  item: PropTypes.object
};

export default KardexDrawer;
