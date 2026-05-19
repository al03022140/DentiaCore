import React, { useEffect, useMemo, useState } from 'react';
import { useAuth } from '../../../app/auth/AuthContext';
import { hasPermission } from '../../../app/auth/permissions';
import {
  getUsers,
  createUser,
  updateUser,
  disableUser,
  enableUser,
} from '../../../shared/services/settingsService';

/*
 * Jerarquía de roles — espejo de Server/controllers/usersController.js.
 * Mayor índice = más privilegio. El backend rechaza intentos de:
 *  - asignar rol > propio
 *  - tocar cuentas de rol >= propio (excepto self)
 *  - tocar superadmin si no eres superadmin
 *  - auto-desactivarte
 *  - cambiarte el propio rol
 */
const ROLE_HIERARCHY = ['recepcionista', 'asistente', 'doctor', 'administrador', 'doctor_admin', 'superadmin'];

const ROLE_LABELS = {
  recepcionista: 'Recepcionista',
  asistente: 'Asistente',
  doctor: 'Doctor',
  administrador: 'Administrador',
  doctor_admin: 'Doctor (administrador)',
  superadmin: 'Superadmin',
};

const getRoleLevel = (role) => ROLE_HIERARCHY.indexOf(role || '');

const formatDate = (iso) => {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleDateString('es-MX', { year: 'numeric', month: 'short', day: '2-digit' });
  } catch {
    return '—';
  }
};

/**
 * Input de contraseña / PIN con botón "ojo" para mostrar/ocultar.
 * Mantiene la API estándar de <input> + acepta `inputMode`, `maxLength`, etc.
 */
function SecretInput({ id, value, onChange, disabled, autoFocus, required, autoComplete, placeholder, minLength, maxLength, inputMode, pattern }) {
  const [visible, setVisible] = useState(false);
  return (
    <div className="secret-input">
      <input
        id={id}
        type={visible ? 'text' : 'password'}
        value={value}
        onChange={onChange}
        disabled={disabled}
        autoFocus={autoFocus}
        required={required}
        autoComplete={autoComplete}
        placeholder={placeholder}
        minLength={minLength}
        maxLength={maxLength}
        inputMode={inputMode}
        pattern={pattern}
      />
      <button
        type="button"
        className="secret-input__toggle"
        onClick={() => setVisible((v) => !v)}
        disabled={disabled}
        aria-label={visible ? 'Ocultar' : 'Mostrar'}
        tabIndex={-1}
      >
        {visible ? (
          // Eye-slash
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M17.94 17.94A10.94 10.94 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A10.94 10.94 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
            <line x1="1" y1="1" x2="23" y2="23" />
          </svg>
        ) : (
          // Eye
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
            <circle cx="12" cy="12" r="3" />
          </svg>
        )}
      </button>
    </div>
  );
}

