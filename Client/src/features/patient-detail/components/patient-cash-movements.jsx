import React, { useCallback, useEffect, useId, useMemo, useState } from 'react';
import PropTypes from 'prop-types';
import { Modal, Form, InputNumber, Radio, Input, message } from 'antd';
import SectionHeader from './section-header';
import {
  getMovementsByPatient,
  addMovement,
  getSessionStatus,
} from '../../../shared/services/cashService';
import { formatMoney } from '../../../shared/utils/money';
import '../styles/patient-cash-movements.css';

const formatDateGroup = (iso) =>
  new Date(iso).toLocaleDateString('es-MX', { year: 'numeric', month: 'long', day: 'numeric' });

const formatTime = (iso) =>
  new Date(iso).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' });

const PAYMENT_METHOD_LABEL = { CASH: 'Efectivo', DIGITAL: 'Digital' };

const PatientCashMovements = ({ patientId }) => {
  const sectionId = useId();
  const contentId = useId();

  const [movements, setMovements] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [expanded, setExpanded] = useState(false);
  const [isBoxOpen, setIsBoxOpen] = useState(false);

  // Modal de nuevo movimiento
  const [modalOpen, setModalOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [form] = Form.useForm();

  const loadMovements = useCallback(async (signal) => {
    if (!patientId) return;
    try {
      setLoading(true);
      setError(null);
      const data = await getMovementsByPatient(patientId, { signal });
      if (signal?.aborted) return;
      setMovements(Array.isArray(data) ? data : []);
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

        {!loading && !error && movements.length === 0 && (
          <p className="patient-detail__empty-message">
            No hay movimientos de caja registrados para este paciente.
          </p>
        )}

        {!loading && !error && movements.length > 0 && (
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
            </div>

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
    </section>
  );
};

PatientCashMovements.propTypes = {
  patientId: PropTypes.string.isRequired,
};

export default React.memo(PatientCashMovements);
