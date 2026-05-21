import React, { useState, useEffect, useCallback } from 'react';
import { Modal, Input, Select, message, Popconfirm, Checkbox } from 'antd';
import { getChargesByPatient, createCharge, addPayment, cancelCharge } from '../../../shared/services/patientChargeService';
import { getSettings } from '../../../shared/services/settingsService';
import { getSessionStatus } from '../../../shared/services/cashService';
import { formatMoney } from '../../../shared/utils/money';
import API from '../../../shared/services/axios-instance';
import '../styles/patient-charges-card.css';

const CONFIRM_PHRASE = 'CONFIRMO';
const round2 = (n) => Math.round((Number.isFinite(Number(n)) ? Number(n) : 0) * 100) / 100;

// Notifica al resto de la app que algo cambió en caja para que CashPage,
// CashDashboard y patient-cash-movements refresquen sin que el usuario
// tenga que navegar manualmente entre vistas.
const broadcastCashChange = (detail) => {
  try {
    window.dispatchEvent(new CustomEvent('cash:movement-changed', { detail }));
  } catch { /* no-op en entornos sin window (SSR/tests) */ }
};

const PatientChargesCard = ({ patientId }) => {
  const [charges, setCharges] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isBoxOpen, setIsBoxOpen] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showPayModal, setShowPayModal] = useState(false);
  const [showCancelModal, setShowCancelModal] = useState(false);
  const [selectedCharge, setSelectedCharge] = useState(null);

  // C1: flags de "en curso" para bloquear doble submit en cada modal.
  // Sin esto, un doble-click crea dos cobros idénticos o registra el mismo
  // pago dos veces (riesgo contable real).
  const [creatingCharge, setCreatingCharge] = useState(false);
  const [registeringPayment, setRegisteringPayment] = useState(false);
  const [cancelingCharge, setCancelingCharge] = useState(false);

  const [serviceCatalog, setServiceCatalog] = useState([]);
  const [appointments, setAppointments] = useState([]);
  const [selectedAppointment, setSelectedAppointment] = useState(null);
  const [chargeItems, setChargeItems] = useState([]);
  const [chargeConfirmText, setChargeConfirmText] = useState('');

  const [payAmount, setPayAmount] = useState('');
  const [payMethod, setPayMethod] = useState('CASH');
  const [payConfirmText, setPayConfirmText] = useState('');

  const [cancelMotivo, setCancelMotivo] = useState('');
  const [cancelConfirmText, setCancelConfirmText] = useState('');
  // C4: opción de revertir los pagos a caja al cancelar (genera EXPENSE
  // compensatorios en el servidor). Por defecto false para preservar el
  // comportamiento legacy de "los pagos quedan en caja".
  const [reversePayments, setReversePayments] = useState(false);

  const loadCharges = useCallback(async () => {
    try {
      const data = await getChargesByPatient(patientId);
      setCharges(data);
    } catch {
      // silent — empty state will show
    } finally {
      setLoading(false);
    }
  }, [patientId]);

  useEffect(() => {
    if (!patientId) return undefined;
    let cancelled = false;
    (async () => {
      try {
        setLoading(true);
        const [data, status] = await Promise.all([
          getChargesByPatient(patientId),
          getSessionStatus().catch(() => ({ isOpen: false }))
        ]);
        if (cancelled) return;
        setCharges(data);
        setIsBoxOpen(!!status?.isOpen);
      } catch {
        if (cancelled) return;
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [patientId]);

  const groupedCharges = charges.reduce((groups, charge) => {
    const dateKey = new Date(charge.fecha).toLocaleDateString('es-MX', {
      year: 'numeric', month: 'long', day: 'numeric'
    });
    if (!groups[dateKey]) groups[dateKey] = [];
    groups[dateKey].push(charge);
    return groups;
  }, {});

  const openAddModal = async () => {
    try {
      // BUG-B7: filtramos en server (?paciente_id=...) en lugar de traer TODAS
      // las citas y filtrar en cliente. Limit alto para citas pasadas también.
      const [settings, appointmentsRes] = await Promise.all([
        getSettings(),
        API.get('/appointments', { params: { paciente_id: patientId, limit: 500 } })
          .then(r => r.data)
          .catch(() => [])
      ]);
      setServiceCatalog(settings.serviceCatalog || []);
      const list = Array.isArray(appointmentsRes) ? appointmentsRes : (appointmentsRes?.items || []);
      setAppointments(list);
    } catch {
      setServiceCatalog([]);
      setAppointments([]);
    }
    setChargeItems([]);
    setSelectedAppointment(null);
    setChargeConfirmText('');
    setShowAddModal(true);
  };

  const addItemFromCatalog = (svc) => {
    if (chargeItems.some(i => i.nombre === svc.nombre)) return;
    setChargeItems(prev => [...prev, {
      nombre: svc.nombre,
      cantidad: 1,
      precioUnitario: round2(svc.precioDefault)
    }]);
  };

  const updateItem = (index, field, value) => {
    setChargeItems(prev => prev.map((item, i) =>
      i === index ? { ...item, [field]: value } : item
    ));
  };

  const removeItem = (index) => {
    setChargeItems(prev => prev.filter((_, i) => i !== index));
  };

  const chargeTotal = round2(chargeItems.reduce((sum, item) => {
    return sum + (Number(item.cantidad) || 0) * (Number(item.precioUnitario) || 0);
  }, 0));

  const handleCreateCharge = async () => {
    if (creatingCharge) return; // C1: bloquea doble submit
    if (chargeItems.length === 0) {
      message.warning('Agrega al menos un servicio');
      return;
    }
    setCreatingCharge(true);
    try {
      await createCharge(patientId, {
        items: chargeItems.map(item => ({
          nombre: item.nombre,
          cantidad: Number(item.cantidad),
          precioUnitario: round2(item.precioUnitario)
        })),
        appointmentId: selectedAppointment || undefined,
        confirmacion: chargeConfirmText.trim()
      });
      message.success('Cobro registrado correctamente');
      setShowAddModal(false);
      loadCharges();
      // BUG-B12: sincronizar CashPage si está montado
      window.dispatchEvent(new CustomEvent('cash:movement-changed', { detail: { source: 'patient-charges', kind: 'create', patientId } }));
    } catch (err) {
      message.error(err.response?.data?.message || 'Error al registrar cobro');
    } finally {
      setCreatingCharge(false);
    }
  };

  const openPayModal = async (charge) => {
    // BUG-B9: una sola llamada a getSessionStatus (antes se llamaba 2 veces).
    // Revalida el estado de caja porque puede haber cambiado desde el load inicial.
    const status = await getSessionStatus().catch(() => ({ isOpen: false }));
    setIsBoxOpen(!!status?.isOpen);
    if (!status?.isOpen) {
      message.warning('La caja está cerrada. Ábrela desde el módulo de Caja para registrar pagos.');
      return;
    }
    setSelectedCharge(charge);
    setPayAmount('');
    setPayMethod('CASH');
    setPayConfirmText('');
    setShowPayModal(true);
  };

  const handleAddPayment = async () => {
    if (registeringPayment) return; // C1: bloquea doble submit
    if (!selectedCharge) return;
    const monto = round2(parseFloat(payAmount));
    if (!Number.isFinite(monto) || monto <= 0) {
      message.warning('Ingresa un monto válido');
      return;
    }
    setRegisteringPayment(true);
    try {
      await addPayment(selectedCharge._id, {
        monto,
        paymentMethod: payMethod,
        confirmacion: payConfirmText.trim()
      });
      message.success('Pago registrado correctamente');
      setShowPayModal(false);
      loadCharges();
      window.dispatchEvent(new CustomEvent('cash:movement-changed', { detail: { source: 'patient-charges', kind: 'payment', patientId } }));
    } catch (err) {
      message.error(err.response?.data?.message || 'Error al registrar pago');
    } finally {
      setRegisteringPayment(false);
    }
  };

  const openCancelModal = (charge) => {
    setSelectedCharge(charge);
    setCancelMotivo('');
    setCancelConfirmText('');
    setReversePayments(false);
    setShowCancelModal(true);
  };

  const handleCancelCharge = async () => {
    if (cancelingCharge) return; // C1: bloquea doble submit
    if (!selectedCharge) return;
    if (cancelMotivo.trim().length < 3) {
      message.warning('Indica un motivo (mínimo 3 caracteres)');
      return;
    }
    setCancelingCharge(true);
    try {
      const result = await cancelCharge(selectedCharge._id, {
        motivo: cancelMotivo.trim(),
        confirmacion: cancelConfirmText.trim(),
        reversePayments
      });
      // C4: feedback contextual sobre la reversa de pagos.
      if (result?.reverseStatus === 'reversed') {
        const n = Array.isArray(result?.reversedMovementIds) ? result.reversedMovementIds.length : 0;
        message.success(`Cobro cancelado y ${n} pago(s) revertido(s) en caja`);
      } else if (result?.reverseStatus === 'skipped') {
        message.warning(result?.reverseMessage || 'Cobro cancelado, reversa pendiente');
      } else {
        message.success('Cobro cancelado');
      }
      setShowCancelModal(false);
      loadCharges();
      window.dispatchEvent(new CustomEvent('cash:movement-changed', { detail: { source: 'patient-charges', kind: 'cancel', patientId } }));
    } catch (err) {
      message.error(err.response?.data?.message || 'Error al cancelar cobro');
    } finally {
      setCancelingCharge(false);
    }
  };

  if (loading) return null;

  return (
    <section className="patient-detail__section patient-charges-card" aria-labelledby="charges-section-title">
      <div className="patient-charges-card__header">
        <h2 id="charges-section-title">Caja</h2>
        <button
          className="patient-charges-card__add-btn"
          onClick={openAddModal}
          title="Agregar cobro"
          aria-label="Agregar cobro"
        >+</button>
      </div>

      {charges.length === 0 ? (
        <div className="patient-charges-card__empty patient-detail__empty-message">No hay cobros registrados</div>
      ) : (
        <div className="patient-charges-card__list">
          {Object.entries(groupedCharges).map(([dateLabel, dateCharges]) => (
            <div key={dateLabel} className="charges-date-group">
              <div className="charges-date-group__label">{dateLabel}</div>
              {dateCharges.map(charge => (
                <div
                  key={charge._id}
                  className={`charge-card${charge.cancelado ? ' charge-card--cancelled' : ''}`}
                >
                  {charge.appointmentId && (
                    <div className="charge-card__appointment">
                      Cita: {charge.appointmentId.motivo || 'Sin motivo'}
                    </div>
                  )}
                  <ul className="charge-card__items">
                    {charge.items.map((item, idx) => (
                      <li key={idx}>
                        <span>{item.nombre}{item.cantidad > 1 ? ` x ${item.cantidad}` : ''}</span>
                        <span>${item.subtotal.toLocaleString()}</span>
                      </li>
                    ))}
                  </ul>
                  <div className="charge-card__footer">
                    <span className="charge-card__total">Total: ${charge.total.toLocaleString()}</span>
                    {charge.cancelado ? (
                      <span className="charge-card__balance charge-card__balance--cancelled">
                        Cancelado{charge.canceladoMotivo ? `: ${charge.canceladoMotivo}` : ''}
                      </span>
                    ) : charge.saldoPendiente > 0 ? (
                      <span className="charge-card__balance charge-card__balance--pending">
                        Pendiente: ${charge.saldoPendiente.toLocaleString()}
                        {charge.totalPagado > 0 && ` (pagado: $${charge.totalPagado.toLocaleString()})`}
                      </span>
                    ) : (
                      <span className="charge-card__balance charge-card__balance--paid">Pagado</span>
                    )}
                  </div>
                  {!charge.cancelado && (
                    <div className="charge-card__actions">
                      {charge.saldoPendiente > 0 && (
                        <button
                          className="charge-card__pay-btn"
                          onClick={() => openPayModal(charge)}
                          disabled={!isBoxOpen}
                          title={isBoxOpen ? 'Registrar pago' : 'La caja está cerrada'}
                        >
                          Registrar Pago
                        </button>
                      )}
                      <button
                        className="charge-card__cancel-btn"
                        onClick={() => openCancelModal(charge)}
                        title="Cancelar cobro"
                      >
                        Cancelar
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          ))}
        </div>
      )}

      {/* Add Charge Modal */}
      <Modal
        title="Nuevo Cobro"
        open={showAddModal}
        onCancel={() => setShowAddModal(false)}
        onOk={handleCreateCharge}
        okText="Registrar"
        cancelText="Cancelar"
        okButtonProps={{ disabled: chargeConfirmText.trim() !== CONFIRM_PHRASE || chargeItems.length === 0 }}
        width={600}
      >
        <div style={{ marginBottom: '0.75rem' }}>
          <label style={{ display: 'block', fontSize: '0.85rem', marginBottom: 4 }}>Cita asociada (opcional)</label>
          <Select
            allowClear
            placeholder="Sin cita asociada"
            style={{ width: '100%' }}
            value={selectedAppointment}
            onChange={setSelectedAppointment}
          >
            {appointments.map(apt => (
              <Select.Option key={apt._id} value={apt._id}>
                {new Date(apt.fecha_hora).toLocaleDateString('es-MX')} — {apt.motivo}
              </Select.Option>
            ))}
          </Select>
        </div>

        <div style={{ marginBottom: '0.75rem' }}>
          <label style={{ display: 'block', fontSize: '0.85rem', marginBottom: 4 }}>Agregar servicio del catálogo</label>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem' }}>
            {serviceCatalog.map(svc => (
              <button
                key={svc.nombre}
                type="button"
                onClick={() => addItemFromCatalog(svc)}
                disabled={chargeItems.some(i => i.nombre === svc.nombre)}
                style={{
                  padding: '4px 10px', fontSize: '0.82rem',
                  border: '1px solid var(--color-primary)',
                  borderRadius: 'var(--border-radius-full)',
                  background: chargeItems.some(i => i.nombre === svc.nombre) ? 'var(--color-primary)' : 'transparent',
                  color: chargeItems.some(i => i.nombre === svc.nombre) ? '#fff' : 'var(--color-primary)',
                  cursor: chargeItems.some(i => i.nombre === svc.nombre) ? 'default' : 'pointer',
                }}
              >
                {svc.nombre} — ${svc.precioDefault.toLocaleString()}
              </button>
            ))}
            {serviceCatalog.length === 0 && (
              <span style={{ fontSize: '0.85rem', color: 'var(--color-text-secondary)' }}>
                No hay servicios configurados. Agrégalos en Configuración &gt; Caja.
              </span>
            )}
          </div>
        </div>

        {chargeItems.length > 0 && (
          <>
            <table className="add-charge-modal__items">
              <thead>
                <tr>
                  <th>Servicio</th>
                  <th style={{ width: 70 }}>Cant.</th>
                  <th style={{ width: 110 }}>Precio</th>
                  <th style={{ width: 90 }}>Subtotal</th>
                  <th style={{ width: 30 }}></th>
                </tr>
              </thead>
              <tbody>
                {chargeItems.map((item, idx) => (
                  <tr key={idx}>
                    <td>{item.nombre}</td>
                    <td>
                      <input
                        type="number"
                        min="1"
                        step="1"
                        value={item.cantidad}
                        onChange={e => updateItem(idx, 'cantidad', Math.max(1, parseInt(e.target.value) || 1))}
                      />
                    </td>
                    <td>
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={item.precioUnitario}
                        onChange={e => updateItem(idx, 'precioUnitario', round2(parseFloat(e.target.value) || 0))}
                        onBlur={e => updateItem(idx, 'precioUnitario', round2(parseFloat(e.target.value) || 0))}
                      />
                    </td>
                    <td style={{ textAlign: 'right', fontWeight: 500 }}>
                      ${round2((Number(item.cantidad) || 0) * (Number(item.precioUnitario) || 0)).toLocaleString()}
                    </td>
                    <td>
                      <button type="button" className="remove-item-btn" onClick={() => removeItem(idx)}>×</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="add-charge-modal__total">Total: ${chargeTotal.toLocaleString()}</div>
          </>
        )}

        <div className="add-charge-modal__confirm-section">
          <label>Escribe <strong>{CONFIRM_PHRASE}</strong> para registrar el cobro</label>
          <Input
            value={chargeConfirmText}
            onChange={e => setChargeConfirmText(e.target.value)}
            placeholder={CONFIRM_PHRASE}
          />
        </div>
      </Modal>

      {/* Payment Modal */}
      <Modal
        title="Registrar Pago"
        open={showPayModal}
        onCancel={() => setShowPayModal(false)}
        onOk={handleAddPayment}
        okText="Registrar Pago"
        cancelText="Cancelar"
        okButtonProps={{ disabled: payConfirmText.trim() !== CONFIRM_PHRASE || !payAmount }}
      >
        {selectedCharge && (
          <>
            <div className="payment-modal__summary">
              <p><strong>Total del cobro:</strong> ${selectedCharge.total.toLocaleString()}</p>
              <p><strong>Ya pagado:</strong> ${selectedCharge.totalPagado.toLocaleString()}</p>
              <p style={{ color: 'var(--color-danger)', fontWeight: 600 }}>
                <strong>Saldo pendiente:</strong> ${selectedCharge.saldoPendiente.toLocaleString()}
              </p>
            </div>

            <div style={{ marginBottom: '0.75rem' }}>
              <label style={{ display: 'block', fontSize: '0.85rem', marginBottom: 4 }}>Monto a pagar</label>
              <Input
                type="number"
                min="0.01"
                max={selectedCharge.saldoPendiente}
                step="0.01"
                value={payAmount}
                onChange={e => setPayAmount(e.target.value)}
                onBlur={e => setPayAmount(String(round2(parseFloat(e.target.value) || 0)))}
                placeholder={`Máximo: $${selectedCharge.saldoPendiente.toLocaleString()}`}
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

      {/* Cancel Charge Modal */}
      <Modal
        title="Cancelar Cobro"
        open={showCancelModal}
        onCancel={() => setShowCancelModal(false)}
        onOk={handleCancelCharge}
        okText="Cancelar Cobro"
        okType="danger"
        cancelText="Volver"
        okButtonProps={{ disabled: cancelConfirmText.trim() !== CONFIRM_PHRASE || cancelMotivo.trim().length < 3 }}
      >
        {selectedCharge && (
          <>
            <p style={{ marginBottom: '0.75rem' }}>
              Esta acción marcará el cobro como cancelado. Los pagos ya registrados
              quedarán en la caja (no se devuelven automáticamente).
            </p>
            <div style={{ marginBottom: '0.75rem' }}>
              <label style={{ display: 'block', fontSize: '0.85rem', marginBottom: 4 }}>
                Motivo de cancelación
              </label>
              <Input.TextArea
                rows={2}
                value={cancelMotivo}
                onChange={e => setCancelMotivo(e.target.value)}
                placeholder="Ej. Cobro duplicado, paciente solicitó anulación..."
                maxLength={300}
                showCount
              />
            </div>
            <div className="add-charge-modal__confirm-section">
              <label>Escribe <strong>{CONFIRM_PHRASE}</strong> para confirmar</label>
              <Input
                value={cancelConfirmText}
                onChange={e => setCancelConfirmText(e.target.value)}
                placeholder={CONFIRM_PHRASE}
              />
            </div>
          </>
        )}
      </Modal>
    </section>
  );
};

export default React.memo(PatientChargesCard);
