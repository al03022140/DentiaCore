import React, { useCallback, useEffect, useMemo, useState } from 'react';
import PropTypes from 'prop-types';
import { Button, Table, Tag, Modal, Input, InputNumber, AutoComplete, message, Popconfirm } from 'antd';
import {
  getInventoryItems,
  getInventoryKits,
  createInventoryKit,
  updateInventoryKit,
  deleteInventoryKit
} from '../../../shared/services/inventory-service';
import { getSettings } from '../../../shared/services/settingsService';

/**
 * Kits de procedimiento: plantilla de materiales que se SUGIERE al registrar
 * consumo en una cita cuyo procedimiento coincide con `servicioNombre`.
 */
const KitsPanel = ({ items = [], canManage = false }) => {
  const [kits, setKits] = useState([]);
  const [catalog, setCatalog] = useState(null);
  const [loading, setLoading] = useState(false);
  const [serviceCatalog, setServiceCatalog] = useState([]);

  // Modal form
  const [showForm, setShowForm] = useState(false);
  const [editingKit, setEditingKit] = useState(null);
  const [nombre, setNombre] = useState('');
  const [servicioNombre, setServicioNombre] = useState('');
  const [materiales, setMateriales] = useState([]);
  const [saving, setSaving] = useState(false);

  const loadKits = useCallback(async () => {
    setLoading(true);
    try {
      const data = await getInventoryKits({ includeInactive: 'true' });
      setKits(data);
    } catch {
      message.error('No se pudieron cargar los kits');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadKits();
    getSettings()
      .then(s => setServiceCatalog(s.serviceCatalog || []))
      .catch(() => setServiceCatalog([]));
    // Catálogo COMPLETO para el buscador de materiales (la prop `items`
    // puede venir filtrada por la búsqueda de la pestaña Inventario).
    getInventoryItems({ limit: 500 })
      .then(data => setCatalog(data.items || []))
      .catch(() => setCatalog(null));
  }, [loadKits]);

  const source = catalog || items;

  const openCreate = () => {
    setEditingKit(null);
    setNombre('');
    setServicioNombre('');
    setMateriales([{ item_id: null, query: '', cantidad: 1 }]);
    setShowForm(true);
  };

  const openEdit = (kit) => {
    setEditingKit(kit);
    setNombre(kit.nombre);
    setServicioNombre(kit.servicioNombre || '');
    setMateriales((kit.materiales || []).map(m => ({
      item_id: m.item_id?._id || m.item_id,
      query: m.item_id?.nombre || '',
      cantidad: m.cantidad
    })));
    setShowForm(true);
  };

  const itemOptions = useMemo(() => (q) => {
    const query = (q || '').trim().toLowerCase();
    return source
      .filter(i => !query || i.nombre.toLowerCase().includes(query))
      .slice(0, 20)
      .map(i => ({ value: i._id, label: `${i.nombre} (${i.unidad})` }));
  }, [source]);

  const setMaterialRow = (idx, patch) => {
    setMateriales(prev => prev.map((row, i) => (i === idx ? { ...row, ...patch } : row)));
  };

  const handleSave = async () => {
    if (!nombre.trim()) {
      message.warning('El nombre del kit es obligatorio');
      return;
    }
    const pendientes = materiales.filter(m => !m.item_id && (m.query || '').trim());
    if (pendientes.length) {
      message.warning('Hay texto sin resolver a un material del catálogo — selecciónalo de la lista o borra la fila antes de guardar.');
      return;
    }
    const cleaned = materiales.filter(m => m.item_id && m.cantidad > 0);
    if (!cleaned.length) {
      message.warning('Agrega al menos un material');
      return;
    }
    setSaving(true);
    try {
      const payload = {
        nombre: nombre.trim(),
        servicioNombre: servicioNombre.trim() || null,
        materiales: cleaned.map(m => ({ item_id: m.item_id, cantidad: m.cantidad }))
      };
      if (editingKit) {
        await updateInventoryKit(editingKit._id, payload);
        message.success('Kit actualizado');
      } else {
        await createInventoryKit(payload);
        message.success('Kit creado');
      }
      setShowForm(false);
      loadKits();
    } catch (err) {
      message.error(err?.response?.data?.message || 'No se pudo guardar el kit');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (kit) => {
    try {
      await deleteInventoryKit(kit._id);
      message.success('Kit eliminado');
      loadKits();
    } catch (err) {
      message.error(err?.response?.data?.message || 'No se pudo eliminar el kit');
    }
  };

  const columns = [
    { title: 'Kit', dataIndex: 'nombre', key: 'nombre' },
    {
      title: 'Procedimiento asociado',
      dataIndex: 'servicioNombre',
      key: 'servicioNombre',
      render: v => v || <span className="inventory-muted">— genérico —</span>
    },
    {
      title: 'Materiales',
      key: 'materiales',
      render: (_, kit) => (
        <div className="inventory-kit-materials">
          {(kit.materiales || []).map((m, i) => (
            <Tag key={i}>
              {m.item_id?.nombre || 'Ítem eliminado'} × {m.cantidad}
            </Tag>
          ))}
        </div>
      )
    },
    ...(canManage ? [{
      title: '',
      key: 'acciones',
      width: 160,
      render: (_, kit) => (
        <span className="inventory-row-actions">
          <Button size="small" onClick={() => openEdit(kit)}>Editar</Button>
          <Popconfirm
            title="¿Eliminar este kit?"
            okText="Eliminar"
            cancelText="Cancelar"
            onConfirm={() => handleDelete(kit)}
          >
            <Button size="small" danger>Eliminar</Button>
          </Popconfirm>
        </span>
      )
    }] : [])
  ];

  return (
    <div className="inventory-kits">
      <div className="inventory-kits__header">
        <p className="inventory-kits__hint">
          Un kit sugiere los materiales de un procedimiento al registrar el consumo de una
          cita — el usuario siempre confirma y ajusta antes de descontar.
        </p>
        {canManage && (
          <Button type="primary" onClick={openCreate}>Nuevo kit</Button>
        )}
      </div>

      <Table
        dataSource={kits}
        columns={columns}
        rowKey="_id"
        loading={loading}
        size="middle"
        pagination={false}
        locale={{ emptyText: 'Sin kits — crea el primero para agilizar el registro de materiales' }}
      />

      <Modal
        title={editingKit ? `Editar kit — ${editingKit.nombre}` : 'Nuevo kit'}
        open={showForm}
        onCancel={() => setShowForm(false)}
        onOk={handleSave}
        okText="Guardar"
        cancelText="Cancelar"
        confirmLoading={saving}
        destroyOnClose
      >
        <div className="inventory-form">
          <label className="inventory-form__label">
            Nombre del kit *
            <Input
              value={nombre}
              onChange={e => setNombre(e.target.value)}
              placeholder="Ej. Kit de extracción simple"
              maxLength={120}
            />
          </label>

          <label className="inventory-form__label">
            Procedimiento del catálogo de servicios (opcional)
            <AutoComplete
              value={servicioNombre}
              onChange={setServicioNombre}
              options={serviceCatalog.map(s => ({ value: s.nombre }))}
              placeholder="Ej. Extracción"
              filterOption={(input, option) =>
                option.value.toLowerCase().includes(input.toLowerCase())
              }
              style={{ width: '100%' }}
            />
          </label>

          <div className="inventory-form__label">Materiales *</div>
          {materiales.map((row, idx) => (
            <div className="inventory-form__row inventory-form__row--material" key={idx}>
              <AutoComplete
                value={row.query}
                options={itemOptions(row.query)}
                onChange={(v) => setMaterialRow(idx, { query: v, item_id: null })}
                onSelect={(value) => {
                  const found = source.find(i => i._id === value);
                  if (found) setMaterialRow(idx, { item_id: found._id, query: found.nombre });
                }}
                placeholder="Buscar material…"
                style={{ flex: 1 }}
              />
              <InputNumber
                value={row.cantidad}
                onChange={v => setMaterialRow(idx, { cantidad: v ?? 1 })}
                min={1}
                max={1000000}
                precision={source.find(i => i._id === row.item_id)?.unidad === 'pieza' ? 0 : undefined}
                style={{ width: 90 }}
              />
              <Button
                size="small"
                danger
                onClick={() => setMateriales(prev => prev.filter((_, i) => i !== idx))}
              >
                ✕
              </Button>
            </div>
          ))}
          <Button
            size="small"
            onClick={() => setMateriales(prev => [...prev, { item_id: null, query: '', cantidad: 1 }])}
          >
            + Agregar material
          </Button>
        </div>
      </Modal>
    </div>
  );
};

KitsPanel.propTypes = {
  items: PropTypes.array,
  canManage: PropTypes.bool
};

export default KitsPanel;
