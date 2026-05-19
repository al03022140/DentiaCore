import React, { useEffect, useMemo, useState } from 'react';
import {
  getRolePermissions,
  updateRolePermissions,
  getUsers,
  updateUserPermissions,
} from '../../../shared/services/settingsService';
import { useAuth } from '../../../app/auth/AuthContext';
import { hasPermission } from '../../../app/auth/permissions';
import AccountsManagement from './AccountsManagement';

/*
 * Catálogo de permisos (label + descripción humanizada).
 * Las CLAVES deben coincidir con las definidas en Server/utils/permissions.js.
 * Si agregas un permiso allá, recuerda agregarlo aquí también.
 */
const PERMISSIONS_META = {
  // Pacientes — expediente completo
  'patients.read':              { group: 'Pacientes',        label: 'Ver expediente',          desc: 'Consultar el expediente clínico completo de los pacientes.' },
  'patients.create':            { group: 'Pacientes',        label: 'Crear paciente',          desc: 'Registrar nuevos pacientes con historia clínica.' },
  'patients.update':            { group: 'Pacientes',        label: 'Editar paciente',         desc: 'Modificar datos clínicos del expediente.' },
  'patients.delete':            { group: 'Pacientes',        label: 'Archivar paciente',       desc: 'Soft-delete del expediente. La NOM-004 prohíbe el borrado físico.' },
  // Pacientes — solo datos básicos (segregación clínico/administrativo)
  'patients.read.basic':        { group: 'Pacientes',        label: 'Ver datos básicos',       desc: 'Solo contacto e identificación, sin acceso a historia clínica.' },
  'patients.create.basic':      { group: 'Pacientes',        label: 'Crear ficha básica',      desc: 'Registrar paciente con ficha de identificación, sin historia clínica.' },
  'patients.update.basic':      { group: 'Pacientes',        label: 'Editar datos básicos',    desc: 'Actualizar datos de contacto. Sin tocar el expediente clínico.' },

  // Odontograma
  'odontogram.read':            { group: 'Odontograma',      label: 'Ver odontograma',         desc: 'Consultar el odontograma de cada paciente.' },
  'odontogram.create':          { group: 'Odontograma',      label: 'Crear odontograma oficial', desc: 'Registrar odontogramas oficiales (NOM-013: exclusivo del dentista).' },
  'odontogram.update':          { group: 'Odontograma',      label: 'Editar odontograma oficial', desc: 'Modificar hallazgos en odontogramas oficiales.' },
  'odontogram.write.draft':     { group: 'Odontograma',      label: 'Capturar borrador',       desc: 'Capturar en modo borrador durante el procedimiento (firma del doctor pendiente).' },

  // Periodontograma
  'periodontogram.read':        { group: 'Periodontograma',  label: 'Ver periodontograma',     desc: 'Consultar las mediciones del periodontograma.' },
  'periodontogram.create':      { group: 'Periodontograma',  label: 'Crear periodontograma oficial', desc: 'Registrar nuevos periodontogramas oficiales.' },
  'periodontogram.update':      { group: 'Periodontograma',  label: 'Editar periodontograma oficial', desc: 'Modificar mediciones de periodontogramas oficiales.' },
  'periodontogram.write.draft': { group: 'Periodontograma',  label: 'Capturar borrador',       desc: 'Capturar mediciones en modo borrador, pendiente de firma del doctor.' },

  // Consultas / notas de evolución
  'consultas.read':             { group: 'Consultas',        label: 'Ver consultas',           desc: 'Consultar las notas de evolución firmadas.' },
  'consultas.create':           { group: 'Consultas',        label: 'Crear consulta oficial',  desc: 'Crear notas de evolución firmadas (NOM-004 Art. 6.2).' },
  'consultas.update':           { group: 'Consultas',        label: 'Editar consulta oficial', desc: 'Modificar notas oficiales (genera addendum por trazabilidad).' },
  'consultas.create.draft':     { group: 'Consultas',        label: 'Crear borrador de nota',  desc: 'Redactar borradores de nota de evolución para que el doctor los firme.' },
  'consultas.update.draft':     { group: 'Consultas',        label: 'Editar borrador de nota', desc: 'Editar borradores propios antes de que el doctor los firme.' },

  // Exámenes
  'exams.read':                 { group: 'Exámenes',         label: 'Ver exámenes',            desc: 'Consultar exámenes radiológicos y de laboratorio.' },
  'exams.create':               { group: 'Exámenes',         label: 'Crear examen',            desc: 'Registrar nuevos exámenes en el expediente.' },
  'exams.update':               { group: 'Exámenes',         label: 'Editar examen',           desc: 'Modificar resultados o anexos de exámenes existentes.' },

  // Citas
  'appointments.read':          { group: 'Citas',            label: 'Ver citas',               desc: 'Consultar la agenda y el detalle de cada cita.' },
  'appointments.create':        { group: 'Citas',            label: 'Crear cita',              desc: 'Agendar nuevas citas para los pacientes.' },
  'appointments.update':        { group: 'Citas',            label: 'Editar cita',             desc: 'Reprogramar, reasignar o modificar citas existentes.' },
  'appointments.delete':        { group: 'Citas',            label: 'Cancelar cita',           desc: 'Cancelar y borrar citas de la agenda.' },

  // Caja
  'cash.read':                  { group: 'Caja',             label: 'Ver caja',                desc: 'Consultar movimientos y estado actual de la caja.' },
  'cash.manage':                { group: 'Caja',             label: 'Gestionar caja',          desc: 'Abrir y cerrar caja, registrar ingresos y egresos.' },

  // Estadísticas
  'stats.read.own':             { group: 'Estadísticas',     label: 'Ver mis estadísticas',    desc: 'Ver estadísticas clínicas de los pacientes propios.' },
  'stats.read.admin':           { group: 'Estadísticas',     label: 'Ver estadísticas admin.', desc: 'Ver estadísticas administrativas (citas, ingresos).' },

  // Configuración
  'settings.read':              { group: 'Configuración',    label: 'Leer configuración',      desc: 'Consultar la configuración general de la clínica.' },
  'settings.update':            { group: 'Configuración',    label: 'Modificar configuración', desc: 'Cambiar parámetros generales de la clínica.' },
  'professional.update':        { group: 'Configuración',    label: 'Editar perfil profesional', desc: 'Modificar firma digital y cédula profesional propias.' },

  // Borradores y firma
  'draft.approve':              { group: 'Borradores y firma', label: 'Aprobar borrador',     desc: 'Transicionar un borrador a OFICIAL con firma digital (exclusivo doctor).' },
  'drafts.batch_sign':          { group: 'Borradores y firma', label: 'Firmar en lote',       desc: 'Firmar varios borradores a la vez desde el Centro de Firmas Pendientes.' },

  // Notas: plantillas y extemporáneas
  'notes.template.use':         { group: 'Notas y plantillas', label: 'Usar plantillas',       desc: 'Aplicar plantillas de evolución (Anti-Olvidos NOM-004).' },
  'notes.template.manage':      { group: 'Notas y plantillas', label: 'Gestionar plantillas',  desc: 'Crear, editar y eliminar plantillas de evolución propias.' },
  'notes.create.backdated':     { group: 'Notas y plantillas', label: 'Captura extemporánea', desc: 'Registrar notas con fecha pasada justificando el motivo (NOM-024).' },

  // Sesión
  'session.lock':               { group: 'Sesión',           label: 'Bloquear pantalla',       desc: 'Activar el Modo Cortina con bloqueo por PIN (LFPDPPP Art. 19).' },

  // Gestión de cuentas (CRUD de usuarios)
  'users.read':                 { group: 'Cuentas',          label: 'Ver cuentas',             desc: 'Listar y consultar las cuentas de usuario del sistema.' },
  'users.create':               { group: 'Cuentas',          label: 'Crear cuenta',            desc: 'Registrar nuevos usuarios (limitado por jerarquía de roles).' },
  'users.update':               { group: 'Cuentas',          label: 'Editar cuenta',           desc: 'Cambiar nombre, email, rol y contraseña de otros usuarios.' },
  'users.disable':              { group: 'Cuentas',          label: 'Desactivar cuenta',       desc: 'Soft-disable de cuenta. Se conserva auditoría pero no puede ingresar.' },
};

