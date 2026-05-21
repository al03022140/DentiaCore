import { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Modal, Input, Select, Popconfirm, message } from 'antd';
import { getAllChargesWithMeta, addPayment, getChargesByPatient } from '../../shared/services/patientChargeService';
import { formatMoney } from '../../shared/utils/money';
import userNot from '../../assets/images/icons/Profile Default.svg';

const CONFIRM_PHRASE = 'CONFIRMO';
const round2 = (n) => Math.round((Number.isFinite(Number(n)) ? Number(n) : 0) * 100) / 100;

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

  // Pago rápido (Popconfirm, todo en efectivo) y pago detallado (Modal).
  const [quickPayingId, setQuickPayingId] = useState(null);
  const [payModalCharge, setPayModalCharge] = useState(null);
  const [payAmount, setPayAmount] = useState('');
  const [payMethod, setPayMethod] = useState('CASH');
  const [payConfirmText, setPayConfirmText] = useState('');
  const [registeringPayment, setRegisteringPayment] = useState(false);
  // Saldo pendiente total del paciente (suma de todos sus cobros no cancelados).
  // null = aún cargando; number = listo. Se recalcula al abrir el modal.
  const [patientPendingTotal, setPatientPendingTotal] = useState(null);

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

  // Pago rápido: registra el total pendiente como efectivo en un solo clic.
  // Si el usuario quiere monto parcial o método digital, debe usar el modal.
  const handleQuickPay = async (charge) => {
    if (quickPayingId) return;
    setQuickPayingId(charge._id);
    try {
      await addPayment(charge._id, {
        monto: round2(charge.saldoPendiente),
        paymentMethod: 'CASH',
        confirmacion: CONFIRM_PHRASE,
      });
      message.success('Cobro registrado en efectivo');
      window.dispatchEvent(new CustomEvent('cash:movement-changed', {
        detail: { source: 'cash-pending-panel', kind: 'payment', chargeId: charge._id }
      }));
      fetchCharges();
    } catch (err) {
      message.error(err?.response?.data?.message || 'Error al registrar pago');
    } finally {
      setQuickPayingId(null);
    }
  };

  const openPayModal = async (charge) => {
    setPayModalCharge(charge);
    // Default: monto total pendiente. Editable por si el usuario quiere parcial.
    setPayAmount(String(round2(charge.saldoPendiente)));
    setPayMethod('CASH');
    setPayConfirmText('');
    setPatientPendingTotal(null);
    const patientId = charge?.patientId?._id;
    if (!patientId) return;
    try {
      const patientCharges = await getChargesByPatient(patientId);
      const total = (Array.isArray(patientCharges) ? patientCharges : [])
        .filter((c) => !c.cancelado)
        .reduce((sum, c) => sum + (Number(c.saldoPendiente) || 0), 0);
      setPatientPendingTotal(round2(total));
    } catch {
      setPatientPendingTotal(null);
    }
  };

  const closePayModal = () => {
    if (registeringPayment) return;
    setPayModalCharge(null);
    setPayAmount('');
    setPayMethod('CASH');
    setPayConfirmText('');
    setPatientPendingTotal(null);
  };

  const handleAddPayment = async () => {
    if (registeringPayment || !payModalCharge) return;
    const monto = round2(parseFloat(payAmount));
    if (!Number.isFinite(monto) || monto <= 0) {
      message.warning('Ingresa un monto válido');
      return;
    }
    setRegisteringPayment(true);
    try {
      await addPayment(payModalCharge._id, {
        monto,
        paymentMethod: payMethod,
        confirmacion: payConfirmText.trim(),
      });
      message.success('Pago registrado correctamente');
      setPayModalCharge(null);
      setPayAmount('');
      setPayMethod('CASH');
      setPayConfirmText('');
      setPatientPendingTotal(null);
      window.dispatchEvent(new CustomEvent('cash:movement-changed', {
        detail: { source: 'cash-pending-panel', kind: 'payment' }
      }));
      fetchCharges();
    } catch (err) {
      message.error(err?.response?.data?.message || 'Error al registrar pago');
    } finally {
      setRegisteringPayment(false);
    }
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
            const isQuickPaying = quickPayingId === charge._id;

            return (
              <div key={charge._id} className="pending-charge-item">
                <div
                  className="pending-charge-item__main"
                  onClick={() => goToPatient(patient?._id)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') goToPatient(patient?._id);
                  }}
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

                <div className="pending-charge-item__actions">
                  <Popconfirm
                    title="¿Cobrar total en efectivo?"
                    description={`Se registrará ${formatMoney(charge.saldoPendiente)} como pago en efectivo.`}
                    onConfirm={() => handleQuickPay(charge)}
                    okText="Cobrar"
                    cancelText="Cancelar"
                    disabled={!isBoxOpen || isQuickPaying}
                  >
                    <button
                      type="button"
                      className="pending-charge-item__quick-pay"
                      disabled={!isBoxOpen || isQuickPaying}
                      title={isBoxOpen ? 'Registrar el total pendiente en efectivo' : 'La caja está cerrada'}
                    >
                      {isQuickPaying ? 'Cobrando…' : 'Cobrar total efectivo'}
                    </button>
                  </Popconfirm>
                  <button
                    type="button"
                    className="pending-charge-item__pay"
                    disabled={!isBoxOpen}
                    onClick={() => openPayModal(charge)}
                    title={isBoxOpen ? 'Pago parcial o digital' : 'La caja está cerrada'}
                  >
                    Registrar Pago
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <Modal
        title="Registrar Pago"
        open={!!payModalCharge}
        onCancel={closePayModal}
        onOk={handleAddPayment}
        okText="Registrar Pago"
        cancelText="Cancelar"
        confirmLoading={registeringPayment}
        maskClosable={!registeringPayment}
        keyboard={!registeringPayment}
        okButtonProps={{
          disabled: payConfirmText.trim() !== CONFIRM_PHRASE || !payAmount || registeringPayment,
        }}
        cancelButtonProps={{ disabled: registeringPayment }}
      >
        {payModalCharge && (
          <>
            <div className="payment-modal__summary">
              <p><strong>Total del cobro:</strong> {formatMoney(payModalCharge.total)}</p>
              <p><strong>Ya pagado:</strong> {formatMoney(payModalCharge.totalPagado)}</p>
              <p style={{ color: 'var(--color-danger)', fontWeight: 600 }}>
                <strong>Saldo pendiente:</strong> {formatMoney(payModalCharge.saldoPendiente)}
              </p>
              <p style={{ color: 'var(--color-danger)', fontWeight: 600 }}>
                <strong>Saldo pendiente total del paciente:</strong>{' '}
                {patientPendingTotal === null ? 'Calculando…' : formatMoney(patientPendingTotal)}
              </p>
            </div>

            <div style={{ marginBottom: '0.75rem' }}>
              <label style={{ display: 'block', fontSize: '0.85rem', marginBottom: 4 }}>Monto a pagar</label>
              <Input
                type="number"
                min="0.01"
                max={payModalCharge.saldoPendiente}
                step="0.01"
                value={payAmount}
                onChange={e => setPayAmount(e.target.value)}
                onBlur={e => setPayAmount(String(round2(parseFloat(e.target.value) || 0)))}
                placeholder={`Máximo: ${formatMoney(payModalCharge.saldoPendiente)}`}
              />
            </div>

            <div style={{ marginBottom: '0.75rem' }}>
              <label style={{ display: 'block', fontSize: '0.85rem', marginBottom: 4 }}>Método de pago</label>
              <Select value={payMethod} onChange={setPayMethod} style={{ width: '100%' }}>
                <Select.Option value="CASH">Efectivo</Select.Option>
                <Select.Option value="DIGITAL">Digital / Banco</Select.Option>
              </Select>
            </div>

            <div className="add-charge-modal__confirm-section">
              <label>Escribe <strong>{CONFIRM_PHRASE}</strong> para confirmar el pago</label>
              <Input
                value={payConfirmText}
                onChange={e => setPayConfirmText(e.target.value)}
                placeholder={CONFIRM_PHRASE}
              />
            </div>
          </>
        )}
      </Modal>
    </div>
  );
};

export default PendingChargesPanel;
