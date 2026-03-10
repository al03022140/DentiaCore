import React, { useState } from 'react';
import '../styles/CapturaExtemporanea.css';

const MOTIVOS = [
  { value: 'falla_sistema', label: 'Falla de sistema' },
  { value: 'falla_electrica', label: 'Falla eléctrica' },
  { value: 'emergencia_medica', label: 'Emergencia médica — nota retroactiva' },
  { value: 'error_captura', label: 'Error de captura corregido' },
  { value: 'otro', label: 'Otro' },
];

/**
 * Modal de Captura Extemporánea — roles.MD §9.5
 *
 * Se muestra automáticamente cuando `fechaNota` difiere de `Date.now()` en > 6 h.
 * El motivo es obligatorio; sin él no se puede guardar.
 *
 * Props:
 * - fechaNota: Date — la fecha que el usuario seleccionó para la nota
 * - onConfirm(capturaData) — callback con { esExtemporanea, motivo, motivoDetalle, fechaNota }
 * - onCancel() — cierra el modal sin guardar
 */
const CapturaExtemporaneaModal = ({ fechaNota, onConfirm, onCancel }) => {
  const [motivo, setMotivo] = useState('');
  const [motivoDetalle, setMotivoDetalle] = useState('');

  const fechaServidor = new Date();
  const fechaNotaStr = fechaNota ? new Date(fechaNota).toLocaleDateString('es-MX', {
    year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit'
  }) : '—';
  const fechaServidorStr = fechaServidor.toLocaleDateString('es-MX', {
    year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit'
  });

  const canConfirm = motivo && (motivo !== 'otro' || motivoDetalle.trim().length >= 3);

  const handleConfirm = () => {
    if (!canConfirm) return;
    onConfirm({
      esExtemporanea: true,
      motivo: motivo === 'otro' ? motivoDetalle.trim() : motivo,
      motivoDetalle: motivo === 'otro' ? motivoDetalle.trim() : null,
      fechaNota: new Date(fechaNota),
    });
  };

  return (
    <div className="captura-ext-overlay" onClick={onCancel}>
      <div className="captura-ext-modal" onClick={(e) => e.stopPropagation()}>
        <div className="captura-ext-icon">&#9888;</div>
        <h3>Captura Extemporánea</h3>
        <p className="captura-ext-desc">
          Estás registrando una nota con fecha diferente a la actual.
        </p>

        <div className="captura-ext-dates">
          <div className="captura-ext-date-row">
            <span className="captura-ext-date-label">Fecha de la nota:</span>
            <span className="captura-ext-date-value">{fechaNotaStr}</span>
          </div>
          <div className="captura-ext-date-row">
            <span className="captura-ext-date-label">Fecha del servidor:</span>
            <span className="captura-ext-date-value">{fechaServidorStr}</span>
          </div>
        </div>

        <div className="captura-ext-motivo-section">
          <label className="captura-ext-motivo-label">Motivo (obligatorio):</label>
          <div className="captura-ext-motivo-options">
            {MOTIVOS.map((m) => (
              <label key={m.value} className="captura-ext-radio">
                <input
                  type="radio"
                  name="motivo"
                  value={m.value}
                  checked={motivo === m.value}
                  onChange={(e) => setMotivo(e.target.value)}
                />
                <span>{m.label}</span>
              </label>
            ))}
          </div>

          {motivo === 'otro' && (
            <input
              type="text"
              className="captura-ext-otro-input"
              placeholder="Describa el motivo..."
              value={motivoDetalle}
              onChange={(e) => setMotivoDetalle(e.target.value)}
              maxLength={200}
              autoFocus
            />
          )}
        </div>

        <div className="captura-ext-actions">
          <button type="button" className="captura-ext-btn-cancel" onClick={onCancel}>
            Cancelar
          </button>
          <button
            type="button"
            className="captura-ext-btn-confirm"
            onClick={handleConfirm}
            disabled={!canConfirm}
          >
            Confirmar y Guardar
          </button>
        </div>
      </div>
    </div>
  );
};

/**
 * Hook utilitario para integrar la captura extemporánea en formularios.
 *
 * Uso:
 *   const { checkExtemporanea, ExtemporaneaModal } = useCapturaExtemporanea();
 *
 *   const handleSave = async (formData) => {
 *     const result = await checkExtemporanea(formData.fecha);
 *     if (result === null) return; // El usuario canceló
 *     // result es { _capturaExtemporanea: {...} } o {} si no es extemporánea
 *     await api.post('/endpoint', { ...formData, ...result });
 *   };
 *
 *   return <>{ExtemporaneaModal}<form ...>...</form></>;
 */
export const useCapturaExtemporanea = () => {
  const [pending, setPending] = useState(null);
  const TOLERANCE_MS = 6 * 60 * 60 * 1000;

  const checkExtemporanea = (fechaNota) => {
    return new Promise((resolve) => {
      if (!fechaNota) {
        resolve({});
        return;
      }

      const diff = Math.abs(Date.now() - new Date(fechaNota).getTime());
      if (diff <= TOLERANCE_MS) {
        resolve({});
        return;
      }

      // Necesita justificación
      setPending({ fechaNota, resolve });
    });
  };

  const ExtemporaneaModal = pending ? (
    <CapturaExtemporaneaModal
      fechaNota={pending.fechaNota}
      onConfirm={(data) => {
        const { resolve } = pending;
        setPending(null);
        resolve({ _capturaExtemporanea: data });
      }}
      onCancel={() => {
        const { resolve } = pending;
        setPending(null);
        resolve(null);
      }}
    />
  ) : null;

  return { checkExtemporanea, ExtemporaneaModal };
};

export default CapturaExtemporaneaModal;
