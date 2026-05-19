import React, { useState, useEffect, useCallback } from 'react';
import { Modal, Input, Select, message } from 'antd';
import { getChargesByPatient, createCharge, addPayment } from '../../../shared/services/patientChargeService';
import { getSettings } from '../../../shared/services/settingsService';
import API from '../../../shared/services/axios-instance';
import '../styles/patient-charges-card.css';

const CONFIRM_PHRASE = 'CONFIRMO';

const PatientChargesCard = ({ patientId }) => {
  const [charges, setCharges] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showPayModal, setShowPayModal] = useState(false);
  const [selectedCharge, setSelectedCharge] = useState(null);

  // Add charge modal state
  const [serviceCatalog, setServiceCatalog] = useState([]);
  const [appointments, setAppointments] = useState([]);
  const [selectedAppointment, setSelectedAppointment] = useState(null);
  const [chargeItems, setChargeItems] = useState([]);
  const [chargeConfirmText, setChargeConfirmText] = useState('');

  // Pay modal state
  const [payAmount, setPayAmount] = useState('');
  const [payMethod, setPayMethod] = useState('CASH');
  const [payConfirmText, setPayConfirmText] = useState('');

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

  useEffect(() => { loadCharges(); }, [loadCharges]);

  // Group charges by date
  const groupedCharges = charges.reduce((groups, charge) => {
    const dateKey = new Date(charge.fecha).toLocaleDateString('es-MX', {
      year: 'numeric', month: 'long', day: 'numeric'
    });
    if (!groups[dateKey]) groups[dateKey] = [];
    groups[dateKey].push(charge);
    return groups;
  }, {});

  // Open add charge modal
  const openAddModal = async () => {
    try {
      const [settings, appointmentsRes] = await Promise.all([
        getSettings(),
        API.get('/appointments').then(r => r.data).catch(() => [])
      ]);
      setServiceCatalog(settings.serviceCatalog || []);
      const patientAppts = (Array.isArray(appointmentsRes) ? appointmentsRes : [])
        .filter(a => {
          const pid = a.paciente_id?._id || a.paciente_id;
          return pid === patientId;
        });
      setAppointments(patientAppts);
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
      precioUnitario: svc.precioDefault
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

  const chargeTotal = chargeItems.reduce((sum, item) => {
    return sum + (Number(item.cantidad) || 0) * (Number(item.precioUnitario) || 0);
  }, 0);

  const handleCreateCharge = async () => {
    if (chargeItems.length === 0) {
      message.warning('Agrega al menos un servicio');
      return;
    }
    try {
      await createCharge(patientId, {
        items: chargeItems.map(item => ({
          nombre: item.nombre,
          cantidad: Number(item.cantidad),
          precioUnitario: Number(item.precioUnitario)
        })),
        appointmentId: selectedAppointment || undefined,
        confirmacion: chargeConfirmText.trim()
      });
      message.success('Cobro registrado correctamente');
      setShowAddModal(false);
      loadCharges();
    } catch (err) {
      message.error(err.response?.data?.message || 'Error al registrar cobro');
    }
  };

  // Pay modal
  const openPayModal = (charge) => {
    setSelectedCharge(charge);
    setPayAmount('');
    setPayMethod('CASH');
    setPayConfirmText('');
    setShowPayModal(true);
  };

  const handleAddPayment = async () => {
    if (!selectedCharge) return;
    const monto = parseFloat(payAmount);
    if (!Number.isFinite(monto) || monto <= 0) {
      message.warning('Ingresa un monto válido');
      return;
    }
    try {
      await addPayment(selectedCharge._id, {
        monto,
        paymentMethod: payMethod,
        confirmacion: payConfirmText.trim()
      });
      message.success('Pago registrado correctamente');
      setShowPayModal(false);
      loadCharges();
    } catch (err) {
      message.error(err.response?.data?.message || 'Error al registrar pago');
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
                <div key={charge._id} className="charge-card">
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
                    {charge.saldoPendiente > 0 ? (
                      <span className="charge-card__balance charge-card__balance--pending">
                        Pendiente: ${charge.saldoPendiente.toLocaleString()}
                        {charge.totalPagado > 0 && ` (pagado: $${charge.totalPagado.toLocaleString()})`}
                      </span>
                    ) : (
                      <span className="charge-card__balance charge-card__balance--paid">Pagado</span>
                    )}
                  </div>
                  {charge.saldoPendiente > 0 && (
                    <button className="charge-card__pay-btn" onClick={() => openPayModal(charge)}>
                      Registrar Pago
                    </button>
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
                        onChange={e => updateItem(idx, 'precioUnitario', parseFloat(e.target.value) || 0)}
                      />
                    </td>
                    <td style={{ textAlign: 'right', fontWeight: 500 }}>
                      ${((Number(item.cantidad) || 0) * (Number(item.precioUnitario) || 0)).toLocaleString()}
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
    </section>
  );
};

export default React.memo(PatientChargesCard);
