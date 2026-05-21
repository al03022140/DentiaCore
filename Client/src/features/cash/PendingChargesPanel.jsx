import { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { getAllChargesWithMeta } from '../../shared/services/patientChargeService';
import { formatMoney } from '../../shared/utils/money';
import userNot from '../../assets/images/icons/Profile Default.svg';

const calculateAge = (fechaNacimiento) => {
  if (!fechaNacimiento) return null;
  const diff = Date.now() - new Date(fechaNacimiento).getTime();
  return Math.floor(diff / (365.25 * 24 * 60 * 60 * 1000));
};

const PendingChargesPanel = ({ refreshTrigger, isBoxOpen = true }) => {
  const navigate = useNavigate();
  const [charges, setCharges] = useState([]);
  const [total, setTotal] = useState(0);
  const [orphanCount, setOrphanCount] = useState(0);
  const [loading, setLoading] = useState(true);

  const fetchCharges = useCallback(async () => {
    try {
      // BUG-B6: usamos meta para mostrar "N de M pendientes" si excede la página
      const data = await getAllChargesWithMeta(true);
      const list = Array.isArray(data?.charges) ? data.charges : (Array.isArray(data) ? data : []);
      // A4: filtrar cobros sin paciente (huérfanos por soft-delete del paciente).
      // No se navegar a ellos y confunden al usuario; los contamos aparte para
      // dejar rastro visible en la cabecera.
      const withPatient = list.filter((c) => c?.patientId?._id);
      // Cada sesión de caja representa un día nuevo: en este panel sólo
      // mostramos cobros de citas del día en curso. Los pendientes viejos
      // siguen accesibles desde la ficha del paciente.
      const startOfDay = new Date();
      startOfDay.setHours(0, 0, 0, 0);
      const endOfDay = new Date();
      endOfDay.setHours(23, 59, 59, 999);
      const visible = withPatient.filter((c) => {
        const ts = c?.appointmentId?.fecha_hora || c?.fecha;
        if (!ts) return false;
        const t = new Date(ts).getTime();
        return t >= startOfDay.getTime() && t <= endOfDay.getTime();
      });
      setCharges(visible);
      setOrphanCount(list.length - withPatient.length);
      setTotal(visible.length);
    } catch {
      setCharges([]);
      setTotal(0);
      setOrphanCount(0);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!isBoxOpen) {
      setCharges([]);
      setTotal(0);
      setOrphanCount(0);
      setLoading(false);
      return;
    }
    fetchCharges();
  }, [fetchCharges, refreshTrigger, isBoxOpen]);

  const goToPatient = (patientId) => {
    if (patientId) navigate(`/patient/${patientId}`);
  };

  return (
    <div className="cash-card pending-charges-panel">
      <div className="cash-card__header">
        <h2 className="cash-card__title">Cobros de Citas</h2>
        <span className="pending-charges-panel__count">
          {total > charges.length
            ? `${charges.length} de ${total} pendientes`
            : `${charges.length} pendiente${charges.length !== 1 ? 's' : ''}`}
          {orphanCount > 0 && (
            <span
              className="pending-charges-panel__orphan-tag"
              title="Cobros sin paciente vinculado (paciente eliminado). No se muestran."
            >
              {' '}· {orphanCount} sin paciente
            </span>
          )}
        </span>
      </div>

      {loading ? (
        <p className="pending-charges-panel__empty">Cargando...</p>
      ) : !isBoxOpen ? (
        <p className="pending-charges-panel__empty">Caja cerrada — abre una sesión para ver los cobros del día.</p>
      ) : charges.length === 0 ? (
        <p className="pending-charges-panel__empty">No hay cobros pendientes de citas para hoy.</p>
      ) : (
        <div className="pending-charges-panel__list">
          {charges.map((charge) => {
            const patient = charge.patientId;
            const patientName = patient
              ? [patient.primer_nombre, patient.otros_nombres, patient.apellido_paterno, patient.apellido_materno]
                  .filter(Boolean)
                  .join(' ')
                  .trim() || 'Paciente sin nombre'
              : 'Paciente desconocido';
            const age = patient ? calculateAge(patient.fecha_nacimiento) : null;
            const photo = patient?.photoURL || patient?.foto;
            const photoUrl = photo
              ? `${import.meta.env.VITE_API_URL || ''}/uploads/pacientes/${patient._id}/${encodeURIComponent(photo)}`
              : null;
            const appt = charge.appointmentId;

            return (
              <div
                key={charge._id}
                className="pending-charge-item"
                onClick={() => goToPatient(patient?._id)}
                title="Ver expediente del paciente"
              >
                <img
                  src={photoUrl || userNot}
                  alt={patientName}
                  className={`pending-charge-item__avatar${photoUrl ? '' : ' profile-default-avatar'}`}
                  onError={e => {
                    e.target.src = userNot;
                    e.target.classList.add('profile-default-avatar');
                  }}
                />
                <div className="pending-charge-item__info">
                  <span className="pending-charge-item__name">
                    {patientName}
                    {age !== null && <span className="pending-charge-item__age">{age} años</span>}
                  </span>
                  {appt && (
                    <span className="pending-charge-item__appt">
                      {appt.motivo} — {new Date(appt.fecha_hora).toLocaleDateString('es-MX', { day: '2-digit', month: 'short' })}
                    </span>
                  )}
                  <ul className="pending-charge-item__items">
                    {charge.items.map((item, idx) => (
                      <li key={idx}>{item.nombre}{item.cantidad > 1 ? ` ×${item.cantidad}` : ''}</li>
                    ))}
                  </ul>
                </div>
                <div className="pending-charge-item__amounts">
                  <span className="pending-charge-item__total">{formatMoney(charge.total)}</span>
                  <span className="pending-charge-item__pending">
                    Pendiente: {formatMoney(charge.saldoPendiente)}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default PendingChargesPanel;
