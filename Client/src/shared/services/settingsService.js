import API from './axios-instance';

// ── Clinic Settings ──────────────────────────────────────────

export const getSettings = async () => {
  const { data } = await API.get('/settings');
  return data;
};

export const updateSettings = async (updates) => {
  const { data } = await API.patch('/settings', updates);
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

export const getFirmaUrl = (userId) =>
  `${API.defaults.baseURL}/settings/users/${encodeURIComponent(userId)}/firma`;

// ── Users list (for Accounts & Permissions) ──────────────────

export const getUsers = async () => {
  const { data } = await API.get('/users');
  return data;
};

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
