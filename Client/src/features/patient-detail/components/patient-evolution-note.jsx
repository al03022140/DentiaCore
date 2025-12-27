import React, { useEffect, useMemo, useState } from 'react';
import { Modal, Input, message } from 'antd';
import API from '../../../shared/services/axios-instance.js';
import '../styles/patient-evolution-note.css';

const PatientEvolutionNote = ({ patientId, initialEvolutionNotes = [] }) => {
  const [procedimiento, setProcedimiento] = useState('');
  const [observaciones, setObservaciones] = useState('');
  const [correcciones, setCorrecciones] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [notes, setNotes] = useState(Array.isArray(initialEvolutionNotes) ? initialEvolutionNotes : []);

  // Confirm modal state (reuse pattern requiring typing 'Confirmar')
  const [isConfirmVisible, setIsConfirmVisible] = useState(false);
  const [confirmationText, setConfirmationText] = useState('');

  useEffect(() => {
    if (Array.isArray(initialEvolutionNotes)) {
      setNotes(initialEvolutionNotes);
    }
  }, [initialEvolutionNotes]);

  const isFormValid = useMemo(() => {
    return procedimiento.trim().length > 0 || observaciones.trim().length > 0 || correcciones.trim().length > 0;
  }, [procedimiento, observaciones, correcciones]);

  const resetForm = () => {
    setProcedimiento('');
    setObservaciones('');
    setCorrecciones('');
  };

  const handleSaveClick = () => {
    setIsConfirmVisible(true);
    setConfirmationText('');
  };

  const handleConfirmOk = async () => {
    if (confirmationText !== 'Confirmar') {
      message.warning("Debes escribir 'Confirmar' para guardar.");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const evolutionNote = {
        procedimiento: procedimiento.trim(),
        observaciones: observaciones.trim(),
        correcciones: correcciones.trim(),
      };
      const response = await API.post(`/patients/${patientId}/evolution-note`, { evolutionNote });
      const payload = response?.data;

      // Respuesta esperada del backend: { success, message, data: newEvolutionNote }
      if (payload && payload.success && payload.data) {
        setNotes(prev => [payload.data, ...prev]);
        message.success('Nota de evolución agregada.');
        resetForm();
      } else if (payload && payload.patient && Array.isArray(payload.patient.notas_evolucion)) {
        // Soporte defensivo si el backend devolviera el paciente completo
        setNotes(payload.patient.notas_evolucion);
        message.success('Nota de evolución agregada.');
        resetForm();
      } else {
        message.success('Nota de evolución guardada.');
      }
      setIsConfirmVisible(false);
    } catch (err) {
      console.error(err);
      setError(err?.response?.data?.message || err?.message || 'Error al guardar la nota de evolución');
      message.error('Error al guardar la nota de evolución');
    } finally {
      setLoading(false);
    }
  };

  const handleConfirmCancel = () => {
    setIsConfirmVisible(false);
  };

  return (
    <section className="patient-detail__section patient-evolution-note">
      <div className="patient-evolution-note__header">
        <h2>Notas de evolución</h2>
        <button className="Boton_Imprimir" onClick={() => window.print()}>
          Imprimir
        </button>
      </div>

      {error && <div className="error-message">{error}</div>}

      <div className="patient-evolution-note__form">
        <div className="form-row">
          <label>Procedimiento</label>
          <Input.TextArea
            value={procedimiento}
            onChange={(e) => setProcedimiento(e.target.value)}
            placeholder="Describe el procedimiento realizado"
            rows={3}
            autoSize={{ minRows: 3, maxRows: 12 }}
          />
        </div>
        <div className="form-row">
          <label>Observaciones</label>
          <Input.TextArea
            value={observaciones}
            onChange={(e) => setObservaciones(e.target.value)}
            placeholder="Observaciones adicionales"
            rows={3}
            autoSize={{ minRows: 3, maxRows: 12 }}
          />
        </div>
        <div className="form-row">
          <label>Correcciones</label>
          <Input.TextArea
            value={correcciones}
            onChange={(e) => setCorrecciones(e.target.value)}
            placeholder="Correcciones o ajustes realizados"
            rows={2}
            autoSize={{ minRows: 2, maxRows: 12 }}
          />
        </div>

        <div className="actions">
          <button
            className="save-button"
            onClick={handleSaveClick}
            disabled={!isFormValid || loading}
          >
            {loading ? 'Guardando...' : 'Guardar nota'}
          </button>
        </div>
      </div>

      <div className="patient-evolution-note__history">
        <h3>Historial</h3>
        <div className="patient-evolution-note__table-wrapper">
          <table className="patient-evolution-note__table">
            <thead>
              <tr>
                <th>#</th>
                <th>Fecha</th>
                <th>Procedimiento</th>
                <th>Observaciones</th>
                <th>Correcciones</th>
              </tr>
            </thead>
            <tbody>
              {Array.isArray(notes) && notes.length > 0 ? (
                notes.map((n, idx) => (
                  <tr key={idx}>
                    <td>{n.numero_procedimiento ?? idx + 1}</td>
                    <td>{n.fechaFormateada || n.fecha || ''}</td>
                    <td>{n.procedimiento || ''}</td>
                    <td>{n.observaciones || ''}</td>
                    <td>{n.correcciones || ''}</td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan="5" className="no-data">Sin notas registradas</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <Modal
        title="Confirmar guardado"
        open={isConfirmVisible}
        onOk={handleConfirmOk}
        onCancel={handleConfirmCancel}
        okText="Confirmar"
        cancelText="Cancelar"
      >
        <p>Para confirmar el guardado de la nota, escribe exactamente: <strong>Confirmar</strong></p>
        <Input
          value={confirmationText}
          onChange={(e) => setConfirmationText(e.target.value)}
          placeholder="Escribe 'Confirmar'"
        />
      </Modal>

      <div className="printable-evolution-notes">
        <h1>Notas de Evolución</h1>
        <table>
          <thead>
            <tr>
              <th>#</th>
              <th>Fecha</th>
              <th>Procedimiento</th>
              <th>Observaciones</th>
              <th>Correcciones</th>
            </tr>
          </thead>
          <tbody>
            {Array.isArray(notes) && notes.length > 0 ? (
              notes.map((n, idx) => (
                <tr key={idx}>
                  <td>{n.numero_procedimiento ?? idx + 1}</td>
                  <td>{n.fechaFormateada || n.fecha || ''}</td>
                  <td>{n.procedimiento || ''}</td>
                  <td>{n.observaciones || ''}</td>
                  <td>{n.correcciones || ''}</td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan="5" style={{ textAlign: 'center' }}>Sin notas registradas</td>
              </tr>
            )}
          </tbody>
        </table>

        <div className="printable-signatures">
          <div className="signature-block">
            <p>Firma del Paciente</p>
          </div>
          <div className="signature-block">
            <p>Firma del Doctor</p>
          </div>
        </div>

        <div className="print-date">
          Fecha de impresión: {new Date().toLocaleDateString()}
        </div>
      </div>
    </section>
  );
};

export default PatientEvolutionNote;