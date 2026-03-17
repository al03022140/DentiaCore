import { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { getAllCharges } from '../../shared/services/patientChargeService';
import userNot from '../../assets/images/avatars/UserNot.png';

const calculateAge = (fechaNacimiento) => {
  if (!fechaNacimiento) return null;
  const diff = Date.now() - new Date(fechaNacimiento).getTime();
  return Math.floor(diff / (365.25 * 24 * 60 * 60 * 1000));
};

const PendingChargesPanel = ({ refreshTrigger }) => {
  const navigate = useNavigate();
  const [charges, setCharges] = useState([]);
  const [loading, setLoading] = useState(true);

  const fetchCharges = useCallback(async () => {
    try {
      const data = await getAllCharges(true); // pendingOnly=true
      setCharges(Array.isArray(data) ? data : []);
    } catch {
      setCharges([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchCharges(); }, [fetchCharges, refreshTrigger]);

  const goToPatient = (patientId) => {
    if (patientId) navigate(`/patient/${patientId}`);
  };

  return (
    <div className="cash-card pending-charges-panel">
      <div className="cash-card__header">
        <h2 className="cash-card__title">Cobros de Citas</h2>
        <span className="pending-charges-panel__count">
          {charges.length} pendiente{charges.length !== 1 ? 's' : ''}
        </span>
      </div>

      {loading ? (
        <p className="pending-charges-panel__empty">Cargando...</p>
      ) : charges.length === 0 ? (
        <p className="pending-charges-panel__empty">No hay cobros pendientes de citas.</p>
      ) : (
        <div className="pending-charges-panel__list">
          {charges.map((charge) => {
            const patient = charge.patientId;
            const patientName = patient
              ? `${patient.nombre || ''} ${patient.apellidos || ''}`.trim()
              : 'Paciente desconocido';
            const age = patient ? calculateAge(patient.fecha_nacimiento) : null;
            const photoUrl = patient?.foto
              ? `${import.meta.env.VITE_API_URL || ''}/uploads/pacientes/${patient._id}/${patient.foto}`
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
                  className="pending-charge-item__avatar"
                  onError={e => { e.target.src = userNot; }}
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
                  <span className="pending-charge-item__total">${charge.total.toLocaleString('es-MX')}</span>
                  <span className="pending-charge-item__pending">
                    Pendiente: ${charge.saldoPendiente.toLocaleString('es-MX')}
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
