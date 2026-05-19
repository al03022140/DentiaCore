import React, { useState, useEffect, useRef } from 'react';
import {
  createAppointment,
  updateAppointment,
  searchPatients
} from '../../../shared/services/appointment-service';
import { getSettings } from '../../../shared/services/settingsService';
import API from '../../../shared/services/axios-instance';
import userNot from '../../../assets/images/icons/Profile Default.svg';
import './CreateAppointmentModal.css';

const DURATION_PRESETS = [15, 20, 30, 45, 60, 90, 120];

const CreateAppointmentModal = ({
  visible,
  onClose,
  onCreated,
  fixedPatient = null,
  appointment = null
}) => {
  const isEditing = !!appointment;

  // Patient search
  const [patientQuery, setPatientQuery] = useState('');
  const [patientResults, setPatientResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [selectedPatient, setSelectedPatient] = useState(null);
  const searchTimer = useRef(null);

  // Doctor
  const [doctors, setDoctors] = useState([]);
  const [selectedDoctor, setSelectedDoctor] = useState('');

  // Appointment fields
  const [fechaHora, setFechaHora] = useState('');
  const [duracion, setDuracion] = useState(30);
  const [motivo, setMotivo] = useState('');
  const [comentario, setComentario] = useState('');

  // Items
  const [serviceCatalog, setServiceCatalog] = useState([]);
  const [items, setItems] = useState([]);

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  // `min` para datetime-local — para creación. En edición permitimos
  // mantener la fecha original aunque sea pasada (mostrar histórico).
  const nowLocalISO = (() => {
    const d = new Date();
    const offset = d.getTimezoneOffset() * 60_000;
    return new Date(d.getTime() - offset).toISOString().slice(0, 16);
  })();

  // Convierte un Date a YYYY-MM-DDTHH:mm en hora local (para el input).
  const toLocalInput = (date) => {
    const d = new Date(date);
    const offset = d.getTimezoneOffset() * 60_000;
    return new Date(d.getTime() - offset).toISOString().slice(0, 16);
  };

  // Load doctors & service catalog when modal opens
  useEffect(() => {
    if (!visible) return;
    const loadData = async () => {
      try {
        const [usersRes, settings] = await Promise.all([
          API.get('/users').then(r => r.data).catch(() => []),
          getSettings().catch(() => ({}))
        ]);
        const usersList = Array.isArray(usersRes) ? usersRes : (usersRes.users || []);
        setDoctors(usersList.filter(u => u.rol === 'doctor' || u.rol === 'superadmin' || u.rol === 'administrador'));
        setServiceCatalog(settings.serviceCatalog || []);
        if (settings.defaultAppointmentDuration && !appointment) {
          setDuracion(settings.defaultAppointmentDuration);
        }
      } catch {
        setDoctors([]);
        setServiceCatalog([]);
      }
    };
    loadData();
  }, [visible, appointment]);

  // Reset / preload state when modal opens
  useEffect(() => {
    if (!visible) return;

    if (appointment) {
      // Modo edición: precargar desde la cita
      setSelectedPatient(appointment.paciente_id || null);
      setPatientQuery('');
      setPatientResults([]);
      setSelectedDoctor(appointment.doctor_id?._id || appointment.doctor_id || '');
      setFechaHora(toLocalInput(appointment.fecha_hora));
      setDuracion(appointment.duracion || 30);
      setMotivo(appointment.motivo || '');
      setComentario(appointment.comentarioProcedimiento || '');
      setItems((appointment.items || []).map(i => ({
        nombre: i.nombre,
        cantidad: i.cantidad,
        precioUnitario: i.precioUnitario
      })));
    } else {
      // Modo creación
      setSelectedPatient(fixedPatient || null);
      setPatientQuery('');
      setPatientResults([]);
      setSelectedDoctor('');
      setFechaHora('');
      setDuracion(30);
      setMotivo('');
      setComentario('');
      setItems([]);
    }
    setError('');
    setSaving(false);
  }, [visible, fixedPatient, appointment]);

  // Server-side patient search con debounce 250ms
  useEffect(() => {
    if (selectedPatient || !patientQuery || patientQuery.length < 2) {
      setPatientResults([]);
      setSearching(false);
      return;
    }
    if (searchTimer.current) clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(async () => {
      setSearching(true);
      try {
        const res = await searchPatients(patientQuery, { limit: 8 });
        setPatientResults(res);
      } catch {
        setPatientResults([]);
      } finally {
        setSearching(false);
      }
    }, 250);
    return () => clearTimeout(searchTimer.current);
  }, [patientQuery, selectedPatient]);

  const getPatientFullName = (p) => {
    if (!p) return '';
    if (p.nombre && p.apellidos) return `${p.nombre} ${p.apellidos}`.trim();
    return [p.primer_nombre, (p.otros_nombres || p.segundo_nombre), p.apellido_paterno, p.apellido_materno]
      .filter(Boolean).join(' ');
  };

  const calculateAge = (fechaNacimiento) => {
    if (!fechaNacimiento) return '—';
    const birth = new Date(fechaNacimiento);
    const diff = Date.now() - birth.getTime();
    return Math.floor(diff / (365.25 * 24 * 60 * 60 * 1000));
  };

  const selectPatient = (patient) => {
    setSelectedPatient(patient);
    setPatientQuery('');
    setPatientResults([]);
  };

  const addItemFromCatalog = (svc) => {
    if (items.some(i => i.nombre === svc.nombre)) return;
    setItems(prev => [...prev, {
      nombre: svc.nombre,
      cantidad: 1,
      precioUnitario: svc.precioDefault
    }]);
  };

  const updateItem = (index, field, value) => {
    setItems(prev => prev.map((item, i) =>
      i === index ? { ...item, [field]: value } : item
    ));
  };

  const removeItem = (index) => {
    setItems(prev => prev.filter((_, i) => i !== index));
  };

  const total = items.reduce((sum, item) => {
    return sum + (Number(item.cantidad) || 0) * (Number(item.precioUnitario) || 0);
  }, 0);

  // ── Google Calendar helpers (sólo en create por ahora) ──
  const getGoogleToken = () => {
    try {
      const raw = localStorage.getItem('accessToken');
      if (!raw) return null;
      if (!raw.startsWith('{')) return raw;
      const parsed = JSON.parse(raw);
      if (parsed.token && parsed.expiration && parsed.expiration > Date.now()) return parsed.token;
      return null;
    } catch {
      return null;
    }
  };

  const refreshGoogleToken = async () => {
    try {
      const raw = localStorage.getItem('accessToken');
      if (!raw || !raw.startsWith('{')) return null;
      const parsed = JSON.parse(raw);
      if (!parsed.refreshToken) return null;
      const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5002';
      const res = await fetch(`${API_URL}/api/google/refresh-token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken: parsed.refreshToken }),
      });
      if (!res.ok) return null;
      const data = await res.json();
      const expiration = Date.now() + (data.expiresIn || 3600) * 1000;
      localStorage.setItem('accessToken', JSON.stringify({
        token: data.accessToken, expiration, refreshToken: data.refreshToken || parsed.refreshToken,
      }));
      return data.accessToken;
    } catch { return null; }
  };

  const syncToGoogle = async (gcalEvent) => {
    let googleToken = getGoogleToken();
    if (!googleToken) googleToken = await refreshGoogleToken();
    if (!googleToken) return;
    const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5002';
    fetch(`${API_URL}/api/google/calendar/events`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${googleToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(gcalEvent),
    }).catch(() => {});
  };

  const handleSave = async () => {
    setError('');
    if (!selectedPatient) return setError('Seleccione un paciente');
    if (!selectedDoctor) return setError('Seleccione un doctor');
    if (!fechaHora) return setError('Seleccione fecha y hora');
    if (!motivo.trim()) return setError('Escriba un motivo para la cita');

    setSaving(true);
    try {
      const payload = {
        paciente_id: selectedPatient._id,
        doctor_id: selectedDoctor,
        fecha_hora: new Date(fechaHora).toISOString(),
        duracion: Number(duracion) || 30,
        motivo: motivo.trim(),
        observaciones: '',
        comentarioProcedimiento: comentario.trim() || undefined,
        items: items.length > 0 ? items.map(i => ({
          nombre: i.nombre,
          cantidad: Number(i.cantidad),
          precioUnitario: Number(i.precioUnitario)
        })) : []
      };

      if (isEditing) {
        await updateAppointment(appointment._id, payload);
      } else {
        await createAppointment(payload);

        // Sólo sincronizamos a GCal en creación. El update bidireccional
        // requiere guardar el googleEventId; queda como mejora futura.
        const patientName = getPatientFullName(selectedPatient);
        const doctorObj = doctors.find(d => d._id === selectedDoctor);
        const doctorName = doctorObj ? doctorObj.nombre : '';
        const start = new Date(fechaHora);
        const end = new Date(start.getTime() + (Number(duracion) || 30) * 60_000);
        const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
        await syncToGoogle({
          summary: `Cita: ${patientName}${doctorName ? ` — Dr. ${doctorName}` : ''}`,
          description: [
            `Motivo: ${motivo.trim()}`,
            comentario.trim() ? `Procedimiento: ${comentario.trim()}` : null,
          ].filter(Boolean).join('\n'),
          start: { dateTime: start.toISOString(), timeZone },
          end: { dateTime: end.toISOString(), timeZone },
          calendarId: localStorage.getItem('google_selected_calendar') || 'primary',
        });
      }

      onCreated?.();
      onClose();
    } catch (err) {
      // Si vino conflicto (409), informar de la cita en conflicto
      const status = err?.response?.status;
      const data = err?.response?.data;
      if (status === 409 && data?.conflict) {
        const c = data.conflict;
        const when = new Date(c.fecha_hora).toLocaleString('es-MX');
        setError(`Conflicto: ${when} (${c.duracion} min) — ${c.motivo || 'otra cita'}`);
      } else {
        setError(data?.message || err?.message || 'Error al guardar la cita');
      }
    } finally {
      setSaving(false);
    }
  };

  if (!visible) return null;

  return (
    <div className="cam-overlay" onClick={onClose}>
      <div className="cam-modal" onClick={e => e.stopPropagation()}>
        <div className="cam-header">
          <h2>{isEditing ? 'Editar Cita' : 'Nueva Cita'}</h2>
          <button className="cam-close-btn" onClick={onClose}>&times;</button>
        </div>

        <div className="cam-body">
          {/* ── Paciente ── */}
          <div className="cam-section">
            <label className="cam-label">Paciente</label>
            {selectedPatient ? (
              <div className={`cam-patient-card ${(fixedPatient || isEditing) ? 'cam-patient-card--fixed' : ''}`}>
                <img
                  src={(selectedPatient.photoURL || selectedPatient.foto) ? `${import.meta.env.VITE_API_URL || ''}/uploads/pacientes/${selectedPatient._id}/${encodeURIComponent(selectedPatient.photoURL || selectedPatient.foto)}` : userNot}
                  alt={getPatientFullName(selectedPatient)}
                  className={`cam-patient-avatar${(selectedPatient.photoURL || selectedPatient.foto) ? '' : ' profile-default-avatar'}`}
                  onError={e => {
                    e.target.src = userNot;
                    e.target.classList.add('profile-default-avatar');
                  }}
                />
                <div className="cam-patient-info">
                  <strong>{getPatientFullName(selectedPatient)}</strong>
                  <span>{calculateAge(selectedPatient.fecha_nacimiento)} años</span>
                </div>
                {!fixedPatient && !isEditing && (
                  <button className="cam-remove-btn" onClick={() => setSelectedPatient(null)}>&times;</button>
                )}
              </div>
            ) : (
              <div className="cam-search-wrapper">
                <input
                  type="text"
                  className="cam-input"
                  placeholder="Buscar paciente por nombre..."
                  value={patientQuery}
                  onChange={e => setPatientQuery(e.target.value)}
                />
                {searching && <span className="cam-searching">Buscando…</span>}
                {!searching && patientQuery.length >= 2 && patientResults.length === 0 && (
                  <span className="cam-searching">Sin resultados</span>
                )}
                {patientResults.length > 0 && (
                  <ul className="cam-search-results">
                    {patientResults.map(p => (
                      <li key={p._id} onClick={() => selectPatient(p)}>
                        <img
                          src={(p.photoURL || p.foto) ? `${import.meta.env.VITE_API_URL || ''}/uploads/pacientes/${p._id}/${encodeURIComponent(p.photoURL || p.foto)}` : userNot}
                          alt={getPatientFullName(p)}
                          className={`cam-result-avatar${(p.photoURL || p.foto) ? '' : ' profile-default-avatar'}`}
                          onError={e => {
                            e.target.src = userNot;
                            e.target.classList.add('profile-default-avatar');
                          }}
                        />
                        <div>
                          <strong>{getPatientFullName(p)}</strong>
                          <span className="cam-result-age">{calculateAge(p.fecha_nacimiento)} años</span>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </div>

          {/* ── Doctor ── */}
          <div className="cam-section">
            <label className="cam-label">Doctor</label>
            <select className="cam-input" value={selectedDoctor} onChange={e => setSelectedDoctor(e.target.value)}>
              <option value="">Seleccionar doctor...</option>
              {doctors.map(d => (
                <option key={d._id} value={d._id}>{d.nombre}</option>
              ))}
            </select>
          </div>

          {/* ── Fecha, Hora y Duración ── */}
          <div className="cam-section cam-section--row">
            <div className="cam-section cam-section--grow">
              <label className="cam-label">Fecha y Hora</label>
              <input
                type="datetime-local"
                className="cam-input"
                min={isEditing ? undefined : nowLocalISO}
                value={fechaHora}
                onChange={e => setFechaHora(e.target.value)}
              />
            </div>
            <div className="cam-section">
              <label className="cam-label">Duración</label>
              <select
                className="cam-input"
                value={duracion}
                onChange={e => setDuracion(Number(e.target.value))}
              >
                {DURATION_PRESETS.map(d => (
                  <option key={d} value={d}>{d} min</option>
                ))}
              </select>
            </div>
          </div>

          {/* ── Motivo ── */}
          <div className="cam-section">
            <label className="cam-label">Motivo de la cita</label>
            <input
              type="text"
              className="cam-input"
              placeholder="Ej: Limpieza, Revisión, Extracción..."
              value={motivo}
              onChange={e => setMotivo(e.target.value)}
            />
          </div>

          {/* ── Comentario del Procedimiento ── */}
          <div className="cam-section">
            <label className="cam-label">¿Qué se le va a hacer? (comentario)</label>
            <textarea
              className="cam-input cam-textarea"
              placeholder="Descripción breve del procedimiento..."
              value={comentario}
              onChange={e => setComentario(e.target.value)}
              rows={3}
            />
          </div>

          {/* ── Items / Servicios ── */}
          <div className="cam-section">
            <label className="cam-label">Servicios a cobrar</label>
            {serviceCatalog.length > 0 ? (
              <div className="cam-catalog-pills">
                {serviceCatalog.map(svc => (
                  <button
                    key={svc.nombre}
                    className={`cam-pill ${items.some(i => i.nombre === svc.nombre) ? 'cam-pill--active' : ''}`}
                    onClick={() => addItemFromCatalog(svc)}
                    disabled={items.some(i => i.nombre === svc.nombre)}
                    type="button"
                  >
                    {svc.nombre} — ${svc.precioDefault?.toLocaleString('es-MX')}
                  </button>
                ))}
              </div>
            ) : (
              <p className="cam-no-catalog">No hay servicios configurados. Agrégalos en Configuración &gt; Caja.</p>
            )}

            {items.length > 0 && (
              <table className="cam-items-table">
                <thead>
                  <tr>
                    <th>Servicio</th>
                    <th>Cant.</th>
                    <th>Precio</th>
                    <th>Subtotal</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((item, idx) => {
                    const subtotal = (Number(item.cantidad) || 0) * (Number(item.precioUnitario) || 0);
                    return (
                      <tr key={idx}>
                        <td>{item.nombre}</td>
                        <td>
                          <input
                            type="number"
                            min="1"
                            className="cam-item-input"
                            value={item.cantidad}
                            onChange={e => updateItem(idx, 'cantidad', e.target.value)}
                          />
                        </td>
                        <td>
                          <input
                            type="number"
                            min="0"
                            className="cam-item-input"
                            value={item.precioUnitario}
                            onChange={e => updateItem(idx, 'precioUnitario', e.target.value)}
                          />
                        </td>
                        <td>${subtotal.toLocaleString('es-MX')}</td>
                        <td>
                          <button className="cam-remove-item" onClick={() => removeItem(idx)} type="button">&times;</button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr>
                    <td colSpan="3" style={{ textAlign: 'right', fontWeight: 'bold' }}>Total:</td>
                    <td colSpan="2" style={{ fontWeight: 'bold' }}>${total.toLocaleString('es-MX')}</td>
                  </tr>
                </tfoot>
              </table>
            )}
          </div>

          {error && <div className="cam-error">{error}</div>}
        </div>

        <div className="cam-footer">
          <button className="cam-btn cam-btn--secondary" onClick={onClose} disabled={saving}>
            Cancelar
          </button>
          <button className="cam-btn cam-btn--primary" onClick={handleSave} disabled={saving}>
            {saving
              ? (isEditing ? 'Guardando...' : 'Creando...')
              : (isEditing ? 'Guardar cambios' : 'Crear Cita')}
          </button>
        </div>
      </div>
    </div>
  );
};

export default CreateAppointmentModal;
