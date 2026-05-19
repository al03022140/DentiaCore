import React, { useState, useEffect } from 'react';
import PropTypes from 'prop-types';
import { Modal, Input, message } from 'antd';
import SectionHeader from './section-header';
import API from '../../../shared/services/axios-instance.js';
import { useCurrentAppointment } from '../../../shared/contexts/AppointmentContext.jsx';
import '../styles/patient-treatment-plan.css';

// Componente para mostrar y editar la sección de Tratamiento a realizar
const PatientTreatmentPlan = ({ patientId, initialTreatmentPlan = null }) => {
  const { appointmentId } = useCurrentAppointment();
  const [treatmentPlan, setTreatmentPlan] = useState('');
  const [savedTreatmentPlans, setSavedTreatmentPlans] = useState(initialTreatmentPlan || []);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  
  // Confirm modal state
  const [isConfirmVisible, setIsConfirmVisible] = useState(false);
  const [confirmationText, setConfirmationText] = useState('');
  
  const sectionId = `treatment-plan-${React.useId()}`;

  // Cargar planes de tratamiento existentes al montar el componente
  useEffect(() => {
    if (initialTreatmentPlan && Array.isArray(initialTreatmentPlan)) {
      setSavedTreatmentPlans(initialTreatmentPlan);
    }
  }, [initialTreatmentPlan]);

  // Función para abrir modal de confirmación
  const handleSaveClick = () => {
    if (!treatmentPlan.trim()) {
      setError('Por favor ingrese un plan de tratamiento antes de guardar.');
      return;
    }
    setIsConfirmVisible(true);
    setConfirmationText('');
    setError(null);
  };

  // Función para confirmar y guardar el plan de tratamiento
  const handleConfirmOk = async () => {
    if (confirmationText !== 'Confirmar') {
      message.warning("Debes escribir 'Confirmar' para guardar.");
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const newTreatmentPlan = {
        texto: treatmentPlan.trim(),
        fecha: new Date().toISOString(),
        fechaFormateada: new Date().toLocaleDateString('es-ES', {
          year: 'numeric',
          month: 'long',
          day: 'numeric',
          hour: '2-digit',
          minute: '2-digit'
        }),
        confirmar: 'confirmar',
        ...(appointmentId ? { appointmentId } : {}),
      };

      // Llamada a la API para guardar el plan de tratamiento
      const response = await API.post(`/patients/${patientId}/treatment-plan`, {
        treatmentPlan: newTreatmentPlan
      });

      const body = response.data;
      const savedPlan = body?.data ? {
        ...body.data,
        fecha: body.data.fecha || newTreatmentPlan.fecha,
        fechaFormateada: body.data.fechaFormateada || newTreatmentPlan.fechaFormateada
      } : newTreatmentPlan;

      // Actualizar el estado local
      setSavedTreatmentPlans(prev => [savedPlan, ...prev]);
      setTreatmentPlan('');
      setConfirmationText('');
      setIsConfirmVisible(false);
      message.success('Plan de tratamiento agregado.');
      
    } catch (err) {
      console.error('Error al guardar plan de tratamiento:', err);
      setError('Error al guardar el plan de tratamiento. Por favor intente nuevamente.');
      message.error('Error al guardar el plan de tratamiento.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleConfirmCancel = () => {
    setIsConfirmVisible(false);
  };

  return (
  <section className="patient-detail__section patient-detail__section--treatment" aria-labelledby={sectionId}>
      <SectionHeader title="Tratamiento a realizar" id={sectionId} />
      
      {/* Mostrar planes de tratamiento guardados */}
      {savedTreatmentPlans && savedTreatmentPlans.length > 0 && (
        <div className="treatment-plan-history">
          <h3>Historial de Planes de Tratamiento</h3>
          {savedTreatmentPlans.map((item, index) => (
            <div key={index} className="treatment-plan-item">
              <div className="treatment-plan-content">
                <p>{item.texto}</p>
              </div>
              <div className="treatment-plan-date">
                <small>{item.fechaFormateada || new Date(item.fecha).toLocaleDateString('es-ES', {
                  year: 'numeric',
                  month: 'long',
                  day: 'numeric',
                  hour: '2-digit',
                  minute: '2-digit'
                })}</small>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Formulario para nuevo plan de tratamiento */}
      <div className="treatment-plan-form">
        <h3>Nuevo Plan de Tratamiento</h3>
        
        {error && (
          <div className="error-message">
            {error}
          </div>
        )}
        
        <div className="form-group">
          <label htmlFor={`treatment-plan-input-${sectionId}`}>
          </label>
          <textarea
            id={`treatment-plan-input-${sectionId}`}
            value={treatmentPlan}
            onChange={(e) => setTreatmentPlan(e.target.value)}
            placeholder="Escriba aquí el plan de tratamiento para el paciente..."
            rows={4}
            className="treatment-plan-textarea"
            disabled={isLoading}
          />
        </div>
        
        <button
          onClick={handleSaveClick}
          disabled={isLoading || !treatmentPlan.trim()}
          className="save-button"
        >
          {isLoading ? 'Guardando...' : 'Guardar Plan de Tratamiento'}
        </button>
      </div>

      <Modal
        title="Confirmar guardado"
        open={isConfirmVisible}
        onOk={handleConfirmOk}
        onCancel={handleConfirmCancel}
        okText="Confirmar"
        cancelText="Cancelar"
      >
        <p>Para confirmar el guardado del plan de tratamiento, escribe exactamente: <strong>Confirmar</strong></p>
        <Input
          value={confirmationText}
          onChange={(e) => setConfirmationText(e.target.value)}
          placeholder="Escribe 'Confirmar'"
        />
      </Modal>
    </section>
  );
};

PatientTreatmentPlan.propTypes = {
  patientId: PropTypes.string.isRequired,
  initialTreatmentPlan: PropTypes.array
};

export default React.memo(PatientTreatmentPlan);