const ALL_PERMISSIONS = Object.keys(PERMISSIONS_META);

/*
 * Defaults por rol — espejo de Server/utils/permissions.js (ROLE_PERMISSIONS).
 * Sirven para hidratar la UI cuando un rol todavía no tiene overrides en ClinicSettings.
 * Solo incluyo los roles editables desde la UI (doctor / asistente / recepcionista).
 */
const ROLE_DEFAULTS = {
  doctor_admin: [
    // Pacientes — CRUD completo
    'patients.read', 'patients.create', 'patients.update', 'patients.delete',
    // Clínico
    'odontogram.read', 'odontogram.create', 'odontogram.update',
    'periodontogram.read', 'periodontogram.create', 'periodontogram.update',
    'consultas.read', 'consultas.create', 'consultas.update',
    'exams.read', 'exams.create', 'exams.update',
    // Citas — CRUD completo
    'appointments.read', 'appointments.create', 'appointments.update', 'appointments.delete',
    'cash.read', 'cash.manage',
    'stats.read.own', 'stats.read.admin',
    'users.read', 'users.create', 'users.update', 'users.disable',
    'settings.read', 'settings.update',
    'professional.update',
    'audit.read.full',
    'draft.approve', 'drafts.batch_sign',
    'notes.create.backdated', 'notes.template.use', 'notes.template.manage',
    'session.lock',
  ],
  doctor: [
    'patients.read', 'patients.create', 'patients.update',
    'odontogram.read', 'odontogram.create', 'odontogram.update',
    'periodontogram.read', 'periodontogram.create', 'periodontogram.update',
    'consultas.read', 'consultas.create', 'consultas.update',
    'exams.read', 'exams.create', 'exams.update',
    'appointments.read', 'appointments.create', 'appointments.update',
    'stats.read.own',
    'draft.approve', 'drafts.batch_sign',
    'notes.create.backdated', 'notes.template.use', 'notes.template.manage',
    'settings.read', 'professional.update',
    'session.lock',
    // Gestión de cuentas — para consultorios pequeños
    'users.read', 'users.create', 'users.update', 'users.disable',
  ],
  asistente: [
    'patients.read',
    'odontogram.read', 'odontogram.write.draft',
    'periodontogram.read', 'periodontogram.write.draft',
    'consultas.read', 'consultas.create.draft', 'consultas.update.draft',
    'exams.read',
    'appointments.read',
    'notes.template.use',
    'settings.read',
    'session.lock',
  ],
  recepcionista: [
    'patients.read.basic', 'patients.create.basic', 'patients.update.basic',
    'appointments.read', 'appointments.create', 'appointments.update', 'appointments.delete',
    'cash.read', 'cash.manage',
    'stats.read.admin',
    'settings.read',
    'session.lock',
  ],
};

