import React, { useState } from 'react';
import { useAuth } from '../../../app/auth/AuthContext';
import { updateMyProfile, changeMyPassword, changeMyPin } from '../../../shared/services/settingsService';

const ProfileSection = () => {
  const { user, refreshUser } = useAuth();

  const [nombre, setNombre] = useState(user?.nombre || '');
  const [email, setEmail] = useState(user?.email || '');
  const [profileMsg, setProfileMsg] = useState(null);
  const [saving, setSaving] = useState(false);

  // Password
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [pwMsg, setPwMsg] = useState(null);

  // PIN
  const [pin, setPin] = useState('');
  const [pinMsg, setPinMsg] = useState(null);

  const handleProfileSave = async (e) => {
    e.preventDefault();
    setSaving(true);
    setProfileMsg(null);
    try {
      await updateMyProfile({ nombre, email });
      if (refreshUser) await refreshUser();
      setProfileMsg({ type: 'success', text: 'Perfil actualizado' });
    } catch (err) {
      setProfileMsg({ type: 'error', text: err.response?.data?.message || 'Error al guardar' });
    } finally {
      setSaving(false);
    }
  };

  const handlePasswordChange = async (e) => {
    e.preventDefault();
    setPwMsg(null);
    if (newPassword !== confirmPassword) {
      setPwMsg({ type: 'error', text: 'Las contraseñas no coinciden' });
      return;
    }
    try {
      await changeMyPassword(currentPassword, newPassword);
      setPwMsg({ type: 'success', text: 'Contraseña actualizada' });
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (err) {
      setPwMsg({ type: 'error', text: err.response?.data?.message || 'Error al cambiar contraseña' });
    }
  };

  const handlePinChange = async (e) => {
    e.preventDefault();
    setPinMsg(null);
    try {
      await changeMyPin(pin);
      setPinMsg({ type: 'success', text: 'PIN actualizado' });
      setPin('');
    } catch (err) {
      setPinMsg({ type: 'error', text: err.response?.data?.message || 'Error al cambiar PIN' });
    }
  };

  const rolLabels = {
    superadmin: 'Super Admin',
    administrador: 'Administrador',
    doctor: 'Doctor',
    recepcionista: 'Recepcionista',
    asistente: 'Asistente',
  };

  return (
    <div>
      {/* Datos básicos */}
      <form onSubmit={handleProfileSave}>
        {profileMsg && <div className={`settings-message ${profileMsg.type}`}>{profileMsg.text}</div>}
        <div className="settings-form-group">
          <label>Rol</label>
          <input value={rolLabels[user?.rol || user?.role] || user?.rol || ''} disabled style={{ opacity: 0.7, cursor: 'not-allowed' }} />
        </div>
        <div className="settings-form-group">
          <label>Nombre</label>
          <input value={nombre} onChange={(e) => setNombre(e.target.value)} required />
        </div>
        <div className="settings-form-group">
          <label>Correo electrónico</label>
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        </div>
        <div className="settings-actions">
          <button type="submit" className="settings-btn-primary" disabled={saving}>
            {saving ? 'Guardando…' : 'Guardar perfil'}
          </button>
        </div>
      </form>

      <hr style={{ margin: '2rem 0', borderColor: 'var(--color-border-light)' }} />

      {/* Cambio de contraseña */}
      <h3 style={{ marginBottom: '1rem' }}>Cambiar contraseña</h3>
      <form onSubmit={handlePasswordChange}>
        {pwMsg && <div className={`settings-message ${pwMsg.type}`}>{pwMsg.text}</div>}
        <div className="settings-form-group">
          <label>Contraseña actual</label>
          <input type="password" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} required autoComplete="current-password" />
        </div>
        <div className="settings-form-group">
          <label>Nueva contraseña</label>
          <input type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} required minLength={8} autoComplete="new-password" />
          <span className="hint">Mínimo 8 caracteres</span>
        </div>
        <div className="settings-form-group">
          <label>Confirmar nueva contraseña</label>
          <input type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} required autoComplete="new-password" />
        </div>
        <div className="settings-actions">
          <button type="submit" className="settings-btn-primary">Cambiar contraseña</button>
        </div>
      </form>

      <hr style={{ margin: '2rem 0', borderColor: 'var(--color-border-light)' }} />

      {/* Cambio de PIN */}
      <h3 style={{ marginBottom: '1rem' }}>Cambiar PIN de acceso rápido</h3>
      <form onSubmit={handlePinChange}>
        {pinMsg && <div className={`settings-message ${pinMsg.type}`}>{pinMsg.text}</div>}
        <div className="settings-form-group">
          <label>Nuevo PIN (4 dígitos)</label>
          <input
            type="password"
            inputMode="numeric"
            maxLength={4}
            pattern="\d{4}"
            value={pin}
            onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 4))}
            required
            autoComplete="off"
          />
        </div>
        <div className="settings-actions">
          <button type="submit" className="settings-btn-primary">Cambiar PIN</button>
        </div>
      </form>
    </div>
  );
};

export default ProfileSection;
