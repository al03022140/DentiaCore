import React, { useState, useEffect } from 'react';
import { createAppointment } from '../../../shared/services/appointment-service';
import { getSettings } from '../../../shared/services/settingsService';
import API from '../../../shared/services/axios-instance';
import { getAllPatients } from '../../../shared/services/api';
import userNot from '../../../assets/images/icons/Profile Default.svg';
import './CreateAppointmentModal.css';

const CreateAppointmentModal = ({ visible, onClose, onCreated, fixedPatient = null }) => {
  // Patient search
  const [patientQuery, setPatientQuery] = useState('');
  const [patientResults, setPatientResults] = useState([]);
  const [selectedPatient, setSelectedPatient] = useState(null);
  const [allPatients, setAllPatients] = useState([]);

  // Doctor
  const [doctors, setDoctors] = useState([]);
  const [selectedDoctor, setSelectedDoctor] = useState('');

  // Appointment fields
  const [fechaHora, setFechaHora] = useState('');
  const [motivo, setMotivo] = useState('');
  const [comentario, setComentario] = useState('');

  // Items
  const [serviceCatalog, setServiceCatalog] = useState([]);
  const [items, setItems] = useState([]);

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  // Load doctors, service catalog & patients when modal opens
  useEffect(() => {
    if (!visible) return;
    const loadData = async () => {
      try {
        const [usersRes, settings, patientsRes] = await Promise.all([
          API.get('/users').then(r => r.data).catch(() => []),
          getSettings().catch(() => ({})),
          getAllPatients().catch(() => ({}))
        ]);
        const usersList = Array.isArray(usersRes) ? usersRes : (usersRes.users || []);
        setDoctors(usersList.filter(u => u.role === 'doctor' || u.role === 'superadmin' || u.role === 'administrador'));
        setServiceCatalog(settings.serviceCatalog || []);
        const patientsList = Array.isArray(patientsRes) ? patientsRes : (patientsRes?.patients ?? patientsRes ?? []);
        setAllPatients(patientsList);
      } catch {
        setDoctors([]);
        setServiceCatalog([]);
        setAllPatients([]);
      }
    };
    loadData();
  }, [visible]);

  // Reset state when modal opens
  useEffect(() => {
    if (visible) {
      setSelectedPatient(fixedPatient || null);
      setPatientQuery('');
      setPatientResults([]);
      setSelectedDoctor('');
      setFechaHora('');
      setMotivo('');
      setComentario('');
      setItems([]);
      setError('');
      setSaving(false);
    }
  }, [visible, fixedPatient]);

  // Filter patients locally (instant, no extra API calls)
  useEffect(() => {
    if (!patientQuery || patientQuery.length < 2) {
      setPatientResults([]);
      return;
    }
    const q = patientQuery.toLowerCase().trim();
    const filtered = allPatients.filter(p => {
      const haystack = [
        p.primer_nombre, p.otros_nombres,
        p.apellido_paterno, p.apellido_materno
      ].filter(Boolean).join(' ').toLowerCase();
      return haystack.includes(q);
    }).slice(0, 8);
    setPatientResults(filtered);
  }, [patientQuery, allPatients]);

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

  // Helper: read Google access token stored by the calendar widget
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

  // Try to refresh an expired Google token
  const refreshGoogleToken = async () => {
    try {
      const raw = localStorage.getItem('accessToken');
      if (!raw || !raw.startsWith('{')) return null;
      const parsed = JSON.parse(raw);
      if (!parsed.refreshToken) return null;
      const API = import.meta.env.VITE_API_URL || 'http://localhost:5002';
      const res = await fetch(`${API}/api/google/refresh-token`, {
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

  const handleCreate = async () => {
    setError('');
    if (!selectedPatient) return setError('Seleccione un paciente');
    if (!selectedDoctor) return setError('Seleccione un doctor');
    if (!fechaHora) return setError('Seleccione fecha y hora');
    if (!motivo.trim()) return setError('Escriba un motivo para la cita');

    setSaving(true);
    try {
      await createAppointment({
        paciente_id: selectedPatient._id,
        doctor_id: selectedDoctor,
        fecha_hora: new Date(fechaHora).toISOString(),
        motivo: motivo.trim(),
        observaciones: '',
        comentarioProcedimiento: comentario.trim() || undefined,
        items: items.length > 0 ? items.map(i => ({
          nombre: i.nombre,
          cantidad: Number(i.cantidad),
          precioUnitario: Number(i.precioUnitario)
        })) : undefined
      });

      // Sync to Google Calendar if the user is authenticated with Google
      let googleToken = getGoogleToken();
      if (!googleToken) googleToken = await refreshGoogleToken();
      if (googleToken) {
        const patientName = getPatientFullName(selectedPatient);
        const doctorObj = doctors.find(d => d._id === selectedDoctor);
        const doctorName = doctorObj ? `${doctorObj.nombre} ${doctorObj.apellidos || ''}`.trim() : '';
        const start = new Date(fechaHora);
        const end = new Date(start.getTime() + 60 * 60 * 1000); // default 1h duration
        const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
        const gcalEvent = {
          summary: `Cita: ${patientName}${doctorName ? ` — Dr. ${doctorName}` : ''}`,
          description: [
            `Motivo: ${motivo.trim()}`,
            comentario.trim() ? `Procedimiento: ${comentario.trim()}` : null,
          ].filter(Boolean).join('\n'),
          start: { dateTime: start.toISOString(), timeZone },
          end: { dateTime: end.toISOString(), timeZone },
          calendarId: localStorage.getItem('google_selected_calendar') || 'primary',
        };
        // Fire-and-forget: don't block the UI if GCal sync fails
        fetch(`${import.meta.env.VITE_API_URL || 'http://localhost:5002'}/api/google/calendar/events`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${googleToken}`, 'Content-Type': 'application/json' },
          body: JSON.stringify(gcalEvent),
        }).catch(() => {});
      }

      onCreated?.();
      onClose();
    } catch (err) {
      setError(err?.response?.data?.message || err?.message || 'Error al crear la cita');
    } finally {
      setSaving(false);
    }
  };

  if (!visible) return null;

  return (
    <div className="cam-overlay" onClick={onClose}>
      <div className="cam-modal" onClick={e => e.stopPropagation()}>
        <div className="cam-header">
          <h2>Nueva Cita</h2>
          <button className="cam-close-btn" onClick={onClose}>&times;</button>
        </div>

        <div className="cam-body">
          {/* ── Paciente ── */}
          <div className="cam-section">
            <label className="cam-label">Paciente</label>
            {selectedPatient ? (
              <div className={`cam-patient-card ${fixedPatient ? 'cam-patient-card--fixed' : ''}`}>
                <img
                  src={selectedPatient.foto ? `${import.meta.env.VITE_API_URL || ''}/uploads/pacientes/${selectedPatient._id}/${selectedPatient.foto}` : userNot}
                  alt={getPatientFullName(selectedPatient)}
                  className={`cam-patient-avatar${selectedPatient.foto ? '' : ' profile-default-avatar'}`}
                  onError={e => {
                    e.target.src = userNot;
                    e.target.classList.add('profile-default-avatar');
                  }}
                />
                <div className="cam-patient-info">
                  <strong>{getPatientFullName(selectedPatient)}</strong>
                  <span>{calculateAge(selectedPatient.fecha_nacimiento)} años</span>
                </div>
                {!fixedPatient && (
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
                {patientQuery.length >= 2 && patientResults.length === 0 && <span className="cam-searching">Sin resultados</span>}
                {patientResults.length > 0 && (
                  <ul className="cam-search-results">
                    {patientResults.map(p => (
                      <li key={p._id} onClick={() => selectPatient(p)}>
                        <img
                          src={p.foto ? `${import.meta.env.VITE_API_URL || ''}/uploads/pacientes/${p._id}/${p.foto}` : userNot}
                          alt={getPatientFullName(p)}
                          className={`cam-result-avatar${p.foto ? '' : ' profile-default-avatar'}`}
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
                <option key={d._id} value={d._id}>{d.nombre} {d.apellidos || ''}</option>
              ))}
            </select>
          </div>

          {/* ── Fecha y Hora ── */}
          <div className="cam-section">
            <label className="cam-label">Fecha y Hora</label>
            <input
              type="datetime-local"
              className="cam-input"
              value={fechaHora}
              onChange={e => setFechaHora(e.target.value)}
            />
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
          <button className="cam-btn cam-btn--primary" onClick={handleCreate} disabled={saving}>
            {saving ? 'Creando...' : 'Crear Cita'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default CreateAppointmentModal;
