import { useState, useCallback } from 'react';
import API from '../services/axios-instance';

const MAX_PIN_ATTEMPTS = 3;

/**
 * Hook para firmar electrónicamente un documento clínico.
 *
 * Usa el endpoint POST /api/sign/:resourceType/:resourceId con PIN.
 *
 * @returns {{ signRecord, signingState, error, attemptsLeft, resetSigning }}
 */
export function useSignRecord() {
  const [signingState, setSigningState] = useState('idle'); // idle | signing | success | error | locked
  const [error, setError] = useState('');
  const [attempts, setAttempts] = useState(0);

  const attemptsLeft = MAX_PIN_ATTEMPTS - attempts;

  /**
   * Firmar un registro.
   * @param {string} resourceType - Tipo: patient, examen, receta, tratamiento, periodontograma, odontograma
   * @param {string} resourceId - ID del documento
   * @param {string} pin - PIN de 4 dígitos
   * @returns {Promise<object|null>} Datos de la firma o null si fallo
   */
  const signRecord = useCallback(async (resourceType, resourceId, pin) => {
    if (attempts >= MAX_PIN_ATTEMPTS) {
      setSigningState('locked');
      setError('Demasiados intentos fallidos. Cierre e intente de nuevo.');
      return null;
    }

    if (!pin || pin.length !== 4) {
      setError('Ingrese un PIN de 4 dígitos');
      return null;
    }

    setSigningState('signing');
    setError('');

    try {
      const { data } = await API.post(`/sign/${resourceType}/${resourceId}`, { pin });
      setSigningState('success');
      setAttempts(0);
      return data;
    } catch (err) {
      const msg = err.response?.data?.error || 'Error al firmar';
      const status = err.response?.status;

      if (status === 401 && msg.includes('PIN')) {
        const newAttempts = attempts + 1;
        setAttempts(newAttempts);

        if (newAttempts >= MAX_PIN_ATTEMPTS) {
          setSigningState('locked');
          setError('Demasiados intentos fallidos');
        } else {
          setSigningState('error');
          setError(`PIN incorrecto (${newAttempts}/${MAX_PIN_ATTEMPTS})`);
        }
      } else {
        setSigningState('error');
        setError(msg);
      }

      return null;
    }
  }, [attempts]);

  const resetSigning = useCallback(() => {
    setSigningState('idle');
    setError('');
    setAttempts(0);
  }, []);

  return { signRecord, signingState, error, attemptsLeft, resetSigning };
}

export default useSignRecord;
