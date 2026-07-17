import API from './axios-instance';

/**
 * inventory-service — cliente del módulo de Inventario (/api/inventory).
 * Diseño: docs-locales/DISENO_MODULO_INVENTARIO_2026-07-16.md
 */

// ── Catálogo ────────────────────────────────────────────────────
export const getInventoryItems = async (params = {}) => {
  const { data } = await API.get('/inventory/items', { params });
  return data;
};

export const getInventoryCategories = async () => {
  const { data } = await API.get('/inventory/categories');
  return data.categorias || [];
};

export const createInventoryItem = async (payload) => {
  const { data } = await API.post('/inventory/items', payload);
  return data;
};

export const updateInventoryItem = async (id, payload) => {
  const { data } = await API.put(`/inventory/items/${id}`, payload);
  return data;
};

export const deleteInventoryItem = async (id, motivo) => {
  const { data } = await API.delete(`/inventory/items/${id}`, { data: { motivo } });
  return data;
};

// ── Stock ───────────────────────────────────────────────────────
export const addInventoryLot = async (itemId, payload) => {
  const { data } = await API.post(`/inventory/items/${itemId}/lots`, payload);
  return data;
};

export const adjustInventoryStock = async (itemId, payload) => {
  const { data } = await API.post(`/inventory/items/${itemId}/adjust`, payload);
  return data;
};

export const getInventoryMovements = async (itemId, params = {}) => {
  const { data } = await API.get(`/inventory/items/${itemId}/movements`, { params });
  return data;
};

// ── Alertas ─────────────────────────────────────────────────────
export const getInventoryAlerts = async (days = 30) => {
  const { data } = await API.get('/inventory/alerts', { params: { days } });
  return data;
};

// ── Consumo en cita ─────────────────────────────────────────────
export const consumeInventory = async ({ cita_id, materiales }) => {
  const { data } = await API.post('/inventory/consume', { cita_id, materiales });
  return data;
};

export const revertInventoryConsume = async ({ cita_id, material_id, motivo }) => {
  const { data } = await API.post('/inventory/consume/revert', { cita_id, material_id, motivo });
  return data;
};

// ── Kits ────────────────────────────────────────────────────────
export const getInventoryKits = async (params = {}) => {
  const { data } = await API.get('/inventory/kits', { params });
  return data.kits || [];
};

export const createInventoryKit = async (payload) => {
  const { data } = await API.post('/inventory/kits', payload);
  return data;
};

export const updateInventoryKit = async (id, payload) => {
  const { data } = await API.put(`/inventory/kits/${id}`, payload);
  return data;
};

export const deleteInventoryKit = async (id) => {
  const { data } = await API.delete(`/inventory/kits/${id}`);
  return data;
};
