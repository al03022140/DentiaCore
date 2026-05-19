import API from './axios-instance';

// Cache para configuración (3 min) — usada en varios modales y secciones
const SETTINGS_CACHE_TTL_MS = 3 * 60 * 1000;
let settingsCache = { data: null, ts: 0 };

export const invalidateSettingsCache = () => {
  settingsCache = { data: null, ts: 0 };
};

// ── Clinic Settings ──────────────────────────────────────────

export const getSettings = async (options = {}) => {
  const { skipCache = false } = options;
  const now = Date.now();
  if (!skipCache && settingsCache.data !== null && now - settingsCache.ts < SETTINGS_CACHE_TTL_MS) {
    return settingsCache.data;
  }
  const { data } = await API.get('/settings');
  settingsCache = { data, ts: now };
  return data;
};

export const updateSettings = async (updates) => {
  const { data } = await API.patch('/settings', updates);
  invalidateSettingsCache();
  return data;
};

// ── Role Permissions ─────────────────────────────────────────

export const getRolePermissions = async () => {
  const { data } = await API.get('/settings/role-permissions');
  return data;
};

export const updateRolePermissions = async (role, permissions) => {
  const { data } = await API.patch(`/settings/role-permissions/${encodeURIComponent(role)}`, { permissions });
  return data;
};

// ── User Permission Overrides ────────────────────────────────

export const updateUserPermissions = async (userId, permissions) => {
  const { data } = await API.patch(`/settings/user-permissions/${encodeURIComponent(userId)}`, { permissions });
  return data;
};

// ── Current User — Profile ───────────────────────────────────

export const updateMyProfile = async (updates) => {
  const { data } = await API.patch('/settings/me/profile', updates);
  return data;
};

export const updateMyPreferences = async (updates) => {
  const { data } = await API.patch('/settings/me/preferences', updates);
  return data;
};

export const changeMyPassword = async (currentPassword, newPassword) => {
  const { data } = await API.patch('/settings/me/password', { currentPassword, newPassword });
  return data;
};

export const changeMyPin = async (pin) => {
  const { data } = await API.patch('/settings/me/pin', { pin });
  return data;
};

// ── Current User — Professional Profile ──────────────────────

export const updateProfessionalProfile = async (updates) => {
  const { data } = await API.patch('/settings/me/professional-profile', updates);
  return data;
};

export const uploadFirma = async (file) => {
  const formData = new FormData();
  formData.append('firma', file);
  const { data } = await API.post('/settings/me/firma', formData);
  return data;
};

export const deleteFirma = async () => {
  const { data } = await API.delete('/settings/me/firma');
  return data;
};

// `version` opcional fuerza cache-bust al `<img>` cuando la firma se acaba
// de subir o reemplazar (el endpoint sirve siempre desde la misma URL).
export const getFirmaUrl = (userId, version) => {
  const base = `${API.defaults.baseURL}/settings/users/${encodeURIComponent(userId)}/firma`;
  return version ? `${base}?v=${encodeURIComponent(version)}` : base;
};

// ── Users list (for Accounts & Permissions) ──────────────────

export const getUsers = async () => {
  const { data } = await API.get('/users');
  return data;
};

// Lista liviana de doctores — accesible a cualquier usuario autenticado.
// La usa el asistente para pedirle la firma al doctor al crear notas.
export const getDoctors = async () => {
  const { data } = await API.get('/users/doctors');
  return Array.isArray(data) ? data : [];
};

// ── User CRUD (Cuentas y Permisos → Gestionar cuentas) ───────
// El backend ya valida jerarquía de roles + uniqueness de email + fuerza
// de password. Aquí solo enviamos el payload mínimo necesario.

export const createUser = async (payload) => {
  // payload: { nombre, email, contraseña, pin, rol, active? }
  const { data } = await API.post('/users', payload);
  return data;
};

export const updateUser = async (userId, payload) => {
  // payload puede incluir: { nombre?, email?, rol?, contraseña?, active? }
  // Cambiar contraseña invalida la sesión activa del usuario afectado.
  const { data } = await API.put(`/users/${encodeURIComponent(userId)}`, payload);
  return data;
};

export const disableUser = async (userId) => {
  const { data } = await API.patch(`/users/${encodeURIComponent(userId)}/disable`);
  return data;
};

// No hay endpoint "enable" dedicado: se reusa PUT con { active: true }.
export const enableUser = (userId) => updateUser(userId, { active: true });

// ── Clinic Logo ──────────────────────────────────────────────

export const uploadLogo = async (file) => {
  const formData = new FormData();
  formData.append('logo', file);
  const { data } = await API.post('/settings/logo', formData);
  return data;
};

export const deleteLogo = async () => {
  const { data } = await API.delete('/settings/logo');
  return data;
};

export const getLogoUrl = () =>
  `${API.defaults.baseURL}/settings/logo`;

// ── Note Templates ───────────────────────────────────────────

export const getMyTemplates = async () => {
  const { data } = await API.get('/note-templates/me');
  return data;
};

export const createTemplate = async (template) => {
  const { data } = await API.post('/note-templates', template);
  return data;
};

export const updateTemplate = async (id, updates) => {
  const { data } = await API.patch(`/note-templates/${encodeURIComponent(id)}`, updates);
  return data;
};

export const deleteTemplate = async (id) => {
  const { data } = await API.delete(`/note-templates/${encodeURIComponent(id)}`);
  return data;
};
