import React, { useState, useEffect, useRef } from 'react';
import useSignRecord from '../hooks/useSignRecord';
import './styles/signature-modal.css';

/**
 * Modal de Firma Electrónica.
 *
 * Solicita el PIN de 4 dígitos y firma el documento.
 * Reutiliza el patrón visual del LockScreen.
 *
 * @param {object} props
 * @param {boolean}  props.isOpen - Si el modal está visible
 * @param {Function} props.onClose - Callback al cerrar
 * @param {Function} props.onSigned - Callback al firmar exitosamente (recibe data de firma)
 * @param {string}   props.resourceType - Tipo de recurso a firmar
 * @param {string}   props.resourceId - ID del documento
 * @param {string}   [props.description] - Descripción del documento a firmar
 */
export default function SignatureModal({ isOpen, onClose, onSigned, resourceType, resourceId, description }) {
  const [pin, setPin] = useState('');
  const { signRecord, signingState, error, attemptsLeft, resetSigning } = useSignRecord();
  const inputRef = useRef(null);

  useEffect(() => {
    if (isOpen) {
      setPin('');
      resetSigning();
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [isOpen, resetSigning]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    const result = await signRecord(resourceType, resourceId, pin);
    if (result) {
      onSigned?.(result);
      onClose?.();
    } else {
      setPin('');
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  };

  const handleClose = () => {
    resetSigning();
    onClose?.();
  };

  if (!isOpen) return null;

  const isLocked = signingState === 'locked';
  const isSigning = signingState === 'signing';

  return (
    <div className="signature-modal-overlay" onClick={handleClose}>
      <div className="signature-modal-card" onClick={(e) => e.stopPropagation()}>
        <div className="signature-modal-icon">&#9997;&#65039;</div>
        <h2>Firma Electrónica</h2>
        {description && <p className="signature-modal-desc">{description}</p>}
        <p className="signature-modal-hint">
          Ingrese su PIN de 4 dígitos para firmar
        </p>

        <form onSubmit={handleSubmit} className="signature-modal-form">
          <input
            ref={inputRef}
            type="password"
            inputMode="numeric"
            maxLength={4}
            pattern="\d{4}"
            value={pin}
            onChange={(e) => {
              const val = e.target.value.replace(/\D/g, '').slice(0, 4);
              setPin(val);
            }}
            placeholder="••••"
            className="signature-modal-input"
            disabled={isLocked || isSigning}
            autoComplete="off"
          />

          {error && <p className="signature-modal-error">{error}</p>}

          {!isLocked && attemptsLeft < 3 && attemptsLeft > 0 && (
            <p className="signature-modal-attempts">
              {attemptsLeft} intento{attemptsLeft > 1 ? 's' : ''} restante{attemptsLeft > 1 ? 's' : ''}
            </p>
          )}

          <div className="signature-modal-actions">
            <button
              type="button"
              className="signature-modal-btn-cancel"
              onClick={handleClose}
              disabled={isSigning}
            >
              Cancelar
            </button>
            <button
              type="submit"
              className="signature-modal-btn-sign"
              disabled={pin.length !== 4 || isLocked || isSigning}
            >
              {isSigning ? 'Firmando...' : 'Firmar'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
