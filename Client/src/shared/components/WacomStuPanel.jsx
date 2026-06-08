import React, { useEffect, useRef, useState } from 'react';
import {
  createStuSession,
  isWacomStuSupported,
  getWacomStuUnavailabilityReason,
  hasAuthorizedStu,
} from '../lib/wacom-stu/index.js';

/**
 * Panel de captura de firma con tableta de firmas Wacom STU (vía WebHID).
 *
 * Se monta dentro de SignaturePadModal cuando el dispositivo de firma es 'stu'.
 * Maneja todo el ciclo de vida del dispositivo: auto-reconexión silenciosa al
 * montar si ya hay permiso concedido (sin diálogo ni clic), conexión manual
 * (gesto del usuario) la primera vez, preview en vivo del trazo, limpiar,
 * confirmar y desconectar.
 *
 * Produce un PNG dataURL idéntico al del pad on-screen, así que el backend no
 * cambia. Si WebHID no está disponible (Safari/Firefox, o contexto no seguro),
 * muestra el motivo y ofrece volver al canvas.
 *
 * @param {object} props
 * @param {Function} props.onCapture    (pngDataUrl) => Promise|void
 * @param {Function} props.onCancel
 * @param {Function} [props.onFallback] Cambiar al pad on-screen (mouse/tablet/touch)
 * @param {string}   [props.signerName]
 * @param {string}   [props.signerRole]
 * @param {React.ReactNode} [props.consentText]
 * @param {boolean}  [props.loading]
 * @param {string}   [props.confirmLabel]
 * @param {string}   [props.inkColor]
 */