const AccountsManagement = () => {
  const { user: currentUser } = useAuth();
  const currentUserId = currentUser?.id || currentUser?._id;
  const currentRoleLevel = getRoleLevel(currentUser?.rol || currentUser?.role);
  const canCreate = hasPermission(currentUser?.permissions || [], ['users.create'])
    || ['administrador', 'superadmin', 'doctor'].includes(currentUser?.rol || currentUser?.role);
  const canUpdate = hasPermission(currentUser?.permissions || [], ['users.update'])
    || ['administrador', 'superadmin', 'doctor'].includes(currentUser?.rol || currentUser?.role);
  const canDisable = hasPermission(currentUser?.permissions || [], ['users.disable'])
    || ['administrador', 'superadmin', 'doctor'].includes(currentUser?.rol || currentUser?.role);

  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState(null);
  const [busyId, setBusyId] = useState(null);

  // Modales
  const [editTarget, setEditTarget] = useState(null);     // user | { _mode: 'create' }
  const [resetTarget, setResetTarget] = useState(null);   // user

  // Roles que el actor puede asignar (cap a su propio nivel)
  const assignableRoles = useMemo(() => {
    if (currentRoleLevel < 0) return [];
    return ROLE_HIERARCHY.filter((r) => getRoleLevel(r) <= currentRoleLevel);
  }, [currentRoleLevel]);

  const fetchUsers = async () => {
    setLoading(true);
    try {
      const data = await getUsers();
      const list = Array.isArray(data) ? data : (data?.users || []);
      setUsers(list);
    } catch (err) {
      setMsg({ type: 'error', text: err?.response?.data?.message || 'Error al cargar usuarios' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchUsers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const isUntouchable = (u) => {
    // No se puede tocar usuarios de rol >= propio (excepto self).
    if (!u) return true;
    const uid = u._id || u.id;
    if (uid === currentUserId) return false; // self-edit permitido (sin rol)
    return getRoleLevel(u.rol) >= currentRoleLevel;
  };

  const handleSave = async (payload, target) => {
    setMsg(null);
    const isCreate = target?._mode === 'create';
    try {
      if (isCreate) {
        await createUser(payload);
        setMsg({ type: 'success', text: 'Usuario creado correctamente.' });
      } else {
        await updateUser(target._id || target.id, payload);
        setMsg({ type: 'success', text: 'Usuario actualizado.' });
      }
      setEditTarget(null);
      await fetchUsers();
    } catch (err) {
      const text = err?.response?.data?.message
        || (err?.response?.data?.errors?.[0]?.msg)
        || 'Error al guardar';
      setMsg({ type: 'error', text });
      throw err;
    }
  };

  const handleResetPassword = async (newPassword, target) => {
    setMsg(null);
    try {
      await updateUser(target._id || target.id, { contraseña: newPassword });
      setMsg({ type: 'success', text: `Contraseña restablecida. Se cerró la sesión activa de ${target.nombre}.` });
      setResetTarget(null);
    } catch (err) {
      const text = err?.response?.data?.message || 'Error al restablecer contraseña';
      setMsg({ type: 'error', text });
      throw err;
    }
  };

  const handleToggleActive = async (u) => {
    if ((u._id || u.id) === currentUserId) {
      setMsg({ type: 'error', text: 'No puede desactivar su propia cuenta.' });
      return;
    }
    setBusyId(u._id || u.id);
    setMsg(null);
    try {
      if (u.active) {
        const ok = window.confirm(`¿Desactivar la cuenta de ${u.nombre}? Su sesión activa se cerrará.`);
        if (!ok) { setBusyId(null); return; }
        await disableUser(u._id || u.id);
        setMsg({ type: 'success', text: `Cuenta de ${u.nombre} desactivada.` });
      } else {
        await enableUser(u._id || u.id);
        setMsg({ type: 'success', text: `Cuenta de ${u.nombre} reactivada.` });
      }
      await fetchUsers();
    } catch (err) {
      const text = err?.response?.data?.message || 'Error al cambiar estado';
      setMsg({ type: 'error', text });
    } finally {
      setBusyId(null);
    }
  };

  if (loading) return <p>Cargando usuarios…</p>;

  return (
    <div className="accounts-management">
      {msg && (
        <div className={`settings-message ${msg.type}`}>
          {msg.text}
          <button type="button" className="settings-message-close" onClick={() => setMsg(null)} aria-label="Cerrar">×</button>
        </div>
      )}

      <div className="accounts-management__header">
        <div>
          <h3>Cuentas de usuario</h3>
          <p className="accounts-management__hint">
            Crea y edita las cuentas que pueden ingresar al sistema. No puedes asignar un rol superior al tuyo
            ni modificar cuentas con rol igual o superior al tuyo.
          </p>
        </div>
        {canCreate && (
          <button
            type="button"
            className="settings-btn-primary"
            onClick={() => setEditTarget({ _mode: 'create' })}
          >
            + Nuevo usuario
          </button>
        )}
      </div>

      <div className="accounts-management__table-wrap">
        <table className="accounts-management__table">
          <thead>
            <tr>
              <th>Nombre</th>
              <th>Email</th>
              <th>Rol</th>
              <th>Estado</th>
              <th>Último cambio de contraseña</th>
              <th>Acciones</th>
            </tr>
          </thead>
          <tbody>
            {users.length === 0 && (
              <tr><td colSpan="6" className="no-data">Sin usuarios registrados</td></tr>
            )}
            {users.map((u) => {
              const uid = u._id || u.id;
              const isSelf = uid === currentUserId;
              const locked = isUntouchable(u);
              return (
                <tr key={uid} className={!u.active ? 'is-inactive' : ''}>
                  <td>
                    {u.nombre}
                    {isSelf && <span className="badge-self">tú</span>}
                  </td>
                  <td>{u.email}</td>
                  <td>
                    <span className={`role-pill role-pill--${u.rol}`}>{ROLE_LABELS[u.rol] || u.rol}</span>
                  </td>
                  <td>
                    <span className={`status-pill ${u.active ? 'is-active' : 'is-disabled'}`}>
                      {u.active ? 'Activa' : 'Desactivada'}
                    </span>
                  </td>
                  <td className="muted">{formatDate(u.lastPasswordChangeAt)}</td>
                  <td className="accounts-management__actions">
                    <button
                      type="button"
                      className="settings-btn-secondary"
                      disabled={!canUpdate || locked}
                      title={locked ? 'No puedes modificar esta cuenta (rol superior)' : 'Editar nombre, email o rol'}
                      onClick={() => setEditTarget(u)}
                    >
                      Editar
                    </button>
                    <button
                      type="button"
                      className="settings-btn-secondary"
                      disabled={!canUpdate || locked}
                      title="Restablecer contraseña (cierra la sesión activa)"
                      onClick={() => setResetTarget(u)}
                    >
                      Contraseña
                    </button>
                    <button
                      type="button"
                      className={u.active ? 'settings-btn-danger' : 'settings-btn-primary'}
                      disabled={!canDisable || locked || isSelf || busyId === uid}
                      title={isSelf
                        ? 'No puedes desactivar tu propia cuenta'
                        : (locked ? 'No puedes modificar esta cuenta' : (u.active ? 'Desactivar cuenta' : 'Reactivar cuenta'))}
                      onClick={() => handleToggleActive(u)}
                    >
                      {busyId === uid ? '…' : (u.active ? 'Desactivar' : 'Activar')}
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {editTarget && (
        <UserFormModal
          target={editTarget}
          onClose={() => setEditTarget(null)}
          onSave={(payload) => handleSave(payload, editTarget)}
          assignableRoles={assignableRoles}
          currentUserId={currentUserId}
        />
      )}

      {resetTarget && (
        <ResetPasswordModal
          target={resetTarget}
          onClose={() => setResetTarget(null)}
          onSubmit={(pw) => handleResetPassword(pw, resetTarget)}
        />
      )}
    </div>
  );
};

// ──────────────────────────────────────────────────────────────
// MODAL: Crear / Editar cuenta
// ──────────────────────────────────────────────────────────────
function UserFormModal({ target, onClose, onSave, assignableRoles, currentUserId }) {
  const isCreate = target?._mode === 'create';
  const isSelf = !isCreate && (target._id || target.id) === currentUserId;

  const [nombre, setNombre] = useState(isCreate ? '' : target.nombre || '');
  const [email, setEmail] = useState(isCreate ? '' : target.email || '');
  const [rol, setRol] = useState(isCreate ? (assignableRoles[0] || 'recepcionista') : target.rol);
  const [contraseña, setContraseña] = useState('');
  const [pin, setPin] = useState('');
  const [cedulaProfesional, setCedulaProfesional] = useState(isCreate ? '' : (target.cedulaProfesional || ''));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const finalRol = (!isCreate && isSelf) ? target.rol : rol;
  const requiresCedula = finalRol === 'doctor' || finalRol === 'doctor_admin';

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    if (!nombre.trim()) { setError('El nombre es requerido.'); return; }
    if (!/^\S+@\S+\.\S+$/.test(email)) { setError('Email inválido.'); return; }
    if (isCreate) {
      if (contraseña.length < 8) { setError('La contraseña debe tener al menos 8 caracteres.'); return; }
      if (!/^\d{4}$/.test(pin)) { setError('El PIN debe tener exactamente 4 dígitos.'); return; }
    }
    if (requiresCedula && !cedulaProfesional.trim()) {
      setError('La cédula profesional es obligatoria para doctores (NOM-004 Art. 5.10).');
      return;
    }

    setSaving(true);
    try {
      const payload = isCreate
        ? {
            nombre: nombre.trim(),
            email: email.trim(),
            rol,
            contraseña,
            pin,
            ...(cedulaProfesional.trim() ? { cedulaProfesional: cedulaProfesional.trim() } : {}),
          }
        : {
            nombre: nombre.trim(),
            email: email.trim(),
            // No mandamos rol si es self (el backend lo rechazaría igual)
            ...(isSelf ? {} : { rol }),
            // Cédula sólo si cambió o el rol final es doctor
            ...(cedulaProfesional !== (target.cedulaProfesional || '')
              ? { cedulaProfesional: cedulaProfesional.trim() }
              : {}),
          };
      await onSave(payload);
    } catch (err) {
      setError(err?.response?.data?.message
        || (err?.response?.data?.errors?.[0]?.msg)
        || 'Error al guardar');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="signature-pad-overlay" onClick={() => !saving && onClose()}>
      <div className="signature-pad-card" onClick={(e) => e.stopPropagation()} style={{ width: 'min(520px, 96vw)' }}>
        <div className="signature-pad-header">
          <h2>{isCreate ? 'Nuevo usuario' : `Editar cuenta de ${target.nombre}`}</h2>
          {!isCreate && isSelf && (
            <p className="signature-pad-subtitle">No puedes cambiar tu propio rol desde aquí.</p>
          )}
        </div>

        <form className="account-form" onSubmit={handleSubmit}>
          <div className="settings-form-group">
            <label htmlFor="user-nombre">Nombre completo</label>
            <input
              id="user-nombre"
              type="text"
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
              disabled={saving}
              required
            />
          </div>

          <div className="settings-form-group">
            <label htmlFor="user-email">Email</label>
            <input
              id="user-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={saving}
              required
            />
          </div>

          <div className="settings-form-group">
            <label htmlFor="user-rol">Rol</label>
            <select
              id="user-rol"
              value={rol}
              onChange={(e) => setRol(e.target.value)}
              disabled={saving || isSelf}
            >
              {assignableRoles.map((r) => (
                <option key={r} value={r}>{ROLE_LABELS[r] || r}</option>
              ))}
              {/* Si el rol actual del usuario está fuera de los asignables (rol superior), mostrarlo deshabilitado */}
              {!isCreate && !assignableRoles.includes(target.rol) && (
                <option value={target.rol} disabled>{ROLE_LABELS[target.rol] || target.rol} (no modificable)</option>
              )}
            </select>
          </div>

          {requiresCedula && (
            <div className="settings-form-group">
              <label htmlFor="user-cedula">
                Cédula profesional {requiresCedula && <span style={{ color: '#dc2626' }}>*</span>}
              </label>
              <input
                id="user-cedula"
                type="text"
                value={cedulaProfesional}
                onChange={(e) => setCedulaProfesional(e.target.value)}
                disabled={saving}
                placeholder="Ej. 12345678"
                required
              />
              <small className="settings-form-hint">
                Obligatoria para doctores (NOM-004 Art. 5.10). El doctor puede completar el resto
                del perfil profesional (firma, especialidad, universidad) en su sección "Perfil Profesional".
              </small>
            </div>
          )}

          {isCreate && (
            <>
              <div className="settings-form-group">
                <label htmlFor="user-pwd">Contraseña</label>
                <SecretInput
                  id="user-pwd"
                  value={contraseña}
                  onChange={(e) => setContraseña(e.target.value)}
                  disabled={saving}
                  minLength={8}
                  required
                  autoComplete="new-password"
                />
                <small className="settings-form-hint">Mínimo 8 caracteres. Debe incluir mayúsculas, minúsculas y números.</small>
              </div>

              <div className="settings-form-group">
                <label htmlFor="user-pin">PIN de 4 dígitos (para firmar)</label>
                <SecretInput
                  id="user-pin"
                  inputMode="numeric"
                  pattern="\d{4}"
                  maxLength={4}
                  value={pin}
                  onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 4))}
                  disabled={saving}
                  required
                  autoComplete="off"
                />
              </div>
            </>
          )}

          {error && <p className="signature-pad-error">{error}</p>}

          <div className="signature-pad-actions">
            <button type="button" className="signature-pad-btn signature-pad-btn-cancel" onClick={onClose} disabled={saving}>
              Cancelar
            </button>
            <button type="submit" className="signature-pad-btn signature-pad-btn-confirm" disabled={saving}>
              {saving ? 'Guardando…' : (isCreate ? 'Crear usuario' : 'Guardar cambios')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ──────────────────────────────────────────────────────────────
// MODAL: Restablecer contraseña
// ──────────────────────────────────────────────────────────────
function ResetPasswordModal({ target, onClose, onSubmit }) {
  const [pw1, setPw1] = useState('');
  const [pw2, setPw2] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    if (pw1.length < 8) { setError('La contraseña debe tener al menos 8 caracteres.'); return; }
    if (pw1 !== pw2) { setError('Las contraseñas no coinciden.'); return; }
    setSaving(true);
    try {
      await onSubmit(pw1);
    } catch (err) {
      setError(err?.response?.data?.message || 'Error al restablecer contraseña');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="signature-pad-overlay" onClick={() => !saving && onClose()}>
      <div className="signature-pad-card" onClick={(e) => e.stopPropagation()} style={{ width: 'min(440px, 96vw)' }}>
        <div className="signature-pad-header">
          <h2>Restablecer contraseña</h2>
          <p className="signature-pad-subtitle">
            La sesión activa de <strong>{target.nombre}</strong> se cerrará automáticamente y deberá ingresar
            con la nueva contraseña.
          </p>
        </div>

        <form className="account-form" onSubmit={handleSubmit}>
          <div className="settings-form-group">
            <label htmlFor="reset-pw1">Nueva contraseña</label>
            <SecretInput
              id="reset-pw1"
              value={pw1}
              onChange={(e) => setPw1(e.target.value)}
              minLength={8}
              required
              autoComplete="new-password"
              autoFocus
              disabled={saving}
            />
            <small className="settings-form-hint">Mínimo 8 caracteres con mayúsculas, minúsculas y números.</small>
          </div>

          <div className="settings-form-group">
            <label htmlFor="reset-pw2">Confirmar contraseña</label>
            <SecretInput
              id="reset-pw2"
              value={pw2}
              onChange={(e) => setPw2(e.target.value)}
              minLength={8}
              required
              autoComplete="new-password"
              disabled={saving}
            />
          </div>

          {error && <p className="signature-pad-error">{error}</p>}

          <div className="signature-pad-actions">
            <button type="button" className="signature-pad-btn signature-pad-btn-cancel" onClick={onClose} disabled={saving}>
              Cancelar
            </button>
            <button type="submit" className="signature-pad-btn signature-pad-btn-confirm" disabled={saving}>
              {saving ? 'Guardando…' : 'Restablecer'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default AccountsManagement;
