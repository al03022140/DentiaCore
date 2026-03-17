import React, { useEffect, useState } from 'react';
import {
  getRolePermissions,
  updateRolePermissions,
  getUsers,
  updateUserPermissions,
} from '../../../shared/services/settingsService';

const ALL_PERMISSIONS = [
  'patients.view', 'patients.create', 'patients.edit', 'patients.delete',
  'appointments.view', 'appointments.create', 'appointments.edit', 'appointments.delete',
  'cash.view', 'cash.manage',
  'odontograma.view', 'odontograma.edit',
  'periodontograma.view', 'periodontograma.edit',
  'settings.update',
  'users.manage',
];

const ROLES = ['doctor', 'recepcionista', 'asistente'];

const AccountsPermissionsSection = () => {
  const [rolePerms, setRolePerms] = useState({});
  const [users, setUsers] = useState([]);
  const [selectedUser, setSelectedUser] = useState(null);
  const [userPerms, setUserPerms] = useState([]);
  const [msg, setMsg] = useState(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState('roles'); // 'roles' | 'users'

  useEffect(() => {
    Promise.all([getRolePermissions(), getUsers()])
      .then(([rp, u]) => {
        setRolePerms(rp || {});
        setUsers(Array.isArray(u) ? u : u.users || []);
      })
      .catch(() => setMsg({ type: 'error', text: 'Error al cargar datos' }))
      .finally(() => setLoading(false));
  }, []);

  // ── Role permission toggle ──
  const toggleRolePerm = (role, perm) => {
    setRolePerms((prev) => {
      const current = prev[role] || [];
      const next = current.includes(perm) ? current.filter((p) => p !== perm) : [...current, perm];
      return { ...prev, [role]: next };
    });
  };

  const saveRolePerms = async (role) => {
    setMsg(null);
    try {
      await updateRolePermissions(role, rolePerms[role] || []);
      setMsg({ type: 'success', text: `Permisos de ${role} actualizados` });
    } catch (err) {
      setMsg({ type: 'error', text: err.response?.data?.message || 'Error al guardar' });
    }
  };

  // ── User permission toggle ──
  const selectUser = (u) => {
    setSelectedUser(u);
    setUserPerms(u.permissions || []);
  };

  const toggleUserPerm = (perm) => {
    setUserPerms((prev) => prev.includes(perm) ? prev.filter((p) => p !== perm) : [...prev, perm]);
  };

  const saveUserPerms = async () => {
    if (!selectedUser) return;
    setMsg(null);
    try {
      await updateUserPermissions(selectedUser._id || selectedUser.id, userPerms);
      setMsg({ type: 'success', text: `Permisos de ${selectedUser.nombre} actualizados` });
    } catch (err) {
      setMsg({ type: 'error', text: err.response?.data?.message || 'Error al guardar' });
    }
  };

  if (loading) return <p>Cargando…</p>;

  return (
    <div>
      {msg && <div className={`settings-message ${msg.type}`}>{msg.text}</div>}

      <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1.5rem' }}>
        <button
          className={tab === 'roles' ? 'settings-btn-primary' : 'settings-btn-secondary'}
          onClick={() => setTab('roles')}
        >
          Por Rol
        </button>
        <button
          className={tab === 'users' ? 'settings-btn-primary' : 'settings-btn-secondary'}
          onClick={() => setTab('users')}
        >
          Por Usuario
        </button>
      </div>

      {tab === 'roles' && (
        <div>
          {ROLES.map((role) => (
            <div key={role} style={{ marginBottom: '2rem' }}>
              <h4 style={{ textTransform: 'capitalize', marginBottom: '0.5rem' }}>{role}</h4>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
                {ALL_PERMISSIONS.map((perm) => (
                  <label key={perm} style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: '0.85rem' }}>
                    <input
                      type="checkbox"
                      checked={(rolePerms[role] || []).includes(perm)}
                      onChange={() => toggleRolePerm(role, perm)}
                    />
                    {perm}
                  </label>
                ))}
              </div>
              <button className="settings-btn-secondary" style={{ marginTop: '0.5rem' }} onClick={() => saveRolePerms(role)}>
                Guardar {role}
              </button>
            </div>
          ))}
        </div>
      )}

      {tab === 'users' && (
        <div>
          <div className="settings-form-group">
            <label>Seleccionar usuario</label>
            <select onChange={(e) => {
              const u = users.find((u) => (u._id || u.id) === e.target.value);
              if (u) selectUser(u);
            }} value={selectedUser?._id || selectedUser?.id || ''}>
              <option value="">-- Seleccionar --</option>
              {users.map((u) => (
                <option key={u._id || u.id} value={u._id || u.id}>
                  {u.nombre} ({u.rol})
                </option>
              ))}
            </select>
          </div>

          {selectedUser && (
            <div>
              <h4 style={{ marginBottom: '0.5rem' }}>Permisos de {selectedUser.nombre}</h4>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
                {ALL_PERMISSIONS.map((perm) => (
                  <label key={perm} style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: '0.85rem' }}>
                    <input
                      type="checkbox"
                      checked={userPerms.includes(perm)}
                      onChange={() => toggleUserPerm(perm)}
                    />
                    {perm}
                  </label>
                ))}
              </div>
              <div className="settings-actions" style={{ marginTop: '1rem' }}>
                <button className="settings-btn-primary" onClick={saveUserPerms}>Guardar permisos</button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default AccountsPermissionsSection;
