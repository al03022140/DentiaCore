import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Button, Table, Tag, Select, Tabs, Popconfirm, message, Tooltip } from 'antd';
import { useAuth } from '../../app/auth/AuthContext';
import { hasPermission } from '../../app/auth/permissions';
import {
  getInventoryItems,
  getInventoryCategories,
  getInventoryAlerts,
  deleteInventoryItem
} from '../../shared/services/inventory-service';
import ItemFormModal from './components/ItemFormModal';
import LotEntryModal from './components/LotEntryModal';
import AdjustModal from './components/AdjustModal';
import KardexDrawer from './components/KardexDrawer';
import KitsPanel from './components/KitsPanel';
import { formatDateEs } from '../../shared/utils/formatters';
import './styles/inventory-page.css';

const EXPIRY_WARN_DAYS = 30;

/**
 * Página de Inventario.
 * - Catálogo persistente: los ítems se quedan aunque el stock llegue a 0
 *   (reponer = "Entrada" sobre el mismo ítem).
 * - Alertas: caducados, por caducar (30 días) y stock bajo.
 * - Kardex por ítem y pestaña de Kits de procedimiento.
 */
const InventoryPage = () => {
  const { user } = useAuth();
  const permissions = user?.permissions || [];
  const canManage = hasPermission(permissions, ['inventory.manage']);

  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [alerts, setAlerts] = useState(null);
  const [categorias, setCategorias] = useState([]);

  // Filtros
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [categoria, setCategoria] = useState(null);
  const [estado, setEstado] = useState(null);
  const debounceTimer = useRef(null);

  // Modales
  const [showItemForm, setShowItemForm] = useState(false);
  const [editingItem, setEditingItem] = useState(null);
  const [showLotEntry, setShowLotEntry] = useState(false);
  const [lotEntryItem, setLotEntryItem] = useState(null);
  const [adjustItem, setAdjustItem] = useState(null);
  const [kardexItem, setKardexItem] = useState(null);

  // Secuencia de la última petición: si dos loadItems se solapan (filtro
  // rápido + refreshAll casi simultáneo), solo la más reciente escribe
  // estado — evita que una respuesta vieja pise a una más nueva.
  const loadSeq = useRef(0);
  const loadItems = useCallback(async () => {
    const seq = ++loadSeq.current;
    setLoading(true);
    try {
      const params = { includeInactive: 'true', days: EXPIRY_WARN_DAYS };
      if (debouncedSearch.trim()) params.q = debouncedSearch.trim();
      if (categoria) params.categoria = categoria;
      if (estado) params.estado = estado;
      const data = await getInventoryItems(params);
      if (seq !== loadSeq.current) return;
      setItems(data.items || []);
    } catch (err) {
      if (seq !== loadSeq.current) return;
      message.error(err?.response?.data?.message || 'No se pudo cargar el inventario');
    } finally {
      if (seq === loadSeq.current) setLoading(false);
    }
  }, [debouncedSearch, categoria, estado]);

  const loadAlerts = useCallback(async () => {
    try {
      setAlerts(await getInventoryAlerts(EXPIRY_WARN_DAYS));
    } catch {
      setAlerts(null);
    }
  }, []);

  const refreshAll = useCallback(() => {
    loadItems();
    loadAlerts();
  }, [loadItems, loadAlerts]);

  useEffect(() => { loadItems(); }, [loadItems]);
  useEffect(() => {
    loadAlerts();
    getInventoryCategories().then(setCategorias).catch(() => setCategorias([]));
  }, [loadAlerts]);

  // Debounce de búsqueda (300 ms)
  useEffect(() => {
    if (debounceTimer.current) clearTimeout(debounceTimer.current);
    debounceTimer.current = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(debounceTimer.current);
  }, [search]);

  const handleDelete = async (item) => {
    try {
      await deleteInventoryItem(item._id, 'Eliminado desde la página de inventario');
      message.success(`"${item.nombre}" eliminado del catálogo`);
      refreshAll();
    } catch (err) {
      message.error(err?.response?.data?.message || 'No se pudo eliminar');
    }
  };

  const renderEstado = (view) => {
    const tags = [];
    if (!view.activo) tags.push(<Tag key="inactivo">Inactivo</Tag>);
    if (view.alertas.caducado) tags.push(<Tag color="red" key="cad">Caducado</Tag>);
    else if (view.alertas.porCaducar) tags.push(<Tag color="orange" key="pc">Por caducar</Tag>);
    if (view.alertas.sinStock) tags.push(<Tag color="volcano" key="ss">Sin stock</Tag>);
    else if (view.alertas.stockBajo) tags.push(<Tag color="gold" key="sb">Stock bajo</Tag>);
    if (!tags.length) tags.push(<Tag color="green" key="ok">OK</Tag>);
    return <>{tags}</>;
  };

  const columns = [
    {
      title: 'Ítem',
      dataIndex: 'nombre',
      key: 'nombre',
      sorter: (a, b) => a.nombre.localeCompare(b.nombre),
      render: (v, r) => (
        <div>
          <div className="inventory-item__name">{v}</div>
          <div className="inventory-item__category">{r.categoria}</div>
        </div>
      )
    },
    {
      title: 'Stock',
      dataIndex: 'stockTotal',
      key: 'stockTotal',
      align: 'center',
      className: 'inventory-col-nodivider',
      sorter: (a, b) => a.stockTotal - b.stockTotal,
      render: v => (
        <span className={v === 0 ? 'inventory-stock--zero' : ''}>{v}</span>
      )
    },
    {
      title: 'Unidad',
      dataIndex: 'unidad',
      key: 'unidad',
      render: v => <span className="inventory-muted">{v}</span>
    },
    {
      title: 'Mínimo',
      dataIndex: 'stockMinimo',
      key: 'stockMinimo',
      align: 'center',
      responsive: ['md'],
      render: v => v || <span className="inventory-muted">—</span>
    },
    {
      title: 'Próxima caducidad',
      dataIndex: 'proximaCaducidad',
      key: 'proximaCaducidad',
      align: 'center',
      responsive: ['md'],
      sorter: (a, b) => {
        if (!a.proximaCaducidad && !b.proximaCaducidad) return 0;
        if (!a.proximaCaducidad) return 1;
        if (!b.proximaCaducidad) return -1;
        return new Date(a.proximaCaducidad) - new Date(b.proximaCaducidad);
      },
      render: v => v ? formatDateEs(v) : <span className="inventory-muted">No caduca</span>
    },
    {
      title: 'Estado',
      key: 'estado',
      align: 'center',
      className: 'inventory-col-nodivider',
      render: (_, r) => renderEstado(r)
    },
    {
      title: '',
      key: 'acciones',
      width: canManage ? 240 : 90,
      render: (_, r) => (
        <span className="inventory-row-actions">
          {canManage && (
            <Tooltip title="Registrar entrada de stock">
              <Button size="small" type="primary" ghost onClick={() => { setLotEntryItem(r); setShowLotEntry(true); }}>
                Entrada
              </Button>
            </Tooltip>
          )}
          {canManage && (
            <Button size="small" onClick={() => setAdjustItem(r)}>Ajustar</Button>
          )}
          <Button size="small" onClick={() => setKardexItem(r)}>Kardex</Button>
          {canManage && (
            <>
              <Button size="small" onClick={() => { setEditingItem(r); setShowItemForm(true); }}>Editar</Button>
              <Popconfirm
                title={`¿Eliminar "${r.nombre}" del catálogo?`}
                description="Se conserva su kardex, pero dejará de aparecer."
                okText="Eliminar"
                cancelText="Cancelar"
                onConfirm={() => handleDelete(r)}
              >
                <Button size="small" danger>✕</Button>
              </Popconfirm>
            </>
          )}
        </span>
      )
    }
  ];

  const alertCards = alerts && (
    <div className="inventory-alerts">
      <button
        type="button"
        className={`inventory-alerts__card inventory-alerts__card--red ${estado === 'caducado' ? 'is-active' : ''}`}
        onClick={() => setEstado(estado === 'caducado' ? null : 'caducado')}
      >
        <span className="inventory-alerts__count">{alerts.caducados.length}</span>
        <span>Lotes caducados</span>
      </button>
      <button
        type="button"
        className={`inventory-alerts__card inventory-alerts__card--orange ${estado === 'porCaducar' ? 'is-active' : ''}`}
        onClick={() => setEstado(estado === 'porCaducar' ? null : 'porCaducar')}
      >
        <span className="inventory-alerts__count">{alerts.porCaducar.length}</span>
        <span>Por caducar (≤{alerts.days} días)</span>
      </button>
      <button
        type="button"
        className={`inventory-alerts__card inventory-alerts__card--gold ${estado === 'stockBajo' ? 'is-active' : ''}`}
        onClick={() => setEstado(estado === 'stockBajo' ? null : 'stockBajo')}
      >
        <span className="inventory-alerts__count">{alerts.stockBajo.length}</span>
        <span>Stock bajo</span>
      </button>
      <button
        type="button"
        className={`inventory-alerts__card ${estado === 'sinStock' ? 'is-active' : ''}`}
        onClick={() => setEstado(estado === 'sinStock' ? null : 'sinStock')}
      >
        <span className="inventory-alerts__count">{alerts.sinStock.length}</span>
        <span>Sin stock</span>
      </button>
    </div>
  );

  const inventarioTab = (
    <>
      {/* Búsqueda centrada tipo píldora — mismo patrón que la lista de pacientes */}
      <div className="inventory-search-container">
        <input
          type="text"
          placeholder="Buscar ítem..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="inventory-search-input"
          aria-label="Buscar ítem"
        />
      </div>

      {/* Fila de acciones: primaria a la derecha, filtro a la izquierda (como pacientes) */}
      <div className="inventory-actions">
        {canManage && (
          <div className="inventory-actions__buttons">
            <button
              type="button"
              className="button-secondary"
              onClick={() => { setLotEntryItem(null); setShowLotEntry(true); }}
            >
              Registrar entrada
            </button>
            <button
              type="button"
              className="button-primary"
              onClick={() => { setEditingItem(null); setShowItemForm(true); }}
            >
              + Nuevo ítem
            </button>
          </div>
        )}
        <Select
          placeholder="Categoría"
          value={categoria}
          onChange={setCategoria}
          options={categorias.map(c => ({ value: c, label: c }))}
          allowClear
          className="inventory-category-select"
        />
      </div>

      {alertCards}

      <Table
        dataSource={items}
        columns={columns}
        rowKey="_id"
        loading={loading}
        size="middle"
        pagination={{ pageSize: 20, hideOnSinglePage: true }}
        locale={{ emptyText: (search.trim() || categoria || estado)
          ? 'Sin resultados para el filtro actual'
          : 'Sin ítems — agrega el primero con "Nuevo ítem"' }}
      />
    </>
  );

  return (
    <div className="inventory-page">
      <section className="inventory-page__card">
        <Tabs
          defaultActiveKey="inventario"
          items={[
            { key: 'inventario', label: 'Inventario', children: inventarioTab },
            { key: 'kits', label: 'Kits de procedimiento', children: <KitsPanel items={items} canManage={canManage} /> }
          ]}
        />
      </section>

      <ItemFormModal
        visible={showItemForm}
        onClose={() => setShowItemForm(false)}
        onSaved={refreshAll}
        item={editingItem}
        categorias={categorias}
      />
      <LotEntryModal
        visible={showLotEntry}
        onClose={() => setShowLotEntry(false)}
        onSaved={refreshAll}
        items={items}
        preselectedItem={lotEntryItem}
      />
      <AdjustModal
        visible={!!adjustItem}
        onClose={() => setAdjustItem(null)}
        onSaved={refreshAll}
        item={adjustItem}
      />
      <KardexDrawer
        open={!!kardexItem}
        onClose={() => setKardexItem(null)}
        item={kardexItem}
      />
    </div>
  );
};

export default InventoryPage;
