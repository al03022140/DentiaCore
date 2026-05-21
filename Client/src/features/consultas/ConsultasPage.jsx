import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button, Dropdown, Modal, Input, message } from 'antd';
import {
  PlusCircleOutlined,
  LeftOutlined,
  RightOutlined,
  CalendarOutlined,
  CheckCircleOutlined,
  PlayCircleOutlined,
  EditOutlined,
  CloseCircleOutlined,
  StopOutlined,
  MoreOutlined,
  CheckOutlined
} from '@ant-design/icons';
import './styles/consultas-page.css';
import userNot from '../../assets/images/icons/Profile Default.svg';
import {
  getAppointmentsByRange,
  updateAppointmentStatus,
  deleteAppointment,
  invalidateTodayAppointmentsCache,
  getAppointmentActivity
} from '../../shared/services/appointment-service';
import CreateAppointmentModal from './components/CreateAppointmentModal';

const formatTime = (dateStr) => {
  const d = new Date(dateStr);
  return d.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit', hour12: false });
};

const calculateAge = (fechaNacimiento) => {
  if (!fechaNacimiento) return '—';
  const birth = new Date(fechaNacimiento);
  const diff = Date.now() - birth.getTime();
  return Math.floor(diff / (365.25 * 24 * 60 * 60 * 1000));
};

const getPatientName = (apt) => {
  const p = apt.paciente_id;
  if (!p) return 'Paciente desconocido';
  const fullName = [p.primer_nombre, p.otros_nombres, p.apellido_paterno, p.apellido_materno]
    .filter(Boolean).join(' ').trim();
  return fullName || `${p.nombre || ''} ${p.apellidos || ''}`.trim() || 'Paciente desconocido';
};

const getPatientImage = (apt) => {
  const p = apt.paciente_id;
  const photo = p?.photoURL || p?.foto;
  if (!p || !photo) return null;
  return `${import.meta.env.VITE_API_URL || ''}/uploads/pacientes/${p._id}/${encodeURIComponent(photo)}`;
};

const statusMap = {
  Pendiente:  { cssClass: 'waiting',     label: 'Pendiente' },
  Confirmada: { cssClass: 'confirmed',   label: 'Confirmada' },
  EnCurso:    { cssClass: 'in-progress', label: 'En curso' },
  Pasada:     { cssClass: 'completed',   label: 'Terminada' },
  NoShow:     { cssClass: 'no-show',     label: 'No asistió' },
  Cancelada:  { cssClass: 'cancelled',   label: 'Cancelada' }
};

