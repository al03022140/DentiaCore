import React, { useEffect, useRef, useState } from 'react';
import SignatureCanvas from 'react-signature-canvas';
import { useAuth } from '../../app/auth/AuthContext';
import WacomStuPanel from './WacomStuPanel.jsx';
import './styles/signature-pad-modal.css';

/**
 * Modal de Firma con Pad Gráfico.
 *
 * Captura una firma manuscrita sobre un canvas (mouse, touch o tableta gráfica).
 * Devuelve la firma como dataURL PNG en `onConfirm(pngDataUrl)`.
 *
 * El comportamiento se adapta al dispositivo configurado en
 * `user.preferences.signatureInput` ('mouse' | 'tablet' | 'touch' | 'stu'):
 *  - tablet: bloquea el scroll del body, captura el lápiz con
 *    setPointerCapture, canvas más grande, no re-mide al recibir
 *    `resize` (drivers de tableta los disparan al mostrar OSD), y
 *    muestra un indicador de hover cuando el lápiz se acerca.
 *  - touch: optimiza para dedo (mismas protecciones de scroll-lock).
 *  - stu: tableta de firmas Wacom STU (con pantalla LCD) vía WebHID. El
 *    paciente firma en el dispositivo y aquí se muestra un preview en vivo.
 *    Delega en <WacomStuPanel/>. Requiere Chrome/Edge + contexto seguro.
 *  - mouse: comportamiento clásico (default).
 *
 * Además, si en `mouse` detecta que el primer trazo viene de un lápiz
 * (`pointerType === 'pen'`), ofrece cambiar al modo tableta in-situ.
 *
 * @param {object} props
 * @param {boolean}  props.isOpen
 * @param {Function} props.onClose
 * @param {Function} props.onConfirm        - (pngDataUrl) => Promise|void
 * @param {string}   props.title            - "Firma del paciente", etc.
 * @param {string}   [props.subtitle]       - Línea bajo el título.
 * @param {string}   [props.signerName]
 * @param {string}   [props.signerRole]
 * @param {React.ReactNode} [props.consentText]
 * @param {boolean}  [props.loading]
 * @param {string}   [props.confirmLabel]
 * @param {string}   [props.inputDeviceOverride] - 'mouse'|'tablet'|'touch'.
 *        Forzar el modo independientemente de la preferencia del usuario.
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
  inputDeviceOverride,
}) {
  const { user } = useAuth();
  // Modo efectivo: override > preferencia del usuario > 'mouse'.
  const preferredDevice = user?.preferences?.signatureInput || 'mouse';
  const [device, setDevice] = useState(inputDeviceOverride || preferredDevice);
  useEffect(() => {
    setDevice(inputDeviceOverride || preferredDevice);
  }, [inputDeviceOverride, preferredDevice]);

  const isTablet = device === 'tablet';
  const isTouch = device === 'touch';
  const isStu = device === 'stu';
  // ¿El dispositivo configurado es la tableta Wacom STU? Lo guardamos aparte
  // de `device` porque, al elegir "Firmar en pantalla", cambiamos `device` a
  // 'mouse' (canvas) — pero seguimos queriendo ofrecer "Volver a la Wacom".
  const stuPreferred = (inputDeviceOverride || preferredDevice) === 'stu';
  // En modo tablet o touch aplicamos las protecciones (scroll-lock, capture).
  const lockInteractions = isTablet || isTouch;

  const sigRef = useRef(null);
  const wrapRef = useRef(null);
  const canvasElRef = useRef(null);
  const [empty, setEmpty] = useState(true);
  const [error, setError] = useState('');
  // Sugerencia de cambio de modo cuando detectamos un lápiz pero el usuario
  // está en modo 'mouse'. Solo se ofrece una vez por apertura del modal.
  const [penHint, setPenHint] = useState(false);
  const penHintShownRef = useRef(false);
  // Indicador visual del lápiz cuando está cerca de la tableta (hover).
  const [hoverDot, setHoverDot] = useState(null); // {x, y} | null
  // El canvas necesita píxeles explícitos; lo medimos al abrir y al hacer
  // resize. En modo tablet bloqueamos el listener tras la primera medición
  // para no resetear el trazo cuando el driver de la tableta dispara resizes.
  const [canvasSize, setCanvasSize] = useState({ w: 600, h: 240 });
  // Paso previo de consentimiento — UNIFICADO para todos los modos de firma
  // (mouse, touch, tablet y Wacom STU). Si hay `consentText`, el firmante
  // primero lee lo que va a firmar y presiona "Aceptar y firmar"; recién
  // entonces aparece el área de firma a pantalla completa. Así el flujo es
  // idéntico sin importar el dispositivo configurado.
  const requiresConsentStep = Boolean(consentText);
  const [consentAccepted, setConsentAccepted] = useState(!requiresConsentStep);

  // Medir el contenedor para ajustar el canvas (responsivo).
  useEffect(() => {
    if (!isOpen) return undefined;
    const measure = () => {
      const el = wrapRef.current;
      if (!el) return;
      // clientWidth excluye el border del wrap (2px a cada lado). Importante:
      // el canvas se renderiza sin estirar (a sus dimensiones internas), así
      // que su tamaño tiene que caber EXACTAMENTE en el área interior del
      // wrap. Si usamos getBoundingClientRect().width (que incluye border)
      // el canvas queda 4px más grande que el área disponible y el flex
      // contenedor lo encajaría en otra posición.
      const inner = el.clientWidth;
      // Tamaño del pad UNIFICADO ("en grande") para todos los modos: el área
      // de firma se ve igual de amplia con mouse, touch, tableta o Wacom. El
      // clamp por el ancho del contenedor mantiene la responsividad en
      // pantallas pequeñas (el card se encoge y el canvas con él).
      const maxW = 720;
      const w = Math.max(280, Math.min(maxW, Math.floor(inner)));
      // Como el consentimiento se lee en el paso previo, el área de firma
      // dispone de todo el espacio vertical → canvas alto (ratio 0.55, cap 480)
      // para que la firma se sienta natural en cualquier dispositivo.
      const heightRatio = 0.55;
      const maxH = 480;
      const h = Math.max(180, Math.min(maxH, Math.round(w * heightRatio)));
      setCanvasSize({ w, h });
    };
    // Sin consent aceptado, el wrap del pad aún no está montado.
    if (!consentAccepted) return undefined;
    measure();
    // En tablet: NO re-medir on resize. Los drivers de tableta gráfica
    // (Wacom, XP-Pen) disparan resize al mostrar notificaciones nativas,
    // y re-renderizar el canvas mid-stroke borra la firma.
    if (!isTablet) {
      window.addEventListener('resize', measure);
      return () => window.removeEventListener('resize', measure);
    }
    return undefined;
  }, [isOpen, isTablet, consentAccepted]);

  // Reset al abrir.
  useEffect(() => {
    if (isOpen) {
      // Cada apertura parte del dispositivo configurado. Si en una firma previa
      // se hizo fallback a "pantalla" (mouse), al reabrir volvemos a la Wacom.
      setDevice(inputDeviceOverride || preferredDevice);
      setEmpty(true);
      setError('');
      setPenHint(false);
      setHoverDot(null);
      // Si hay consentimiento, partimos en el step de lectura (cualquier modo);
      // si no, directo al área de firma. El cambio de dispositivo mid-modal
      // (penHint, o pantalla⇄Wacom) NO reabre el consent: consentAccepted solo
      // se reinicia al abrir el modal, no al togglear `device`.
      setConsentAccepted(!requiresConsentStep);
      penHintShownRef.current = false;
      setTimeout(() => sigRef.current?.clear?.(), 0);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  // Scroll-lock global del body cuando el modal está abierto en tablet/touch.
  // Sin esto la tableta puede hacer scroll del fondo cuando el lápiz cruza
  // los bordes del canvas — provocando que se "salga del paciente".
  useEffect(() => {
    if (!isOpen || !lockInteractions) return undefined;
    const prev = {
      overflow: document.body.style.overflow,
      touchAction: document.body.style.touchAction,
      overscroll: document.body.style.overscrollBehavior,
    };
    document.body.style.overflow = 'hidden';
    document.body.style.touchAction = 'none';
    document.body.style.overscrollBehavior = 'contain';
    return () => {
      document.body.style.overflow = prev.overflow;
      document.body.style.touchAction = prev.touchAction;
      document.body.style.overscrollBehavior = prev.overscroll;
    };
  }, [isOpen, lockInteractions]);

  // Listeners de Pointer Events directos sobre el canvas:
  //  - setPointerCapture en pointerdown → el trazo no se descarta aunque el
  //    pen salga del canvas mid-stroke. Crítico en tabletas.
  //  - pointermove (sin botón) en tablet → indicador de hover del lápiz.
  //  - Auto-detect pen → ofrece cambiar a modo tableta si el usuario está
  //    en mouse pero está firmando con lápiz.
  useEffect(() => {
    if (!isOpen) return undefined;
    // react-signature-canvas expone el canvas DOM vía getCanvas().
    const canvas = sigRef.current?.getCanvas?.();
    if (!canvas) return undefined;
    canvasElRef.current = canvas;

    const onPointerDown = (e) => {
      // Solo el primer pointer activo (evita multi-touch dibujando varias
      // líneas a la vez en pantallas táctiles).
      if (e.isPrimary === false) return;
      try {
        canvas.setPointerCapture(e.pointerId);
      } catch { /* algunos browsers fallan en pen sin contacto; ignorar */ }

      // Auto-detect: si el usuario está en mouse pero el primer trazo es
      // de un lápiz, sugerir cambio de modo (una vez por apertura).
      if (device === 'mouse' && e.pointerType === 'pen' && !penHintShownRef.current) {
        penHintShownRef.current = true;
        setPenHint(true);
      }
    };

    const onPointerMove = (e) => {
      // Indicador de hover del lápiz solo cuando está cerca pero NO tocando
      // (pressure=0 o buttons=0). En mouse no tiene sentido (siempre se ve).
      if (!isTablet) return;
      if (e.pointerType !== 'pen') return;
      const tocando = e.buttons > 0 || e.pressure > 0;
      if (tocando) {
        setHoverDot(null);
        return;
      }
      const rect = canvas.getBoundingClientRect();
      // El hoverDot se posiciona absolute dentro del wrap, así que sumamos
      // el offset del canvas dentro del wrap. Sin esto, el dot aparece
      // ~2px corrido (por el border del wrap) y/o desplazado horizontal
      // cuando el canvas está centrado por flex y no llena el wrap.
      setHoverDot({
        x: (e.clientX - rect.left) + canvas.offsetLeft,
        y: (e.clientY - rect.top) + canvas.offsetTop,
      });
    };

    const onPointerLeave = () => setHoverDot(null);

    // Anti "stuck stroke": signature_pad@1.x se basa en eventos mouse y un
    // flag interno `_mouseButtonDown` que se libera con `mouseup`. Algunos
    // drivers de tableta (Wacom, XP-Pen, Huion) no emiten un `mouseup`
    // limpio cuando el lápiz se levanta rápido, así que el flag queda en
    // true y los `mousemove` posteriores siguen dibujando aunque el lápiz
    // ya no esté presionado: el usuario hace UN click y aparece una línea
    // como si mantuviera el botón. Aquí, en cuanto detectamos que ningún
    // botón está realmente presionado, forzamos el fin del trazo.
    const forceStrokeEndIfReleased = (e) => {
      const sigPad = sigRef.current?._sigPad;
      if (!sigPad || !sigPad._mouseButtonDown) return;
      sigPad._mouseButtonDown = false;
      try { sigPad._strokeEnd(e); } catch { /* defensivo: distintas versiones */ }
    };

    // mousemove a nivel document: incluso si el lápiz salió del canvas
    // mid-stroke, el navegador sigue emitiendo mousemove en document. Si
    // el botón ya no está presionado, cerramos.
    const onDocMouseMove = (e) => {
      if (!isTablet) return;
      if (e.buttons === 0) forceStrokeEndIfReleased(e);
    };

    // pointermove sobre el canvas: pen con pressure=0 y buttons=0 = lápiz
    // levantado. Capture phase para correr antes del listener de signature_pad.
    const onCanvasPointerMoveCapture = (e) => {
      if (!isTablet) return;
      if (e.pointerType !== 'pen') return;
      if (e.pressure === 0 && e.buttons === 0) forceStrokeEndIfReleased(e);
    };

    canvas.addEventListener('pointerdown', onPointerDown);
    canvas.addEventListener('pointermove', onPointerMove);
    canvas.addEventListener('pointerleave', onPointerLeave);
    canvas.addEventListener('pointermove', onCanvasPointerMoveCapture, true);
    document.addEventListener('mousemove', onDocMouseMove, true);
    return () => {
      canvas.removeEventListener('pointerdown', onPointerDown);
      canvas.removeEventListener('pointermove', onPointerMove);
      canvas.removeEventListener('pointerleave', onPointerLeave);
      canvas.removeEventListener('pointermove', onCanvasPointerMoveCapture, true);
      document.removeEventListener('mousemove', onDocMouseMove, true);
    };
  }, [isOpen, device, isTablet, canvasSize.w, canvasSize.h]);

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
    try {
      const isEmpty = sigRef.current?.isEmpty?.();
      if (isEmpty === true) setEmpty(true);
    } catch {
      // ignore
    }
  };

  const handleConfirm = async () => {
    const pad = sigRef.current;
    if (!pad) {
      setError('El pad no está listo todavía. Intenta de nuevo.');
      return;
    }
    let isEmpty;
    try {
      isEmpty = pad.isEmpty();
    } catch {
      isEmpty = false;
    }
    if (isEmpty) {
      setError('La firma no puede estar vacía. Dibuja tu firma sobre el cuadro.');
      return;
    }

    let canvas;
    try {
      canvas = pad.getTrimmedCanvas ? pad.getTrimmedCanvas() : pad.getCanvas();
    } catch (e) {
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

  // Hint según el dispositivo elegido. Cálculo trivial → variable normal
  // (sin useMemo, que aquí violaría Rules of Hooks por estar después del
  // early return de `if (!isOpen) return null;`).
  let deviceHint = null;
  if (isTablet) {
    deviceHint = 'Modo tableta: acerca el lápiz al área de firma antes de presionar. El desplazamiento de la página está bloqueado mientras firmas.';
  } else if (isTouch) {
    deviceHint = 'Firma con el dedo o lápiz capacitivo. El desplazamiento de la página está bloqueado mientras firmas.';
  }

  // Layout amplio uniforme: el modal y el área de firma se ven igual de
  // grandes en todos los modos (mouse/touch/tablet/Wacom).
  const cardClass = [
    'signature-pad-card',
    'signature-pad-card--wide',
    isTouch ? 'signature-pad-card--touch' : '',
  ].filter(Boolean).join(' ');

  const wrapClass = [
    'signature-pad-canvas-wrap',
    'signature-pad-canvas-wrap--wide',
  ].join(' ');

  return (
    <div
      className={`signature-pad-overlay ${lockInteractions ? 'signature-pad-overlay--locked' : ''}`}
      onClick={handleOverlayClick}
    >
      <div
        className={cardClass}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <div className="signature-pad-header">
          <h2>{title}</h2>
          {subtitle && <p className="signature-pad-subtitle">{subtitle}</p>}
          {/* deviceHint solo en el step de firma (cuando el consent ya
              fue aceptado o no aplica). En el step de consent es prematuro. */}
          {deviceHint && consentAccepted && (
            <p className="signature-pad-device-hint">{deviceHint}</p>
          )}
        </div>

        {!consentAccepted ? (
          // ── Step 1: lectura del consentimiento — UNIVERSAL (todos los modos:
          // mouse, touch, tablet y Wacom). Damos el texto a pantalla completa y
          // un botón claro de "Aceptar y firmar" para liberar todo el espacio
          // vertical al área de firma del step 2, sin importar el dispositivo.
          <>
            <div className="signature-pad-consent signature-pad-consent--standalone">
              {consentText}
            </div>
            <p className="signature-pad-consent-cta">
              Lee el consentimiento. Al presionar <strong>Aceptar y firmar</strong> confirmas que estás de acuerdo y pasarás al área de firma.
            </p>
            {error && <p className="signature-pad-error">{error}</p>}
            <div className="signature-pad-actions">
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
                onClick={() => setConsentAccepted(true)}
                disabled={loading}
              >
                Aceptar y firmar
              </button>
            </div>
          </>
        ) : isStu ? (
          // ── Step 2a (Wacom STU): ya leído y aceptado el consentimiento, el
          // firmante firma en la tableta. WacomStuPanel maneja conexión, preview
          // en vivo y el PNG. "Firmar en pantalla" hace fallback al canvas — y
          // desde el canvas se puede volver a la Wacom (banner stuPreferred).
          <WacomStuPanel
            onCapture={onConfirm}
            onCancel={onClose}
            onFallback={() => setDevice('mouse')}
            signerName={signerName}
            signerRole={signerRole}
            loading={loading}
            confirmLabel={confirmLabel}
          />
        ) : (
          // ── Step 2b: área de firma on-screen (mouse / touch / tablet). El
          // consent ya se mostró y aceptó en el step 1 (no se repite inline).
          <>
            {penHint && (
              <div className="signature-pad-pen-hint" role="status">
                <span>Detectamos una tableta o lápiz. ¿Activar el modo tableta para mejor precisión?</span>
                <div className="signature-pad-pen-hint-actions">
                  <button
                    type="button"
                    className="signature-pad-btn signature-pad-btn-confirm"
                    onClick={() => { setDevice('tablet'); setPenHint(false); }}
                  >
                    Activar modo tableta
                  </button>
                  <button
                    type="button"
                    className="signature-pad-btn signature-pad-btn-cancel"
                    onClick={() => setPenHint(false)}
                  >
                    Ignorar
                  </button>
                </div>
              </div>
            )}

            {stuPreferred && (
              <div className="signature-pad-pen-hint" role="status">
                <span>Estás firmando en pantalla. ¿Prefieres usar la tableta Wacom?</span>
                <div className="signature-pad-pen-hint-actions">
                  <button
                    type="button"
                    className="signature-pad-btn signature-pad-btn-confirm"
                    onClick={() => setDevice('stu')}
                    disabled={loading}
                  >
                    Volver a la tableta Wacom
                  </button>
                </div>
              </div>
            )}

            <div className={wrapClass} ref={wrapRef}>
              <SignatureCanvas
                ref={sigRef}
                // key fuerza remount si el modo cambia (típicamente vía
                // penHint mouse→tablet): sin remount, signature_pad no
                // recomputa el throttle interno y los nuevos valores no
                // tienen efecto. El cost es que el trazo previo se pierde
                // al cambiar de modo — aceptable porque el penHint aparece
                // al inicio del primer trazo, antes de firmar de verdad.
                key={device}
                penColor="#102a43"
                backgroundColor="#ffffff"
                // En tablet/touch subimos un poco la velocidad mínima para
                // suavizar trazos rápidos del lápiz sin perder fidelidad.
                minWidth={isTablet ? 0.7 : 0.5}
                maxWidth={isTablet ? 2.6 : 2.5}
                // CRÍTICO en modo tableta: bajar el throttle a 0 (default 16ms)
                // y minDistance a 1px (default 5px). Sin esto, signature_pad
                // descarta eventos intermedios y movimientos rápidos pierden
                // fragmentos: las tabletas muestrean a 100-200Hz, mientras
                // que el throttle por defecto solo procesa a ~60Hz. Más caro
                // computacionalmente pero imperceptible en hardware moderno.
                throttle={isTablet ? 0 : 16}
                minDistance={isTablet ? 1 : 5}
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
              {hoverDot && (
                <div
                  className="signature-pad-hover-dot"
                  aria-hidden="true"
                  style={{ left: hoverDot.x, top: hoverDot.y }}
                />
              )}
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
          </>
        )}
      </div>
    </div>
  );
}
