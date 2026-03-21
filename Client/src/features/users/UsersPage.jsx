import React, { useEffect, useMemo, useState } from 'react';
import API from '../../shared/services/axios-instance';
import PermissionGate from '../../app/auth/PermissionGate';
import './users.css';

const EMPTY_FORM = {
  nombre: '',
  email: '',
  contraseña: '',
  pin: '',
  confirmPin: '',
  rol: 'recepcionista'
};

const UsersPage = () => {
  const [users, setUsers] = useState([]);
  const [form, setForm] = useState(EMPTY_FORM);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);

  const loadUsers = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await API.get('/users');
      setUsers(response.data || []);
    } catch (err) {
      setError(err?.response?.data?.message || 'No se pudo cargar usuarios');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadUsers();
  }, []);

  const handleChange = (event) => {
    const { name, value } = event.target;
    const nextValue = name === 'pin' || name === 'confirmPin'
      ? value.replace(/\D/g, '').slice(0, 4)
      : value;
    setForm((prev) => ({ ...prev, [name]: nextValue }));
  };

  const handleCreate = async (event) => {
    event.preventDefault();
    setError(null);
    if (!/^\d{4}$/.test(form.pin)) {
      setError('El PIN es obligatorio y debe tener 4 dígitos');
      return;
    }
    if (form.pin !== form.confirmPin) {
      setError('La confirmación del PIN no coincide');
      return;
    }
    try {
      await API.post('/users', {
        nombre: form.nombre,
        email: form.email,
        contraseña: form.contraseña,
        pin: form.pin,
        rol: form.rol
      });
      setForm(EMPTY_FORM);
      await loadUsers();
    } catch (err) {
      setError(err?.response?.data?.message || 'No se pudo crear el usuario');
    }
  };

  const handleDisable = async (id) => {
    try {
      await API.patch(`/users/${id}/disable`);
      await loadUsers();
    } catch (err) {
      setError(err?.response?.data?.message || 'No se pudo desactivar el usuario');
    }
  };

  const renderStatus = (active) => (active ? 'Activo' : 'Desactivado');

  const roles = useMemo(() => (
    [
      { value: 'administrador', label: 'Administrador' },
      { value: 'doctor', label: 'Doctor' },
      { value: 'recepcionista', label: 'Recepcionista' },
      { value: 'asistente', label: 'Asistente' }
    ]
  ), []);

  return (
    <div className="users-page">
      <header className="users-header">
        <div>
          <h2>Usuarios</h2>
          <p>Gestiona accesos y roles del sistema.</p>
        </div>
      </header>

      {error && <div className="users-error">{error}</div>}

      <PermissionGate permissions={['users.create']}>
        <form className="users-form" onSubmit={handleCreate}>
          <input
            type="text"
            name="nombre"
            placeholder="Nombre"
            value={form.nombre}
            onChange={handleChange}
            required
          />
          <input
            type="email"
            name="email"
            placeholder="Email"
            value={form.email}
            onChange={handleChange}
            required
          />
          <input
            type="password"
            name="contraseña"
            placeholder="Contraseña"
            value={form.contraseña}
            onChange={handleChange}
            required
          />
          <input
            type="password"
            name="pin"
            placeholder="PIN de desbloqueo (4 dígitos)"
            value={form.pin}
            onChange={handleChange}
            inputMode="numeric"
            pattern="\d{4}"
            maxLength={4}
            required
          />
          <input
            type="password"
            name="confirmPin"
            placeholder="Confirmar PIN"
            value={form.confirmPin}
            onChange={handleChange}
            inputMode="numeric"
            pattern="\d{4}"
            maxLength={4}
            required
          />
          <select name="rol" value={form.rol} onChange={handleChange}>
            {roles.map((role) => (
              <option key={role.value} value={role.value}>
                {role.label}
              </option>
            ))}
          </select>
          <button type="submit">Crear usuario</button>
        </form>
      </PermissionGate>

      <div className="users-table">
        {isLoading ? (
          <div className="users-loading">Cargando usuarios...</div>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Nombre</th>
                <th>Email</th>
                <th>Rol</th>
                <th>Estado</th>
                <th>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {users.map((user) => (
                <tr key={user._id}>
                  <td>{user.nombre}</td>
                  <td>{user.email}</td>
                  <td>{user.rol}</td>
                  <td>{renderStatus(user.active)}</td>
                  <td>
                    <PermissionGate
                      permissions={['users.disable']}
                      fallback={<span className="users-disabled">Sin permisos</span>}
                    >
                      <button
                        type="button"
                        className="users-disable"
                        onClick={() => handleDisable(user._id)}
                        disabled={!user.active}
                      >
                        Desactivar
                      </button>
                    </PermissionGate>
                  </td>
                </tr>
              ))}
              {!users.length && (
                <tr>
                  <td colSpan="5">No hay usuarios registrados.</td>
                </tr>
              )}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
};

export default UsersPage;