const formatHistorialDate = (dateStr) => {
  if (!dateStr) return '—';
  return new Date(dateStr).toLocaleString('es-MX', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
};

// Acciones disponibles según el estado actual
const ACTIONS_BY_STATE = {
  Pendiente:  ['confirmar', 'iniciar', 'cancelar', 'noShow', 'editar'],
  Confirmada: ['iniciar', 'atendida', 'cancelar', 'noShow', 'editar'],
  EnCurso:    ['atendida', 'cancelar'],
  Pasada:     [],
  NoShow:     [],
  Cancelada:  []
};

const startOfDay = (d) => {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
};
const endOfDay = (d) => {
  const x = new Date(d);
  x.setHours(23, 59, 59, 999);
  return x;
};
const dateLabel = (d) => {
  const today = startOfDay(new Date());
  const target = startOfDay(d);
  const diff = Math.round((target - today) / (24 * 60 * 60 * 1000));
  if (diff === 0) return 'Hoy';
  if (diff === -1) return 'Ayer';
  if (diff === 1) return 'Mañana';
  return target.toLocaleDateString('es-MX', { weekday: 'long', day: '2-digit', month: 'long' });
};

const ConsultasPage = () => {
  const navigate = useNavigate();
  const [selectedConsultation, setSelectedConsultation] = useState(null);
  const [nextPatient, setNextPatient] = useState(null);
  const [agenda, setAgenda] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editingAppointment, setEditingAppointment] = useState(null);
  const [currentDate, setCurrentDate] = useState(new Date());
  const [busyId, setBusyId] = useState(null);
  // Actividad clínica de la cita seleccionada (sólo cuando es estado cerrado o EnCurso)
  const [activity, setActivity] = useState(null);
  const [activityLoading, setActivityLoading] = useState(false);
  // Modal "Terminar consulta" — requiere escribir "confirmo"
  const [endingAppointment, setEndingAppointment] = useState(null);
  const [endConfirmText, setEndConfirmText] = useState('');
  const [endingInFlight, setEndingInFlight] = useState(false);

  const loadAgenda = useCallback(async (date) => {
    try {
      setLoading(true);
      const data = await getAppointmentsByRange({
        from: startOfDay(date).toISOString(),
        to: endOfDay(date).toISOString()
      });
      const arr = Array.isArray(data) ? data : (data?.items || []);
      setAgenda(arr);
    } catch {
      setAgenda([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadAgenda(currentDate); }, [currentDate, loadAgenda]);

  // Determine next patient & default selection
  useEffect(() => {
    const now = new Date();
    const isToday = startOfDay(currentDate).getTime() === startOfDay(now).getTime();

    const upcoming = agenda.filter(a =>
      !['Cancelada', 'Pasada', 'NoShow'].includes(a.estado) &&
      (!isToday || new Date(a.fecha_hora) >= now || a.estado === 'EnCurso')
    );
    const closed = agenda.filter(a => ['Pasada', 'NoShow', 'Cancelada'].includes(a.estado));

    // Conserva la selección del usuario si la cita sigue en la agenda, pero
    // siempre toma la versión fresca (puede haber cambiado de estado, motivo, etc.).
    const refreshed = (prev) => prev ? agenda.find(a => a._id === prev._id) : null;

    if (upcoming.length > 0) {
      setNextPatient(upcoming[0]);
      setSelectedConsultation(prev => refreshed(prev) || upcoming[0]);
    } else if (closed.length > 0) {
      setNextPatient(null);
      setSelectedConsultation(prev => refreshed(prev) || closed[0]);
    } else {
      setNextPatient(null);
      setSelectedConsultation(null);
    }
  }, [agenda, currentDate]);

  const handleSelectConsultation = (consultation) => {
    setSelectedConsultation(consultation);
  };

  // Cargar actividad clínica cuando la cita seleccionada está en estado cerrado o EnCurso
  useEffect(() => {
    if (!selectedConsultation) {
      setActivity(null);
      setActivityLoading(false);
      return;
    }
    const showActivity = ['EnCurso', 'Pasada', 'NoShow', 'Cancelada'].includes(selectedConsultation.estado);
    if (!showActivity) {
      setActivity(null);
      setActivityLoading(false);
      return;
    }
    let cancelled = false;
    // Limpiar de inmediato para evitar que se muestre la actividad de la
    // cita anterior mientras llega la nueva (parece "no actualiza").
    setActivity(null);
    setActivityLoading(true);
    (async () => {
      try {
        const data = await getAppointmentActivity(selectedConsultation._id);
        if (cancelled) return;
        setActivity(data);
      } catch (err) {
        if (cancelled) return;
        console.warn('Error al cargar actividad de la cita:', err);
        setActivity(null);
      } finally {
        if (!cancelled) setActivityLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [selectedConsultation?._id, selectedConsultation?.estado]);

  const handleStartConsultation = async (apt) => {
    const patientId = apt.paciente_id?._id || apt.paciente_id;
    if (!patientId) return;
    // Si está Pendiente o Confirmada, marcar EnCurso antes de navegar.
    if (apt.estado === 'Pendiente' || apt.estado === 'Confirmada') {
      try {
        await updateAppointmentStatus(apt._id, { estado: 'EnCurso' });
      } catch (err) {
        // No bloqueamos la navegación si falla — sólo aviso
        console.warn('No se pudo marcar EnCurso:', err);
      }
    }
    navigate(`/patient/${patientId}?appointmentId=${encodeURIComponent(apt._id)}`);
  };

  const runStatusChange = async (apt, estado, opts = {}) => {
    const { confirmTitle, requireReason, reasonPrompt } = opts;
    let motivo = null;
    if (requireReason) {
      motivo = window.prompt(reasonPrompt || 'Motivo:');
      if (!motivo || motivo.trim().length < 3) return;
    } else if (confirmTitle) {
      const ok = window.confirm(confirmTitle);
      if (!ok) return;
    }
    setBusyId(apt._id);
    try {
      await updateAppointmentStatus(apt._id, { estado, motivo: motivo ? motivo.trim() : undefined });
      message.success(`Cita marcada como ${statusMap[estado]?.label || estado}`);
      invalidateTodayAppointmentsCache();
      await loadAgenda(currentDate);
    } catch (err) {
      message.error(err?.response?.data?.message || 'No se pudo cambiar el estado');
    } finally {
      setBusyId(null);
    }
  };

  const openEndConsultation = (apt) => {
    setEndingAppointment(apt);
    setEndConfirmText('');
  };

  const closeEndConsultation = () => {
    if (endingInFlight) return;
    setEndingAppointment(null);
    setEndConfirmText('');
  };

  const handleEndConsultation = async () => {
    if (!endingAppointment) return;
    if (endConfirmText.trim().toLowerCase() !== 'confirmo') return;
    setEndingInFlight(true);
    try {
      await updateAppointmentStatus(endingAppointment._id, {
        estado: 'Pasada',
        motivo: 'Consulta finalizada por el doctor'
      });
      message.success('Consulta terminada');
      invalidateTodayAppointmentsCache();
      setEndingAppointment(null);
      setEndConfirmText('');
      await loadAgenda(currentDate);
    } catch (err) {
      message.error(err?.response?.data?.message || 'No se pudo terminar la consulta');
    } finally {
      setEndingInFlight(false);
    }
  };

  const handleDelete = async (apt) => {
    const motivo = window.prompt('Motivo de la eliminación (mínimo 5 caracteres):');
    if (!motivo || motivo.trim().length < 5) return;
    setBusyId(apt._id);
    try {
      await deleteAppointment(apt._id, motivo.trim());
      message.success('Cita eliminada');
      await loadAgenda(currentDate);
    } catch (err) {
      message.error(err?.response?.data?.message || 'No se pudo eliminar la cita');
    } finally {
      setBusyId(null);
    }
  };

  const handleEdit = (apt) => {
    setEditingAppointment(apt);
  };

  // Callback que llama el modal de Crear/Editar al terminar exitosamente.
  // - Si la cita es para otro día, navegamos al día de la cita (antes
  //   "desaparecía" porque la agenda seguía mostrando el día actual).
  // - Damos feedback del resultado de la sincronización a Google Calendar.
  const handleAppointmentSaved = ({ appointmentDate, gcalResult } = {}) => {
    invalidateTodayAppointmentsCache();
    if (appointmentDate) {
      const targetDay = startOfDay(appointmentDate);
      const currentDay = startOfDay(currentDate);
      if (targetDay.getTime() !== currentDay.getTime()) {
        setCurrentDate(targetDay);
        // setCurrentDate dispara el useEffect que recarga la agenda.
      } else {
        loadAgenda(currentDate);
      }
    } else {
      loadAgenda(currentDate);
    }

    if (gcalResult?.status === 'ok') {
      message.success('Cita guardada y sincronizada con Google Calendar');
    } else if (gcalResult?.status === 'failed') {
      message.warning('Cita guardada, pero no se pudo sincronizar con Google Calendar');
    } else {
      message.success('Cita guardada');
    }
  };

  const buildActionItems = (apt) => {
    const allowed = ACTIONS_BY_STATE[apt.estado] || [];
    const items = [];
    if (allowed.includes('confirmar')) items.push({
      key: 'confirmar',
      icon: <CheckOutlined />,
      label: 'Confirmar cita',
      onClick: () => runStatusChange(apt, 'Confirmada')
    });
    if (allowed.includes('iniciar')) items.push({
      key: 'iniciar',
      icon: <PlayCircleOutlined />,
      label: 'Iniciar consulta',
      onClick: () => handleStartConsultation(apt)
    });
    if (allowed.includes('atendida')) items.push({
      key: 'atendida',
      icon: <CheckCircleOutlined />,
      label: 'Marcar terminada',
      onClick: () => runStatusChange(apt, 'Pasada', { confirmTitle: '¿Marcar esta cita como terminada?' })
    });
    if (allowed.includes('editar')) items.push({
      key: 'editar',
      icon: <EditOutlined />,
      label: 'Editar / reagendar',
      onClick: () => handleEdit(apt)
    });
    if (allowed.length > 0) items.push({ type: 'divider' });
    if (allowed.includes('noShow')) items.push({
      key: 'noShow',
      icon: <StopOutlined />,
      label: 'No se presentó',
      danger: true,
      onClick: () => runStatusChange(apt, 'NoShow', { requireReason: true, reasonPrompt: 'Motivo del no-show:' })
    });
    if (allowed.includes('cancelar')) items.push({
      key: 'cancelar',
      icon: <CloseCircleOutlined />,
      label: 'Cancelar cita',
      danger: true,
      onClick: () => runStatusChange(apt, 'Cancelada', { requireReason: true, reasonPrompt: 'Motivo de cancelación:' })
    });
    items.push({
      key: 'eliminar',
      icon: <CloseCircleOutlined />,
      label: 'Eliminar (soft)',
      danger: true,
      onClick: () => handleDelete(apt)
    });
    return items;
  };

  const now = new Date();
  const isToday = startOfDay(currentDate).getTime() === startOfDay(now).getTime();

  const upcomingConsultations = useMemo(() => agenda.filter(a =>
    !['Cancelada', 'Pasada', 'NoShow'].includes(a.estado) &&
    (!isToday || new Date(a.fecha_hora) >= now || a.estado === 'EnCurso')
  ), [agenda, isToday]); // eslint-disable-line react-hooks/exhaustive-deps

  const completedConsultations = useMemo(() => agenda.filter(a =>
    ['Pasada', 'NoShow', 'Cancelada'].includes(a.estado)
  ), [agenda]);

  const agendaIsEmpty = !loading && agenda.length === 0;

  const renderItems = (items) => {
    if (!items || items.length === 0) {
      return <p className="consultas-inline-empty">Sin servicios asignados.</p>;
    }
    return (
      <ul className="plan-today-list">
        {items.map((item, idx) => (
          <li key={idx}>
            {item.nombre} — x{item.cantidad} — ${item.subtotal?.toLocaleString('es-MX')}
          </li>
        ))}
      </ul>
    );
  };

  const stepDate = (deltaDays) => {
    const d = new Date(currentDate);
    d.setDate(d.getDate() + deltaDays);
    setCurrentDate(d);
  };

  return (
    <div className="consultas-page">
      {/* --- COLUMNA IZQUIERDA --- */}
      <div className="consultas-left">

        {/* Panel Superior: Siguiente Paciente */}
        {loading ? (
          <div className="next-patient-card next-patient-card--loading">
            <p className="consultas-card-loading-text">Cargando agenda…</p>
          </div>
        ) : nextPatient ? (
          <div className="next-patient-card">
            {/* ── Fila 1: avatar · nombre · badge ── */}
            <div className="next-patient-header">
              <img
                src={getPatientImage(nextPatient) || userNot}
                alt={getPatientName(nextPatient)}
                className={`next-patient-avatar${getPatientImage(nextPatient) ? '' : ' profile-default-avatar'}`}
                width="40" height="40"
                onError={e => {
                  e.target.src = userNot;
                  e.target.classList.add('profile-default-avatar');
                }}
              />
              <div className="next-patient-info">
                <div className="next-patient-info-row">
                  <h2>{getPatientName(nextPatient)}</h2>
                  <span className={`badge-status ${statusMap[nextPatient.estado]?.cssClass || 'waiting'}`}>
                    {statusMap[nextPatient.estado]?.label || nextPatient.estado}
                  </span>
                </div>
                <span className="next-patient-time">
                  {nextPatient.estado === 'EnCurso' ? 'En curso' : 'Siguiente'} · {formatTime(nextPatient.fecha_hora)} hrs
                </span>
              </div>
            </div>

            {/* ── Fila 2: chips motivo / procedimiento ── */}
            {(nextPatient.motivo || nextPatient.comentarioProcedimiento) && (
              <div className="next-patient-chips">
                {nextPatient.motivo && (
                  <span className="next-patient-chip">
                    <strong>Motivo:</strong> {nextPatient.motivo}
                  </span>
                )}
                {nextPatient.comentarioProcedimiento && (
                  <span className="next-patient-chip">
                    <strong>Proc.:</strong> {nextPatient.comentarioProcedimiento}
                  </span>
                )}
              </div>
            )}

            {/* ── Fila 3: acciones ── */}
            <div className="next-patient-actions">
              {(nextPatient.estado === 'Pendiente' || nextPatient.estado === 'Confirmada' || nextPatient.estado === 'EnCurso') && (
                <button
                  type="button"
                  className="start-consultation-btn"
                  onClick={() => handleStartConsultation(nextPatient)}
                  disabled={busyId === nextPatient._id}
                >
                  {nextPatient.estado === 'EnCurso' ? 'Continuar consulta' : 'Iniciar consulta'}
                </button>
              )}
              {nextPatient.estado === 'EnCurso' && (
                <button
                  type="button"
                  className="end-consultation-btn"
                  onClick={() => openEndConsultation(nextPatient)}
                  disabled={busyId === nextPatient._id}
                >
                  Terminar
                </button>
              )}
              {nextPatient.estado === 'Pendiente' && (
                <button
                  type="button"
                  className="confirm-appointment-btn"
                  onClick={() => runStatusChange(nextPatient, 'Confirmada')}
                  disabled={busyId === nextPatient._id}
                >
                  Confirmar
                </button>
              )}
            </div>
          </div>
        ) : (
          <div className="next-patient-card next-patient-card--empty">
            <div className="next-patient-header">
              <img
                src={userNot}
                alt=""
                className="next-patient-avatar next-patient-avatar--placeholder profile-default-avatar"
              />
              <div className="next-patient-info">
                <span className="next-patient-time">
                  {agendaIsEmpty ? 'Agenda vacía' : 'Sin citas pendientes'}
                </span>
                <h2>
                  {agendaIsEmpty
                    ? `No hay citas para ${dateLabel(currentDate).toLowerCase()}`
                    : 'No hay más pacientes pendientes'}
                </h2>
                <p className="next-patient-empty-caption">
                  {agendaIsEmpty
                    ? 'Crea una cita con «Nueva cita» en la agenda.'
                    : 'Las citas restantes ya fueron atendidas o canceladas.'}
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Panel Inferior: Detalle de Selección — siempre visible con el mismo marco */}
        <div
          key={selectedConsultation?._id || 'empty'}
          className={`selected-detail-panel${selectedConsultation ? '' : ' selected-detail-panel--no-selection'}`}
        >
          <div className="detail-header-info">
            <div>
              <h3 style={{ margin: 0, color: 'var(--color-primary)' }}>Detalle de Cita</h3>
              <small>
                {selectedConsultation
                  ? `Seleccionada: ${getPatientName(selectedConsultation)}`
                  : (agendaIsEmpty ? 'No hay citas para este día' : 'Sin cita seleccionada')}
              </small>
            </div>
            {selectedConsultation && (
              <div className="patient-tags">
                <span>{calculateAge(selectedConsultation.paciente_id?.fecha_nacimiento)} años</span>
                {selectedConsultation.duracion && (
                  <span className="patient-tags__duration">{selectedConsultation.duracion} min</span>
                )}
              </div>
            )}
          </div>

          {!selectedConsultation ? (
            <div className="selected-detail-panel__placeholder">
              <p className="consultas-empty-state__text">
                {agendaIsEmpty
                  ? 'Cuando agregues citas, podrás ver aquí motivo, servicios, totales e historial.'
                  : 'Selecciona una cita de la agenda (pasada o futura) para ver su información completa.'}
              </p>
            </div>
          ) : (
            <>
            {/* Motivo + Procedimiento: si la cita seleccionada es la misma
                que ya se muestra arriba en la card "Próxima/Siguiente", los
                ocultamos aquí para no duplicar info. */}
            {String(selectedConsultation._id) !== String(nextPatient?._id) && (
              <>
                <div className="timeline-section">
                  <h4>Motivo</h4>
                  <p>{selectedConsultation.motivo}</p>
                </div>

                {selectedConsultation.comentarioProcedimiento && (
                  <div className="timeline-section">
                    <h4>Procedimiento</h4>
                    <p>{selectedConsultation.comentarioProcedimiento}</p>
                  </div>
                )}
              </>
            )}

            <div className="timeline-section">
              <h4>Servicios a realizar</h4>
              {renderItems(selectedConsultation.items)}
            </div>

            {selectedConsultation.totalEstimado > 0 && (
              <div className="timeline-section">
                <h4>Total estimado</h4>
                <p style={{ fontWeight: 'bold', color: 'var(--color-primary)' }}>
                  ${selectedConsultation.totalEstimado?.toLocaleString('es-MX')}
                </p>
              </div>
            )}

            {selectedConsultation.observaciones && (
              <div className="timeline-section">
                <h4>Observaciones</h4>
                <p>{selectedConsultation.observaciones}</p>
              </div>
            )}

            {Array.isArray(selectedConsultation.estadoHistorial) && selectedConsultation.estadoHistorial.length > 1 && (
              <div className="timeline-section">
                <h4>Historial de estado</h4>
                <ul className="estado-historial-list">
                  {selectedConsultation.estadoHistorial.slice().reverse().map((h, idx) => (
                    <li key={idx}>
                      <strong>{statusMap[h.hacia]?.label || h.hacia}</strong>
                      <span>{formatHistorialDate(h.cambiadoEn)}</span>
                      {h.motivo && <em>"{h.motivo}"</em>}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Actividad clínica registrada durante la cita (sólo cierre / curso) */}
            {['EnCurso', 'Pasada', 'NoShow', 'Cancelada'].includes(selectedConsultation.estado) && (
              <div className="timeline-section consulta-activity">
                <h4>Lo registrado en la consulta</h4>
                {activityLoading ? (
                  <p className="consultas-inline-empty">Cargando actividad…</p>
                ) : !activity || (
                    activity.counts &&
                    !activity.counts.evolutionNotes &&
                    !activity.counts.treatmentPlans &&
                    !activity.counts.odontogramaSnapshots &&
                    !activity.counts.periodontogramSnapshots &&
                    !activity.counts.exams &&
                    !activity.counts.charge &&
                    !activity.counts.directMovements
                  ) ? (
                  <p className="consultas-inline-empty">Sin registros vinculados a esta cita.</p>
                ) : (
                  <div className="consulta-activity__grid">
                    {activity.evolutionNotes?.length > 0 && (
                      <div className="consulta-activity__group">
                        <div className="consulta-activity__group-title">
                          Notas de evolución <span className="consulta-activity__count">{activity.evolutionNotes.length}</span>
                        </div>
                        <ul className="consulta-activity__list">
                          {activity.evolutionNotes.map(n => (
                            <li key={n._id}>
                              <strong>#{n.numero_procedimiento}</strong>
                              {n.procedimiento && <span>{n.procedimiento}</span>}
                              {n.observaciones && <em>{n.observaciones}</em>}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {activity.treatmentPlans?.length > 0 && (
                      <div className="consulta-activity__group">
                        <div className="consulta-activity__group-title">
                          Planes de tratamiento <span className="consulta-activity__count">{activity.treatmentPlans.length}</span>
                        </div>
                        <ul className="consulta-activity__list">
                          {activity.treatmentPlans.map(p => (
                            <li key={p._id}>
                              <span>{p.texto}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {activity.odontogramaSnapshots?.length > 0 && (
                      <div className="consulta-activity__group">
                        <div className="consulta-activity__group-title">
                          Odontograma <span className="consulta-activity__count">{activity.odontogramaSnapshots.length}</span>
                        </div>
                        <ul className="consulta-activity__list">
                          {activity.odontogramaSnapshots.map(s => (
                            <li key={s._id}>
                              <strong>{s.type === 'initial' ? 'Inicial' : 'Clínico'}</strong>
                              <span>{(s.datos || []).length} hallazgos</span>
                              <em>{new Date(s.savedAt).toLocaleString('es-MX', { hour: '2-digit', minute: '2-digit' })}</em>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {activity.periodontogramSnapshots?.length > 0 && (
                      <div className="consulta-activity__group">
                        <div className="consulta-activity__group-title">
                          Periodontograma <span className="consulta-activity__count">{activity.periodontogramSnapshots.length}</span>
                        </div>
                        <ul className="consulta-activity__list">
                          {activity.periodontogramSnapshots.map(s => (
                            <li key={s._id}>
                              <strong>{s.versionName}</strong>
                              {s.statistics && (
                                <span>
                                  Sangrado {Math.round(s.statistics.bleedingPercentage || 0)}% · Placa {Math.round(s.statistics.plaquePercentage || 0)}%
                                </span>
                              )}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {activity.exams?.length > 0 && (
                      <div className="consulta-activity__group">
                        <div className="consulta-activity__group-title">
                          Exámenes <span className="consulta-activity__count">{activity.exams.length}</span>
                        </div>
                        <ul className="consulta-activity__list">
                          {activity.exams.map(e => (
                            <li key={e._id}>
                              <strong>{e.tipo_examen}</strong>
                              <span>{e.estado}</span>
                              {e.observaciones && <em>{e.observaciones}</em>}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {activity.charge && (
                      <div className="consulta-activity__group">
                        <div className="consulta-activity__group-title">
                          Cobro
                          {activity.charge.saldoPendiente > 0 ? (
                            <span className="consulta-activity__count consulta-activity__count--warn">Pendiente</span>
                          ) : (
                            <span className="consulta-activity__count consulta-activity__count--ok">Pagado</span>
                          )}
                        </div>
                        <ul className="consulta-activity__list">
                          {(activity.charge.items || []).map((it, idx) => (
                            <li key={idx}>
                              <strong>{it.nombre}{it.cantidad > 1 ? ` ×${it.cantidad}` : ''}</strong>
                              <span>${(it.subtotal || 0).toLocaleString('es-MX')}</span>
                            </li>
                          ))}
                          <li className="consulta-activity__total">
                            <strong>Total</strong>
                            <span>${(activity.charge.total || 0).toLocaleString('es-MX')}</span>
                          </li>
                          {activity.charge.saldoPendiente > 0 && (
                            <li className="consulta-activity__total">
                              <strong>Saldo pendiente</strong>
                              <span>${activity.charge.saldoPendiente.toLocaleString('es-MX')}</span>
                            </li>
                          )}
                        </ul>
                      </div>
                    )}

                    {activity.directMovements?.length > 0 && (
                      <div className="consulta-activity__group">
                        <div className="consulta-activity__group-title">
                          Movimientos de caja <span className="consulta-activity__count">{activity.directMovements.length}</span>
                        </div>
                        <ul className="consulta-activity__list">
                          {activity.directMovements.map(m => (
                            <li key={m._id}>
                              <strong>{m.type === 'INCOME' ? '+' : '−'}${(m.amount || 0).toLocaleString('es-MX')}</strong>
                              <span>{m.concept}</span>
                              <em>{m.paymentMethod === 'CASH' ? 'Efectivo' : 'Digital'}</em>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            <div className="detail-actions">
              <button
                type="button"
                className="secondary-btn"
                onClick={() => {
                  const patientId = selectedConsultation.paciente_id?._id || selectedConsultation.paciente_id;
                  if (patientId) navigate(`/patient/${patientId}`);
                }}
              >
                Ver Expediente Completo
              </button>
            </div>
            </>
          )}
        </div>
      </div>

      {/* --- COLUMNA DERECHA --- */}
      <div className="consultas-right">
        <div className="consultas-right-header">
          <div className="consultas-right-header__title">
            <h3>Agenda</h3>
            <div className="consultas-date-stepper">
              <button
                type="button"
                className="consultas-date-stepper__btn"
                onClick={() => stepDate(-1)}
                title="Día anterior"
                aria-label="Día anterior"
              >
                <LeftOutlined />
              </button>
              <button
                type="button"
                className="consultas-date-stepper__label"
                onClick={() => setCurrentDate(new Date())}
                title="Volver a hoy"
              >
                <CalendarOutlined /> {dateLabel(currentDate)}
              </button>
              <button
                type="button"
                className="consultas-date-stepper__btn"
                onClick={() => stepDate(1)}
                title="Día siguiente"
                aria-label="Día siguiente"
              >
                <RightOutlined />
              </button>
            </div>
          </div>
          <Button
            type="primary"
            icon={<PlusCircleOutlined />}
            className="consultas-add-btn"
            onClick={() => setShowCreateModal(true)}
            title="Nueva cita"
          >
            Nueva cita
          </Button>
        </div>

        <div className="consultas-list-container">
          <div className="list-section-title">Próximas Consultas</div>
          {upcomingConsultations.length > 0 ? (
            upcomingConsultations.map(apt => {
              const total = apt.totalEstimado || 0;
              const itemCount = apt.items?.length || 0;
              const actionItems = buildActionItems(apt);
              return (
                <div
                  key={apt._id}
                  className={`consultation-item ${selectedConsultation?._id === apt._id ? 'active' : ''} ${apt.estado === 'EnCurso' ? 'in-progress' : ''}`}
                  onClick={() => handleSelectConsultation(apt)}
                >
                  <div className="consultation-time-box">
                    <span className="time-hour">{formatTime(apt.fecha_hora)}</span>
                    {apt.duracion && <span className="time-duration">{apt.duracion}m</span>}
                  </div>
                  <div className="consultation-info">
                    <span className="consultation-patient-name">{getPatientName(apt)}</span>
                    <span className="consultation-reason">{apt.motivo}</span>
                    {(itemCount > 0 || total > 0) && (
                      <span className="consultation-summary">
                        {itemCount > 0 && <span>{itemCount} {itemCount === 1 ? 'servicio' : 'servicios'}</span>}
                        {total > 0 && <span> · ${total.toLocaleString('es-MX')}</span>}
                      </span>
                    )}
                  </div>
                  <div className={`consultation-status badge-status ${statusMap[apt.estado]?.cssClass || 'waiting'}`}>
                    {statusMap[apt.estado]?.label || apt.estado}
                  </div>
                  <Dropdown
                    menu={{ items: actionItems }}
                    trigger={['click']}
                    placement="bottomRight"
                  >
                    <button
                      type="button"
                      className="consultation-actions-btn"
                      onClick={(e) => e.stopPropagation()}
                      disabled={busyId === apt._id}
                      aria-label="Acciones de la cita"
                    >
                      <MoreOutlined />
                    </button>
                  </Dropdown>
                </div>
              );
            })
          ) : (
            <div className="consultas-list-empty" role="status">
              No hay consultas pendientes.
            </div>
          )}

          <div className="list-section-title">Consultas Realizadas</div>
          {completedConsultations.length > 0 ? (
            completedConsultations.map(apt => (
              <div
                key={apt._id}
                className={`consultation-item completed ${selectedConsultation?._id === apt._id ? 'active' : ''}`}
                onClick={() => handleSelectConsultation(apt)}
              >
                <div className="consultation-time-box">
                  <span className="time-hour">{formatTime(apt.fecha_hora)}</span>
                </div>
                <div className="consultation-info">
                  <span className="consultation-patient-name">{getPatientName(apt)}</span>
                  <span className="consultation-reason">{apt.motivo}</span>
                </div>
                <div className={`consultation-status badge-status ${statusMap[apt.estado]?.cssClass || 'completed'}`}>
                  {statusMap[apt.estado]?.label || apt.estado}
                </div>
              </div>
            ))
          ) : (
            <div className="consultas-list-empty" role="status">
              Aún no hay consultas completadas.
            </div>
          )}
        </div>
      </div>

      <CreateAppointmentModal
        visible={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        onCreated={handleAppointmentSaved}
      />

      <CreateAppointmentModal
        visible={!!editingAppointment}
        appointment={editingAppointment}
        onClose={() => setEditingAppointment(null)}
        onCreated={handleAppointmentSaved}
      />

      <Modal
        title="Terminar consulta"
        open={!!endingAppointment}
        onCancel={closeEndConsultation}
        onOk={handleEndConsultation}
        okText="Terminar"
        cancelText="Cancelar"
        confirmLoading={endingInFlight}
        okButtonProps={{
          disabled: endConfirmText.trim().toLowerCase() !== 'confirmo' || endingInFlight
        }}
        destroyOnClose
        maskClosable={!endingInFlight}
      >
        {endingAppointment && (
          <div className="end-consultation-modal">
            <p className="end-consultation-modal__hint">
              Estás por cerrar la consulta de{' '}
              <strong>{getPatientName(endingAppointment)}</strong>. Esta acción marca la cita como{' '}
              <strong>atendida</strong> y queda registrada con todo lo que agregaste durante la sesión.
            </p>
            <p className="end-consultation-modal__instruction">
              Escribe <strong>confirmo</strong> para terminar:
            </p>
            <Input
              value={endConfirmText}
              onChange={(e) => setEndConfirmText(e.target.value)}
              placeholder="confirmo"
              autoFocus
              onPressEnter={() => {
                if (endConfirmText.trim().toLowerCase() === 'confirmo' && !endingInFlight) {
                  handleEndConsultation();
                }
              }}
            />
          </div>
        )}
      </Modal>
    </div>
  );
};

export default ConsultasPage;
