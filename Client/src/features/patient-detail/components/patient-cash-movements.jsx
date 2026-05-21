import React, { useCallback, useEffect, useId, useMemo, useState } from 'react';
import PropTypes from 'prop-types';
import { Modal, Form, InputNumber, Radio, Input, Select, message } from 'antd';
import SectionHeader from './section-header';
import {
  getMovementsByPatient,
  addMovement,
  getSessionStatus,
} from '../../../shared/services/cashService';
import { getChargesByPatient, addPayment } from '../../../shared/services/patientChargeService';
import { formatMoney } from '../../../shared/utils/money';
import '../styles/patient-cash-movements.css';

const formatDateGroup = (iso) =>
  new Date(iso).toLocaleDateString('es-MX', { year: 'numeric', month: 'long', day: 'numeric' });

const formatTime = (iso) =>
  new Date(iso).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' });

const PAYMENT_METHOD_LABEL = { CASH: 'Efectivo', DIGITAL: 'Digital' };

const CONFIRM_PHRASE = 'CONFIRMO';
const round2 = (n) => Math.round((Number.isFinite(Number(n)) ? Number(n) : 0) * 100) / 100;

const PatientCashMovements = ({ patientId }) => {
  const sectionId = useId();
  const contentId = useId();

  const [movements, setMovements] = useState([]);
  const [pendingCharges, setPendingCharges] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [expanded, setExpanded] = useState(false);
  const [isBoxOpen, setIsBoxOpen] = useState(false);

  // Modal de nuevo movimiento
  const [modalOpen, setModalOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [form] = Form.useForm();

  // Modal de pago / abono sobre un cobro pendiente (click en card de pendientes).
  const [payCharge, setPayCharge] = useState(null);
  const [payAmount, setPayAmount] = useState('');
  const [payMethod, setPayMethod] = useState('CASH');
  const [payConfirmText, setPayConfirmText] = useState('');
  const [registeringPayment, setRegisteringPayment] = useState(false);

  const loadMovements = useCallback(async (signal) => {
    if (!patientId) return;
    try {
      setLoading(true);
      setError(null);
      // Cargamos movimientos y cobros del paciente en paralelo. Los cobros
      // pendientes se muestran como sección informativa al final del listado
      // (no cuentan en ingresos/egresos/saldo neto).
      const [movs, chargesRes] = await Promise.all([
        getMovementsByPatient(patientId, { signal }),
        getChargesByPatient(patientId).catch(() => []),
      ]);
      if (signal?.aborted) return;
      setMovements(Array.isArray(movs) ? movs : []);
      setPendingCharges(Array.isArray(chargesRes) ? chargesRes : []);
    } catch (err) {
      if (err?.code === 'ERR_CANCELED' || err?.name === 'CanceledError') return;
      if (err?.response?.status === 403) {
        setError('forbidden');
      } else {
        setError('No se pudieron cargar los movimientos de caja.');
      }
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, [patientId]);

  // Carga inicial: movimientos + estado de sesión de caja (para habilitar/deshabilitar acciones)
  useEffect(() => {
    if (!patientId) return undefined;
    const controller = new AbortController();
    loadMovements(controller.signal);
    getSessionStatus()
      .then((status) => {
        if (controller.signal.aborted) return;
        setIsBoxOpen(!!status?.isOpen);
      })
      .catch(() => { /* si falla, asumimos cerrada */ });
    return () => controller.abort();
  }, [patientId, loadMovements]);

  // A6: refresca cuando otro componente notifica un cambio en caja (e.g. un
  // pago registrado desde patient-charges-card del mismo paciente).
  useEffect(() => {
    if (!patientId) return undefined;
    const handler = () => { loadMovements(); };
    window.addEventListener('cash:movement-changed', handler);
    return () => window.removeEventListener('cash:movement-changed', handler);
  }, [patientId, loadMovements]);

  const totals = useMemo(() => {
    let income = 0;
    let expense = 0;
    for (const m of movements) {
      const amt = Number(m.amount) || 0;
      if (m.type === 'INCOME') income += amt;
      else if (m.type === 'EXPENSE') expense += amt;
    }
    return { income, expense, net: income - expense };
  }, [movements]);

  // Cobros sin cancelar con saldo pendiente > 0. Se muestran aparte del
  // listado de movimientos porque NO son caja realizada: son cuentas por
  // cobrar (futuras), no deben sumar al saldo neto.
  const activePendingCharges = useMemo(
    () => pendingCharges.filter((c) => !c.cancelado && Number(c.saldoPendiente) > 0),
    [pendingCharges]
  );

  const totalPendingAmount = useMemo(
    () => activePendingCharges.reduce((sum, c) => sum + (Number(c.saldoPendiente) || 0), 0),
    [activePendingCharges]
  );

  const groupedPendingByDate = useMemo(() => {
    const map = new Map();
    for (const c of activePendingCharges) {
      const ts = c?.appointmentId?.fecha_hora || c.fecha;
      if (!ts) continue;
      const key = formatDateGroup(ts);
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(c);
    }
    return [...map.entries()];
  }, [activePendingCharges]);

  const groupedByDate = useMemo(() => {
    const map = new Map();
    for (const m of movements) {
      const key = formatDateGroup(m.date);
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(m);
    }
    return [...map.entries()];
  }, [movements]);

  const openModal = () => {
    if (!isBoxOpen) {
      message.warning('La caja está cerrada. Ábrala desde el módulo de Caja para registrar movimientos.');
      return;
    }
    setModalOpen(true);
    form.resetFields();
    form.setFieldsValue({ type: 'INCOME', paymentMethod: 'CASH' });
  };

  const closeModal = () => {
    setModalOpen(false);
    setSubmitting(false);
  };

  const openPayModal = (charge) => {
    if (!isBoxOpen) {
      message.warning('La caja está cerrada. Ábrala desde el módulo de Caja para registrar pagos.');
      return;
    }
    setPayCharge(charge);
    // Default: total pendiente. Editable para abonos parciales.
    setPayAmount(String(round2(charge.saldoPendiente)));
    setPayMethod('CASH');
    setPayConfirmText('');
  };

  const closePayModal = () => {
    if (registeringPayment) return;
    setPayCharge(null);
    setPayAmount('');
    setPayMethod('CASH');
    setPayConfirmText('');
  };

  const handleAddPayment = async () => {
    if (registeringPayment || !payCharge) return;
    const monto = round2(parseFloat(payAmount));
    if (!Number.isFinite(monto) || monto <= 0) {
      message.warning('Ingresa un monto válido');
      return;
    }
    setRegisteringPayment(true);
    try {
      await addPayment(payCharge._id, {
        monto,
        paymentMethod: payMethod,
        confirmacion: payConfirmText.trim(),
      });
      message.success('Pago registrado correctamente');
      setPayCharge(null);
      setPayAmount('');
      setPayMethod('CASH');
      setPayConfirmText('');
      window.dispatchEvent(new CustomEvent('cash:movement-changed', {
        detail: { source: 'patient-cash-movements', kind: 'payment', patientId }
      }));
      await loadMovements();
    } catch (err) {
      message.error(err?.response?.data?.message || 'Error al registrar pago');
    } finally {
      setRegisteringPayment(false);
    }
  };

  const handleSubmit = async () => {
    try {
      const values = await form.validateFields();
      setSubmitting(true);
      await addMovement({
        amount: values.amount,
        type: values.type,
        paymentMethod: values.paymentMethod,
        concept: values.concept,
        patientId,
      });
      message.success(values.type === 'INCOME' ? 'Ingreso registrado' : 'Egreso registrado');
      closeModal();
      await loadMovements();
      // BUG-B12: avisa al CashDashboard/MovementsList/PendingChargesPanel
      // globales que la caja cambió, para que recarguen sin esperar nav.
      window.dispatchEvent(new CustomEvent('cash:movement-changed', { detail: { source: 'patient-detail', patientId } }));
    } catch (err) {
      if (err?.errorFields) return; // validación de antd, no es un error de red
      const msg = err?.response?.data?.message || 'No se pudo registrar el movimiento';
      message.error(msg);
      setSubmitting(false);
    }
  };

  // Si el usuario no tiene permiso, no renderizamos la sección.
  if (error === 'forbidden') return null;

  return (
    <section
      className={`patient-detail__section patient-cash-movements ${expanded ? 'is-expanded' : 'is-collapsed'}`}
      aria-labelledby={sectionId}
    >
      <div className="cash-mov-header">
        <button
          type="button"
          className="cash-mov-toggle"
          onClick={() => setExpanded((v) => !v)}
          aria-expanded={expanded}
          aria-controls={contentId}
        >
          <span className={`cash-mov-chevron ${expanded ? 'is-open' : ''}`} aria-hidden="true">▸</span>
          <SectionHeader title="Movimientos de Caja" id={sectionId} />
        </button>

        <button
          type="button"
          className="cash-mov-add-btn"
          onClick={openModal}
          disabled={!isBoxOpen}
          aria-label="Registrar movimiento"
          title={isBoxOpen ? 'Registrar movimiento' : 'Caja cerrada'}
        >
          +
        </button>
      </div>

      <div
        id={contentId}
        className="cash-mov-content"
        hidden={!expanded}
      >
        {loading && (
          <p className="patient-detail__empty-message">Cargando movimientos…</p>
        )}

        {!loading && error && error !== 'forbidden' && (
          <p className="patient-detail__empty-message">{error}</p>
        )}

        {!loading && !error && movements.length === 0 && activePendingCharges.length === 0 && (
          <p className="patient-detail__empty-message">
            No hay movimientos de caja registrados para este paciente.
          </p>
        )}

        {!loading && !error && (movements.length > 0 || activePendingCharges.length > 0) && (
          <>
            <div className="cash-mov-totals" role="group" aria-label="Totales">
              <div className="cash-mov-total cash-mov-total--income">
                <span className="cash-mov-total__label">Total ingresos</span>
                <span className="cash-mov-total__value">{formatMoney(totals.income)}</span>
              </div>
              <div className="cash-mov-total cash-mov-total--expense">
                <span className="cash-mov-total__label">Total egresos</span>
                <span className="cash-mov-total__value">{formatMoney(totals.expense)}</span>
              </div>
              <div className="cash-mov-total cash-mov-total--net">
                <span className="cash-mov-total__label">Saldo neto</span>
                <span className="cash-mov-total__value">{formatMoney(totals.net)}</span>
              </div>
              <div
                className="cash-mov-total cash-mov-total--pending"
                title="Suma de todos los cobros pendientes del paciente. NO suma al saldo neto: es dinero por cobrar a futuro."
              >
                <span className="cash-mov-total__label">Por cobrar</span>
                <span className="cash-mov-total__value">{formatMoney(totalPendingAmount)}</span>
              </div>
            </div>

            {movements.length > 0 && (
              <ul className="cash-mov-list">
                {groupedByDate.map(([dateKey, items]) => (
                  <li key={dateKey} className="cash-mov-date-group">
                    <h4 className="cash-mov-date">{dateKey}</h4>
                    <ul className="cash-mov-date-items">
                      {items.map((m) => {
                        const isExpense = m.type === 'EXPENSE';
                        const author = m.creadoPor?.nombre;
                        const method = PAYMENT_METHOD_LABEL[m.paymentMethod] || m.paymentMethod;
                        return (
                          <li
                            key={m._id}
                            className={`cash-mov-item cash-mov-item--${isExpense ? 'expense' : 'income'}`}
                          >
                            <div className="cash-mov-item__body">
                              <span className="cash-mov-item__concept">{m.concept}</span>
                              <span className="cash-mov-item__meta">
                                <span className="cash-mov-item__time">{formatTime(m.date)}</span>
                                <span className="cash-mov-item__sep">·</span>
                                <span className="cash-mov-item__method">{method}</span>
                                {author && (
                                  <>
                                    <span className="cash-mov-item__sep">·</span>
                                    <span className="cash-mov-item__author">{author}</span>
                                  </>
                                )}
                              </span>
                            </div>
                            <span className="cash-mov-item__amount">
                              {isExpense ? '−' : '+'}
                              {formatMoney(m.amount)}
                            </span>
                          </li>
                        );
                      })}
                    </ul>
                  </li>
                ))}
              </ul>
            )}

            {activePendingCharges.length > 0 && (
              <div className="cash-mov-pending-section" role="group" aria-label="Cobros pendientes">
                <div className="cash-mov-pending-section__header">
                  <h4 className="cash-mov-pending-section__title">Pendientes por cobrar</h4>
                  <span className="cash-mov-pending-section__hint">
                    No suman al saldo neto · dinero esperado por cobrar
                  </span>
                </div>
                <ul className="cash-mov-pending-list">
                  {groupedPendingByDate.map(([dateKey, items]) => (
                    <li key={dateKey} className="cash-mov-date-group">
                      <h4 className="cash-mov-date">{dateKey}</h4>
                      <ul className="cash-mov-date-items">
                        {items.map((c) => {
                          const concept = (c.items || [])
                            .map((it) => it.nombre + (it.cantidad > 1 ? ` ×${it.cantidad}` : ''))
                            .join(', ') || 'Cobro';
                          return (
                            <li
                              key={c._id}
                              className="cash-mov-item cash-mov-item--pending cash-mov-item--clickable"
                              onClick={() => openPayModal(c)}
                              role="button"
                              tabIndex={0}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter' || e.key === ' ') {
                                  e.preventDefault();
                                  openPayModal(c);
                                }
                              }}
                              title={isBoxOpen ? 'Registrar pago o abono' : 'Caja cerrada — ábrela para cobrar'}
                              aria-label={`Cobrar pendiente: ${concept}`}
                            >
                              <div className="cash-mov-item__body">
                                <span className="cash-mov-item__concept">{concept}</span>
                                <span className="cash-mov-item__meta">
                                  {c.appointmentId?.motivo && (
                                    <>
                                      <span>{c.appointmentId.motivo}</span>
                                      <span className="cash-mov-item__sep">·</span>
                                    </>
                                  )}
                                  <span>Total {formatMoney(c.total)}</span>
                                  {Number(c.totalPagado) > 0 && (
                                    <>
                                      <span className="cash-mov-item__sep">·</span>
                                      <span>Pagado {formatMoney(c.totalPagado)}</span>
                                    </>
                                  )}
                                </span>
                              </div>
                              <span className="cash-mov-item__amount cash-mov-item__amount--pending">
                                {formatMoney(c.saldoPendiente)} pendiente
                              </span>
                            </li>
                          );
                        })}
                      </ul>
                    </li>
                  ))}
                </ul>
                <div className="cash-mov-pending-section__footer">
                  <span>Total pendiente</span>
                  <span className="cash-mov-pending-section__footer-amount">
                    {formatMoney(totalPendingAmount)}
                  </span>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      <Modal
        title="Registrar movimiento"
        open={modalOpen}
        onOk={handleSubmit}
        onCancel={closeModal}
        confirmLoading={submitting}
        okText="Registrar"
        cancelText="Cancelar"
        destroyOnClose
      >
        <Form form={form} layout="vertical" preserve={false}>
          <Form.Item
            name="type"
            label="Tipo"
            rules={[{ required: true, message: 'Seleccione el tipo' }]}
          >
            <Radio.Group buttonStyle="solid">
              <Radio.Button value="INCOME">Ingreso</Radio.Button>
              <Radio.Button value="EXPENSE">Egreso</Radio.Button>
            </Radio.Group>
          </Form.Item>
          <Form.Item
            name="amount"
            label="Monto"
            rules={[{ required: true, message: 'Ingrese el monto' }]}
          >
            <InputNumber
              style={{ width: '100%' }}
              min={0.01}
              max={100000000}
              step={0.01}
              precision={2}
              prefix="$"
              formatter={(value) => `${value}`.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}
              parser={(value) => value.replace(/\$\s?|(,*)/g, '')}
            />
          </Form.Item>
          <Form.Item
            name="paymentMethod"
            label="Método de pago"
            rules={[{ required: true }]}
          >
            <Radio.Group buttonStyle="solid">
              <Radio.Button value="CASH">Efectivo</Radio.Button>
              <Radio.Button value="DIGITAL">Digital / Banco</Radio.Button>
            </Radio.Group>
          </Form.Item>
          <Form.Item
            name="concept"
            label="Concepto"
            rules={[{ required: true, message: 'Ingrese el concepto' }]}
          >
            <Input placeholder="Ej. Consulta, Limpieza, Reembolso…" />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title="Registrar Pago"
        open={!!payCharge}
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
        {payCharge && (
          <>
            <div className="payment-modal__summary">
              <p><strong>Total del cobro:</strong> {formatMoney(payCharge.total)}</p>
              <p><strong>Ya pagado:</strong> {formatMoney(payCharge.totalPagado)}</p>
              <p style={{ color: 'var(--color-danger)', fontWeight: 600 }}>
                <strong>Saldo pendiente:</strong> {formatMoney(payCharge.saldoPendiente)}
              </p>
              <p style={{ color: 'var(--color-danger)', fontWeight: 600 }}>
                <strong>Saldo pendiente total del paciente:</strong> {formatMoney(totalPendingAmount)}
              </p>
            </div>

            <div style={{ marginBottom: '0.75rem' }}>
              <label style={{ display: 'block', fontSize: '0.85rem', marginBottom: 4 }}>
                Monto a pagar (modifícalo para hacer un abono)
              </label>
              <Input
                type="number"
                min="0.01"
                max={payCharge.saldoPendiente}
                step="0.01"
                value={payAmount}
                onChange={(e) => setPayAmount(e.target.value)}
                onBlur={(e) => setPayAmount(String(round2(parseFloat(e.target.value) || 0)))}
                placeholder={`Máximo: ${formatMoney(payCharge.saldoPendiente)}`}
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
                onChange={(e) => setPayConfirmText(e.target.value)}
                placeholder={CONFIRM_PHRASE}
              />
            </div>
          </>
        )}
      </Modal>
    </section>
  );
};

PatientCashMovements.propTypes = {
  patientId: PropTypes.string.isRequired,
};

export default React.memo(PatientCashMovements);