const ROLES = [
  { id: 'doctor_admin',  label: 'Doctor (administrador)', desc: 'Dentista-director: practica clínicamente Y administra cuentas, caja, configuración y citas.' },
  { id: 'doctor',        label: 'Doctor',        desc: 'Acceso clínico completo: pacientes, citas, odontograma y periodontograma.' },
  { id: 'recepcionista', label: 'Recepcionista', desc: 'Gestión de agenda, citas y caja desde la recepción.' },
  { id: 'asistente',     label: 'Asistente',     desc: 'Apoyo clínico bajo supervisión directa del doctor (captura en borrador).' },
];

// Agrupar permisos por categoría (preserva el orden de PERMISSIONS_META)
const buildGroups = () => {
  const map = new Map();
  for (const key of ALL_PERMISSIONS) {
    const { group } = PERMISSIONS_META[key];
    if (!map.has(group)) map.set(group, []);
    map.get(group).push(key);
  }
  return Array.from(map.entries()).map(([name, perms]) => ({ name, perms }));
};

const AccountsPermissionsSection = () => {
  const { user: currentUser } = useAuth();
  const currentRole = currentUser?.rol || currentUser?.role;
  const userPermsList = currentUser?.permissions || [];

  // Las pestañas de permisos (Por Rol / Por Usuario) son administrativas:
  // solo quienes tienen settings.update (admin/superadmin) las ven. El
  // doctor entra solo a "Gestionar cuentas".
  const canManagePerms = hasPermission(userPermsList, ['settings.update'])
    || currentRole === 'administrador'
    || currentRole === 'superadmin';
  const canManageAccounts = hasPermission(userPermsList, ['users.read'])
    || ['doctor', 'administrador', 'superadmin'].includes(currentRole);

  const [rolePerms, setRolePerms] = useState({});
  const [users, setUsers] = useState([]);
  const [selectedUser, setSelectedUser] = useState(null);
  const [userPerms, setUserPerms] = useState([]);
  const [msg, setMsg] = useState(null);
  const [loading, setLoading] = useState(true);
  // Tab inicial: la primera disponible para el usuario actual.
  const initialTab = canManageAccounts ? 'accounts' : 'roles';
  const [tab, setTab] = useState(initialTab);
  const [openRoles, setOpenRoles] = useState({});
  const [savingRole, setSavingRole] = useState(null);

  const permGroups = useMemo(() => buildGroups(), []);

  useEffect(() => {
    // Para roles que no pueden gestionar permisos, NO pedimos los datos de
    // permisos (404/403 inútil). Solo cargamos lo mínimo.
    if (!canManagePerms) {
      setLoading(false);
      return;
    }
    Promise.all([getRolePermissions(), getUsers()])
      .then(([rp, u]) => {
        // rp viene del servidor como { [role]: string[] } SOLO con overrides existentes.
        // Si el servidor devuelve un array (incluido `[]`) ese es el estado autoritativo
        // (config explícita del admin). Sólo si la clave NO existe usamos los defaults
        // base de roles.MD (rol que nunca se ha configurado).
        const hydrated = {};
        for (const role of ROLES) {
          const override = rp?.[role.id];
          hydrated[role.id] = Array.isArray(override)
            ? override
            : (ROLE_DEFAULTS[role.id] || []);
        }
        setRolePerms(hydrated);
        setUsers(Array.isArray(u) ? u : u.users || []);
      })
      .catch(() => setMsg({ type: 'error', text: 'Error al cargar datos' }))
      .finally(() => setLoading(false));
  }, [canManagePerms]);

  const toggleRoleOpen = (roleId) => {
    setOpenRoles((prev) => ({ ...prev, [roleId]: !prev[roleId] }));
  };

  // ── Role permission toggle ──
  const toggleRolePerm = (role, perm) => {
    setRolePerms((prev) => {
      const current = prev[role] || [];
      const next = current.includes(perm) ? current.filter((p) => p !== perm) : [...current, perm];
      return { ...prev, [role]: next };
    });
  };

  const resetRoleToDefaults = (role) => {
    setRolePerms((prev) => ({ ...prev, [role]: [...(ROLE_DEFAULTS[role] || [])] }));
  };

  const saveRolePerms = async (role) => {
    setMsg(null);
    setSavingRole(role);
    try {
      await updateRolePermissions(role, rolePerms[role] || []);
      const roleLabel = ROLES.find((r) => r.id === role)?.label || role;
      setMsg({ type: 'success', text: `Permisos de ${roleLabel} actualizados correctamente.` });
    } catch (err) {
      setMsg({ type: 'error', text: err.response?.data?.message || 'Error al guardar' });
    } finally {
      setSavingRole(null);
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

      <div className="perm-tabs">
        {canManageAccounts && (
          <button
            className={tab === 'accounts' ? 'settings-btn-primary' : 'settings-btn-secondary'}
            onClick={() => setTab('accounts')}
          >
            Gestionar cuentas
          </button>
        )}
        {canManagePerms && (
          <>
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
          </>
        )}
      </div>

      {tab === 'accounts' && canManageAccounts && <AccountsManagement />}

      {tab === 'roles' && (
        <div className="perm-roles">
          {ROLES.map((role) => {
            const isOpen = !!openRoles[role.id];
            const granted = rolePerms[role.id] || [];
            const bodyId = `perm-role-body-${role.id}`;
            const isSaving = savingRole === role.id;
            return (
              <div key={role.id} className={`perm-role${isOpen ? ' perm-role--open' : ''}`}>
                <button
                  type="button"
                  className="perm-role-header"
                  onClick={() => toggleRoleOpen(role.id)}
                  aria-expanded={isOpen}
                  aria-controls={bodyId}
                >
                  <span className="perm-role-info">
                    <span className="perm-role-name">{role.label}</span>
                    <span className="perm-role-desc">{role.desc}</span>
                  </span>
                  <span className="perm-role-count" aria-label={`${granted.length} de ${ALL_PERMISSIONS.length} permisos activos`}>
                    {granted.length} / {ALL_PERMISSIONS.length}
                  </span>
                  <span className="perm-role-chevron" aria-hidden="true">›</span>
                </button>

                {isOpen && (
                  <div className="perm-role-body" id={bodyId}>
                    {permGroups.map((group) => (
                      <div key={group.name} className="perm-group">
                        <h5 className="perm-group-title">{group.name}</h5>
                        <ul className="perm-toggle-list">
                          {group.perms.map((perm) => {
                            const meta = PERMISSIONS_META[perm];
                            const isOn = granted.includes(perm);
                            return (
                              <li key={perm} className="perm-toggle">
                                <div className="perm-toggle-info">
                                  <span className="perm-toggle-title">{meta.label}</span>
                                  <span className="perm-toggle-desc">{meta.desc}</span>
                                </div>
                                <label className="settings-switch">
                                  <input
                                    type="checkbox"
                                    checked={isOn}
                                    onChange={() => toggleRolePerm(role.id, perm)}
                                  />
                                  <span className="slider" />
                                </label>
                              </li>
                            );
                          })}
                        </ul>
                      </div>
                    ))}
                    <div className="perm-role-actions">
                      <button
                        type="button"
                        className="settings-btn-secondary"
                        onClick={() => resetRoleToDefaults(role.id)}
                        disabled={isSaving}
                      >
                        Restaurar predeterminados
                      </button>
                      <button
                        type="button"
                        className="settings-btn-primary"
                        onClick={() => saveRolePerms(role.id)}
                        disabled={isSaving}
                      >
                        {isSaving ? 'Guardando…' : 'Guardar permisos'}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
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
            <div className="perm-user">
              <h4 className="perm-user-title">Permisos individuales de {selectedUser.nombre}</h4>
              <p className="perm-user-hint">
                Estos permisos se suman a los del rol <strong>{selectedUser.rol}</strong>.
              </p>
              {permGroups.map((group) => (
                <div key={group.name} className="perm-group">
                  <h5 className="perm-group-title">{group.name}</h5>
                  <ul className="perm-toggle-list">
                    {group.perms.map((perm) => {
                      const meta = PERMISSIONS_META[perm];
                      const isOn = userPerms.includes(perm);
                      return (
                        <li key={perm} className="perm-toggle">
                          <div className="perm-toggle-info">
                            <span className="perm-toggle-title">{meta.label}</span>
                            <span className="perm-toggle-desc">{meta.desc}</span>
                          </div>
                          <label className="settings-switch">
                            <input
                              type="checkbox"
                              checked={isOn}
                              onChange={() => toggleUserPerm(perm)}
                            />
                            <span className="slider" />
                          </label>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              ))}
              <div className="settings-actions">
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