export default function WacomStuPanel({
  onCapture,
  onCancel,
  onFallback,
  signerName,
  signerRole,
  consentText,
  loading = false,
  confirmLabel = 'Confirmar firma',
  inkColor = '#102a43',
}) {
  const supported = isWacomStuSupported();
  const unsupportedReason = supported ? null : getWacomStuUnavailabilityReason();

  const sessionRef = useRef(null);
  const mountedRef = useRef(false); // ¿el panel sigue montado? (lo usa openSession)
  const [status, setStatus] = useState(supported ? 'idle' : 'unsupported'); // idle|connecting|ready|error|unsupported
  const [deviceName, setDeviceName] = useState('');
  const [preview, setPreview] = useState(null); // dataURL del trazo en vivo
  const [empty, setEmpty] = useState(true);
  const [error, setError] = useState('');

  // Marca de montaje + limpieza: al desmontar, desconectar el dispositivo
  // SIEMPRE. mountedRef permite a openSession soltar el equipo si el panel se
  // desmonta mientras la conexión estaba en curso (en cualquier ruta).
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      const s = sessionRef.current;
      if (s) {
        s.disconnect().catch(() => {});
        sessionRef.current = null;
      }
    };
  }, []);

  // Abre una sesión STU. silent=true usa la reconexión silenciosa (getDevices,
  // sin diálogo ni clic); silent=false abre el selector WebHID (gesto manual).
  const openSession = async ({ silent }) => {
    if (!supported) return false;
    setError('');
    if (!silent) setStatus('connecting');
    // Libera cualquier sesión previa antes de abrir otra. Sin esto, reconectar
    // tras una desconexión física (status 'error', con la sesión muerta aún en
    // sessionRef) sobrescribiría la referencia sin desconectarla: su driver
    // quedaría huérfano y nunca se le llamaría disconnect(), dejando colgados
    // sus listeners globales de HID (la misma fuga que evita disconnect()).
    const stale = sessionRef.current;
    if (stale) {
      sessionRef.current = null;
      await stale.disconnect().catch(() => {});
    }
    let session = null;
    try {
      session = createStuSession({ inkColor });
      session.onPreview((dataUrl) => {
        setPreview(dataUrl);
        setEmpty(session.isEmpty());
      });
      session.onConnectionChange((kind) => {
        if (kind === 'disconnect') {
          setStatus('error');
          setError('La tableta se desconectó. Vuelve a conectarla e inténtalo de nuevo.');
        }
      });
      const info = silent ? await session.reconnect() : await session.connect();
      // Si el panel se desmontó mientras conectábamos (ruta silenciosa O manual),
      // soltamos el dispositivo y salimos sin tocar el estado de React.
      if (!mountedRef.current) {
        await session.disconnect().catch(() => {});
        return false;
      }
      if (!info) {
        // Volvemos a 'idle' (botón manual disponible). silent: la tableta
        // autorizada desapareció entre la comprobación y la apertura. manual:
        // el usuario canceló el diálogo de selección.
        setStatus('idle');
        await session.disconnect().catch(() => {});
        return false;
      }
      sessionRef.current = session;
      setDeviceName(info.deviceName || 'Wacom STU');
      await session.start();
      setEmpty(true);
      setPreview(null);
      setStatus('ready');
      return true;
    } catch (e) {
      if (session) await session.disconnect().catch(() => {});
      if (silent) {
        // Falla silenciosa: dejamos el botón manual disponible sin alarmar.
        setStatus('idle');
        return false;
      }
      setStatus('error');
      setError(
        e?.message
          ? `No se pudo conectar con la tableta: ${e.message}`
          : 'No se pudo conectar con la tableta Wacom. Verifica el cable USB y que ninguna otra aplicación la esté usando.',
      );
      return false;
    }
  };

  // Auto-reconexión SILENCIOSA al montar: si ya se concedió permiso a la tableta
  // en una firma previa, getDevices() la encuentra sin diálogo y la abrimos sola
  // → el firmante llega al panel y ya está "lista para firmar", sin clics. Si no
  // hay permiso aún (primera vez), queda el botón "Conectar tableta Wacom".
  useEffect(() => {
    if (!supported) return undefined;
    let cancelled = false;
    (async () => {
      const authorized = await hasAuthorizedStu();
      // En StrictMode (dev) el primer montaje se cancela aquí, antes de abrir el
      // dispositivo; el segundo montaje (cancelled=false) es el que conecta.
      if (cancelled || !authorized) return;
      // Ya sabemos que hay tableta autorizada: mostramos "Conectando…" para no
      // parpadear el botón manual mientras se abre sola. Si el panel se desmonta
      // mientras conecta, openSession lo detecta (mountedRef) y suelta el equipo.
      setStatus('connecting');
      await openSession({ silent: true });
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [supported]);

  const handleConnect = () => openSession({ silent: false });

  const handleClear = async () => {
    const s = sessionRef.current;
    if (!s) return;
    await s.clear();
    setPreview(null);
    setEmpty(true);
    setError('');
  };

  const handleConfirm = async () => {
    const s = sessionRef.current;
    if (!s) return;
    if (s.isEmpty()) {
      setError('La firma no puede estar vacía. Pide la firma sobre la tableta.');
      return;
    }
    const dataUrl = s.getPngDataUrl();
    if (!dataUrl) {
      setError('No se pudo generar la imagen de la firma.');
      return;
    }
    try {
      setError('');
      await onCapture?.(dataUrl);
    } catch (e) {
      setError(e?.message || 'No se pudo guardar la firma.');
    }
  };

  const handleCancel = async () => {
    const s = sessionRef.current;
    if (s) {
      await s.disconnect().catch(() => {});
      sessionRef.current = null;
    }
    onCancel?.();
  };

  // ── Render ──────────────────────────────────────────────────────────────

  if (!supported) {
    return (
      <>
        <div className="signature-pad-stu-notice signature-pad-stu-notice--warn" role="alert">
          <p style={{ margin: 0 }}>{unsupportedReason}</p>
        </div>
        <div className="signature-pad-actions">
          {onFallback && (
            <button
              type="button"
              className="signature-pad-btn signature-pad-btn-confirm"
              onClick={onFallback}
            >
              Firmar en pantalla
            </button>
          )}
          <button
            type="button"
            className="signature-pad-btn signature-pad-btn-cancel"
            onClick={onCancel}
          >
            Cancelar
          </button>
        </div>
      </>
    );
  }

  return (
    <>
      {consentText && <div className="signature-pad-consent">{consentText}</div>}

      <div className="signature-pad-stu">
        <div className="signature-pad-stu-device">
          <span className={`signature-pad-stu-dot ${status === 'ready' ? 'is-on' : ''}`} aria-hidden="true" />
          <span className="signature-pad-stu-device-name">
            {status === 'ready'
              ? `Conectado: ${deviceName}`
              : status === 'connecting'
                ? 'Conectando…'
                : 'Tableta Wacom STU no conectada'}
          </span>
        </div>

        {/* Recuadro de firma: muestra el preview en vivo del trazo del pad. */}
        <div className="signature-pad-canvas-wrap signature-pad-canvas-wrap--stu">
          {preview ? (
            <img className="signature-pad-stu-preview" src={preview} alt="Firma en curso" />
          ) : (
            <div className="signature-pad-stu-placeholder">
              {status === 'ready'
                ? 'Pide la firma sobre la tableta Wacom'
                : 'Conecta la tableta para comenzar'}
            </div>
          )}
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
      </div>

      {error && <p className="signature-pad-error">{error}</p>}

      {status !== 'ready' ? (
        <div className="signature-pad-actions">
          <button
            type="button"
            className="signature-pad-btn signature-pad-btn-confirm"
            onClick={handleConnect}
            disabled={loading || status === 'connecting'}
          >
            {status === 'connecting' ? 'Conectando…' : 'Conectar tableta Wacom'}
          </button>
          {onFallback && (
            <button
              type="button"
              className="signature-pad-btn signature-pad-btn-clear"
              onClick={onFallback}
              disabled={loading}
            >
              Firmar en pantalla
            </button>
          )}
          <button
            type="button"
            className="signature-pad-btn signature-pad-btn-cancel"
            onClick={handleCancel}
            disabled={loading}
          >
            Cancelar
          </button>
        </div>
      ) : (
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
            onClick={handleCancel}
            disabled={loading}
          >
            Cancelar
          </button>
          <button
            type="button"
            className="signature-pad-btn signature-pad-btn-confirm"
            onClick={handleConfirm}
            disabled={loading || empty}
            title={empty ? 'Aún no hay firma en la tableta' : ''}
          >
            {loading ? 'Guardando…' : confirmLabel}
          </button>
        </div>
      )}
    </>
  );
}
