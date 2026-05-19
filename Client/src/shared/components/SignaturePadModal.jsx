import React, { useEffect, useRef, useState } from 'react';
import SignatureCanvas from 'react-signature-canvas';
import './styles/signature-pad-modal.css';

/**
 * Modal de Firma con Pad Gráfico.
 *
 * Captura una firma manuscrita sobre un canvas (mouse, touch o tableta gráfica).
 * Devuelve la firma como dataURL PNG en `onConfirm(pngDataUrl)`.
 *
 * Usado para:
 *  - Firma del paciente en cada nota de evolución.
 *  - Firma del paciente al finalizar historia clínica (consentimiento).
 *  - Firma del doctor (alternativa al PIN) en notas oficiales.
 *
 * @param {object} props
 * @param {boolean}  props.isOpen
 * @param {Function} props.onClose
 * @param {Function} props.onConfirm        - (pngDataUrl) => Promise|void
 * @param {string}   props.title            - "Firma del paciente", etc.
 * @param {string}   [props.subtitle]       - Línea bajo el título.
 * @param {string}   [props.signerName]     - Nombre que aparece bajo la línea.
 * @param {string}   [props.signerRole]     - "Paciente", "Doctor", etc.
 * @param {React.ReactNode} [props.consentText] - Bloque de texto legal sobre el pad.
 * @param {boolean}  [props.loading]        - Deshabilita Confirmar (mientras sube).
 * @param {string}   [props.confirmLabel]   - Texto del botón principal.
 */
export default function SignaturePadModal({
  isOpen,
  onClose,
  onConfirm,
  title = 'Firma electrónica',
  subtitle,
  signerName,
  signerRole,
  consentText,
  loading = false,
  confirmLabel = 'Confirmar firma',
}) {
  const sigRef = useRef(null);
  const wrapRef = useRef(null);
  const [empty, setEmpty] = useState(true);
  const [error, setError] = useState('');
  // El canvas necesita píxeles explícitos; lo medimos al abrir y al hacer resize.
  const [canvasSize, setCanvasSize] = useState({ w: 600, h: 240 });

  // Medir el contenedor para ajustar el canvas (responsivo).
  useEffect(() => {
    if (!isOpen) return undefined;
    const measure = () => {
      const el = wrapRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const w = Math.max(280, Math.floor(rect.width));
      // Mantener una relación 5:2 aprox, con un mínimo legible.
      const h = Math.max(180, Math.min(320, Math.round(w * 0.4)));
      setCanvasSize({ w, h });
    };
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, [isOpen]);

  // Reset al abrir.
  useEffect(() => {
    if (isOpen) {
      setEmpty(true);
      setError('');
      // Esperar a que el canvas exista para limpiar trazos viejos.
      setTimeout(() => sigRef.current?.clear?.(), 0);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleClear = () => {
    sigRef.current?.clear?.();
    setEmpty(true);
    setError('');
  };

  // onBegin: en cuanto el usuario empieza a dibujar, marcamos no-vacío.
  // Esto NO depende de onEnd (que podía no dispararse de forma fiable cuando
  // el canvas se re-dimensiona mid-stroke o cuando el usuario suelta fuera
  // del canvas).
  const handleBegin = () => {
    setEmpty(false);
  };

  const handleEnd = () => {
    // Re-verificar empty al terminar; si por algún motivo el trazo fue
    // descartado, volvemos al estado vacío.
    try {
      const isEmpty = sigRef.current?.isEmpty?.();
      if (isEmpty === true) setEmpty(true);
    } catch {
      // ignore
    }
  };

  const handleConfirm = async () => {
    // Validación robusta en click — no dependemos del estado React local.
    // getTrimmedCanvas usa la librería `trim-canvas` que crea un buffer
    // recortado. Si fallara (lib ausente / canvas vacío), caemos al canvas
    // original sin perder la firma.
    const pad = sigRef.current;
    if (!pad) {
      setError('El pad no está listo todavía. Intenta de nuevo.');
      return;
    }
    let empty;
    try {
      empty = pad.isEmpty();
    } catch {
      empty = false; // si isEmpty falla, asumimos que hay algo y dejamos seguir
    }
    if (empty) {
      setError('La firma no puede estar vacía. Dibuja tu firma sobre el cuadro.');
      return;
    }

    let canvas;
    try {
      canvas = pad.getTrimmedCanvas ? pad.getTrimmedCanvas() : pad.getCanvas();
    } catch (e) {
      // Fallback al canvas crudo si el trim falla.
      try { canvas = pad.getCanvas(); } catch (_) {
        setError('No se pudo obtener la imagen de la firma.');
        return;
      }
    }
    let pngDataUrl;
    try {
      pngDataUrl = canvas.toDataURL('image/png');
    } catch (e) {
      setError('No se pudo generar la imagen de la firma.');
      return;
    }

    try {
      setError('');
      await onConfirm?.(pngDataUrl);
    } catch (e) {
      setError(e?.message || 'No se pudo guardar la firma.');
    }
  };

  const handleOverlayClick = () => {
    if (loading) return;
    onClose?.();
  };

  return (
    <div className="signature-pad-overlay" onClick={handleOverlayClick}>
      <div
        className="signature-pad-card"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <div className="signature-pad-header">
          <h2>{title}</h2>
          {subtitle && <p className="signature-pad-subtitle">{subtitle}</p>}
        </div>

        {consentText && (
          <div className="signature-pad-consent">{consentText}</div>
        )}

        <div className="signature-pad-canvas-wrap" ref={wrapRef}>
          <SignatureCanvas
            ref={sigRef}
            penColor="#102a43"
            backgroundColor="#ffffff"
            canvasProps={{
              width: canvasSize.w,
              height: canvasSize.h,
              className: 'signature-pad-canvas',
              'aria-label': 'Área de firma',
            }}
            onBegin={handleBegin}
            onEnd={handleEnd}
          />
          <div className="signature-pad-baseline" aria-hidden="true">
            <span className="signature-pad-baseline-x">×</span>
          </div>
        </div>

        {(signerName || signerRole) && (
          <div className="signature-pad-signer">
            {signerName && <p className="signature-pad-signer-name">{signerName}</p>}
            {signerRole && <p className="signature-pad-signer-role">{signerRole}</p>}
          </div>
        )}

        {error && <p className="signature-pad-error">{error}</p>}

        <div className="signature-pad-actions">
          <button
            type="button"
            className="signature-pad-btn signature-pad-btn-clear"
            onClick={handleClear}
            disabled={loading || empty}
          >
            Limpiar
          </button>
          <button
            type="button"
            className="signature-pad-btn signature-pad-btn-cancel"
            onClick={onClose}
            disabled={loading}
          >
            Cancelar
          </button>
          <button
            type="button"
            className="signature-pad-btn signature-pad-btn-confirm"
            onClick={handleConfirm}
            disabled={loading}
            title={empty ? 'Dibuja tu firma antes de confirmar' : ''}
          >
            {loading ? 'Guardando…' : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
