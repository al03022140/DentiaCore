import React, { useEffect, useRef, useState } from 'react';
import SignatureCanvas from 'react-signature-canvas';
import WacomStuPanel from '../../../shared/components/WacomStuPanel.jsx';
import { useAuth } from '../../../app/auth/AuthContext';
import {
  updateProfessionalProfile,
  updateMyPreferences,
  uploadFirma,
  deleteFirma,
  fetchFirmaBlobUrl,
} from '../../../shared/services/settingsService';
import pencilIcon from '../../../assets/images/icons/pencil.svg';
import folderUploadIcon from '../../../assets/images/icons/folder-upload.svg';
import { dataUrlToBlob } from '../../../shared/utils/dataUrl';
// Reusa el mismo CSS del pad de firma del paciente para que el recuadro
// (wrap, baseline, "×", proporciones) sea idéntico aquí.
import '../../../shared/components/styles/signature-pad-modal.css';

const ProfessionalProfileSection = () => {
  // ⚠️ AuthContext expone `refreshProfile`, no `refreshUser` — el bug previo
  // hacía que el user del front no se actualizara tras subir firma.
  const { user, refreshProfile } = useAuth();
  const userId = user?._id || user?.id;

  const [cedula, setCedula] = useState(user?.cedulaProfesional || '');
  const [especialidad, setEspecialidad] = useState(user?.especialidad || '');
  const [universidad, setUniversidad] = useState(user?.universidad || '');
  const [registroSSA, setRegistroSSA] = useState(user?.registroSSA || '');
  const [msg, setMsg] = useState(null);
  const [saving, setSaving] = useState(false);

  // Dispositivo de firma — cambia el comportamiento del pad (scroll-lock,
  // pointer-capture, canvas a ancho completo). Vive en preferences del user.
  const [signatureInput, setSignatureInput] = useState(
    user?.preferences?.signatureInput || 'mouse'
  );
  const [savingDevice, setSavingDevice] = useState(false);
  const [deviceMsg, setDeviceMsg] = useState(null);

  // Firma — mismo motor que el resto del sistema (react-signature-canvas).
  const [hasFirma, setHasFirma] = useState(!!user?.firmaDigitalUrl);
  const [firmaMode, setFirmaMode] = useState('upload'); // 'upload' | 'draw'
  const [firmaMsg, setFirmaMsg] = useState(null);
  const [firmaSaving, setFirmaSaving] = useState(false);
  const [padEmpty, setPadEmpty] = useState(true);
  // Fallback STU → canvas: si el doctor tiene la Wacom STU como dispositivo pero
  // pulsa "Firmar en pantalla", dibujamos en el canvas en vez del pad. Se
  // reinicia al cambiar de dispositivo o al volver al modo "Dibujar".
  const [stuFallback, setStuFallback] = useState(false);
  // Cache-buster para forzar al <img> a recargar tras subir/reemplazar firma.
  const [firmaVersion, setFirmaVersion] = useState(() => Date.now());
  // Preview inmediato (dataURL) de la firma que acaba de hacer/subir el usuario,
  // mostrada antes de que el server la procese y devuelva la URL definitiva.
  const [localPreview, setLocalPreview] = useState(null);
  // Preview de la firma YA persistida en el servidor. Se descarga autenticada
  // (vía axios → fetchFirmaBlobUrl) y se guarda como object URL. Antes se
  // intentaba mostrar con un `<img src>` directo al endpoint protegido, que
  // devuelve 401 sin el header Bearer → la firma no se veía tras re-loguear.
  const [serverPreview, setServerPreview] = useState(null);
  const [serverPreviewLoading, setServerPreviewLoading] = useState(false);
  const sigPadRef = useRef(null);
  const padWrapRef = useRef(null);
  // El canvas necesita píxeles explícitos; lo medimos igual que en
  // SignaturePadModal para mantener el mismo aspecto (mín 280×180, ratio ~5:2).
  const [canvasSize, setCanvasSize] = useState({ w: 600, h: 240 });

  useEffect(() => {
    setHasFirma(!!user?.firmaDigitalUrl);
  }, [user?.firmaDigitalUrl]);

  // Descargar la firma persistida de forma autenticada y exponerla como object
  // URL. Se reejecuta cuando cambia la firma (firmaVersion) o el usuario. Si
  // hay preview local (recién capturada) no hace falta ir al servidor.
  useEffect(() => {
    if (localPreview || !hasFirma || !userId) {
      return undefined;
    }
    let objectUrl = null;
    let cancelled = false;
    setServerPreviewLoading(true);
    fetchFirmaBlobUrl(userId)
      .then((url) => {
        if (cancelled) { URL.revokeObjectURL(url); return; }
        objectUrl = url;
        setServerPreview(url);
      })
      .catch(() => { if (!cancelled) setServerPreview(null); })
      .finally(() => { if (!cancelled) setServerPreviewLoading(false); });
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [hasFirma, userId, firmaVersion, localPreview]);

  // Mantener el selector sincronizado si la preferencia cambia en otro tab
  // o se refresca el perfil tras guardar.
  useEffect(() => {
    if (user?.preferences?.signatureInput) {
      setSignatureInput(user.preferences.signatureInput);
    }
  }, [user?.preferences?.signatureInput]);

  // Al cambiar de dispositivo o volver al modo "Dibujar", reofrecer la Wacom STU
  // (deshace un "Firmar en pantalla" previo) para que el doctor pueda capturar
  // su firma directamente en el pad.
  useEffect(() => {
    setStuFallback(false);
  }, [signatureInput, firmaMode]);

  // Persistir el dispositivo de firma. Optimista: actualizamos el estado
  // local primero, revertimos si el server rechaza.
  const handleSignatureInputChange = async (next) => {
    if (next === signatureInput) return;
    const prev = signatureInput;
    setSignatureInput(next);
    setDeviceMsg(null);
    setSavingDevice(true);
    try {
      await updateMyPreferences({ signatureInput: next });
      await refreshProfile?.();
      setDeviceMsg({ type: 'success', text: 'Dispositivo de firma actualizado' });
    } catch (err) {
      setSignatureInput(prev);
      setDeviceMsg({
        type: 'error',
        text: err.response?.data?.message || 'No se pudo guardar el dispositivo',
      });
    } finally {
      setSavingDevice(false);
    }
  };

  // Medir el wrap del pad para dimensionar el canvas (responsivo).
  // Solo aplica en modo 'draw' — cuando el wrap está montado.
  useEffect(() => {
    if (firmaMode !== 'draw') return undefined;
    const measure = () => {
      const el = padWrapRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      // Mismas dimensiones que SignaturePadModal (720px, ratio 0.55, cap 480)
      // para que el pad de firma y el de configuración se vean idénticos.
      const w = Math.max(280, Math.min(720, Math.floor(rect.width)));
      const h = Math.max(180, Math.min(480, Math.round(w * 0.55)));
      setCanvasSize({ w, h });
    };
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, [firmaMode]);

  // ── Datos profesionales ──
  const handleSave = async (e) => {
    e.preventDefault();
    setSaving(true);
    setMsg(null);
    try {
      await updateProfessionalProfile({
        cedulaProfesional: cedula,
        especialidad,
        universidad,
        registroSSA,
      });
      await refreshProfile?.();
      setMsg({ type: 'success', text: 'Perfil profesional actualizado' });
    } catch (err) {
      setMsg({ type: 'error', text: err.response?.data?.message || 'Error al guardar' });
    } finally {
      setSaving(false);
    }
  };

  // ── Subir firma desde archivo ──
  const handleFileUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setFirmaMsg(null);

    // Validación temprana ANTES del FileReader: evita generar un dataURL en
    // memoria de archivos enormes y da feedback inmediato. El server valida
    // igual (uploadFirma middleware → 413/400). La firma es legalmente
    // relevante (NOM-004), así que el tipo importa.
    const ALLOWED = ['image/png', 'image/jpeg', 'image/jpg'];
    if (!ALLOWED.includes(file.type)) {
      setFirmaMsg({ type: 'error', text: 'Solo se aceptan imágenes PNG o JPG' });
      if (e.target) e.target.value = '';
      return;
    }
    if (file.size > 500 * 1024) {
      setFirmaMsg({ type: 'error', text: 'La firma no debe superar 500 KB' });
      if (e.target) e.target.value = '';
      return;
    }

    // Preview inmediato con el archivo elegido — el usuario ve su firma
    // antes de que termine el roundtrip al servidor.
    const reader = new FileReader();
    reader.onload = (ev) => setLocalPreview(ev.target.result);
    reader.readAsDataURL(file);

    try {
      await uploadFirma(file);
      await refreshProfile?.();
      setHasFirma(true);
      setFirmaVersion(Date.now());  // bust cache del <img>
      setFirmaMsg({ type: 'success', text: 'Firma subida correctamente' });
      // Reset input para permitir resubir el mismo archivo si hace falta.
      if (e.target) e.target.value = '';
    } catch (err) {
      setLocalPreview(null);
      setFirmaMsg({ type: 'error', text: err.response?.data?.message || 'Error al subir firma' });
    }
  };

  // ── Pad: limpiar + guardar ──
  const handleClear = () => {
    sigPadRef.current?.clear?.();
    setPadEmpty(true);
    setFirmaMsg(null);
  };

  const handleBegin = () => setPadEmpty(false);
  const handleEnd = () => {
    try {
      const empty = sigPadRef.current?.isEmpty?.();
      if (empty === true) setPadEmpty(true);
    } catch { /* ignore */ }
  };

  const saveDrawnFirma = async () => {
    const pad = sigPadRef.current;
    if (!pad) return;
    setFirmaMsg(null);

    let empty;
    try { empty = pad.isEmpty(); } catch { empty = false; }
    if (empty) {
      setFirmaMsg({ type: 'error', text: 'La firma está vacía. Dibuja antes de guardar.' });
      return;
    }

    let canvas;
    try {
      canvas = pad.getTrimmedCanvas ? pad.getTrimmedCanvas() : pad.getCanvas();
    } catch {
      try { canvas = pad.getCanvas(); } catch {
        setFirmaMsg({ type: 'error', text: 'No se pudo capturar la imagen de la firma.' });
        return;
      }
    }

    // Preview inmediato con el dataURL del canvas — instantáneo.
    try {
      setLocalPreview(canvas.toDataURL('image/png'));
    } catch { /* fallback al server después */ }

    setFirmaSaving(true);
    try {
      await new Promise((resolve, reject) => {
        canvas.toBlob(async (blob) => {
          if (!blob) return reject(new Error('No se pudo generar el PNG'));
          const file = new File([blob], 'firma.png', { type: 'image/png' });
          try {
            await uploadFirma(file);
            await refreshProfile?.();
            setHasFirma(true);
            setFirmaVersion(Date.now());
            setPadEmpty(true);
            pad.clear?.();
            setFirmaMsg({ type: 'success', text: 'Firma guardada correctamente' });
            resolve();
          } catch (err) {
            reject(err);
          }
        }, 'image/png');
      });
    } catch (err) {
      setLocalPreview(null);
      setFirmaMsg({ type: 'error', text: err?.response?.data?.message || err?.message || 'Error al guardar firma' });
    } finally {
      setFirmaSaving(false);
    }
  };

  // ── Guardar firma capturada con la tableta Wacom STU ──
  // WacomStuPanel entrega un PNG dataURL idéntico al del canvas; lo subimos por
  // el MISMO camino que la firma dibujada (uploadFirma → multipart PNG), así el
  // doctor con STU registra aquí su firma igual que firma notas/consentimientos.
  // Re-lanzamos en error para que el panel también muestre el mensaje en sitio.
  const saveStuFirma = async (pngDataUrl) => {
    if (!pngDataUrl) return;
    setFirmaMsg(null);
    setLocalPreview(pngDataUrl); // preview inmediato
    setFirmaSaving(true);
    try {
      const blob = dataUrlToBlob(pngDataUrl);
      const file = new File([blob], 'firma.png', { type: 'image/png' });
      await uploadFirma(file);
      await refreshProfile?.();
      setHasFirma(true);
      setFirmaVersion(Date.now());
      setFirmaMsg({ type: 'success', text: 'Firma guardada correctamente' });
    } catch (err) {
      setLocalPreview(null);
      const text = err?.response?.data?.message || err?.message || 'Error al guardar firma';
      setFirmaMsg({ type: 'error', text });
      throw new Error(text);
    } finally {
      setFirmaSaving(false);
    }
  };

  const handleDeleteFirma = async () => {
    if (!window.confirm('¿Eliminar la firma digital? Tendrás que volver a subirla o dibujarla para firmar con PIN.')) return;
    setFirmaMsg(null);
    try {
      await deleteFirma();
      await refreshProfile?.();
      setHasFirma(false);
      setLocalPreview(null);
      setServerPreview((prev) => { if (prev) URL.revokeObjectURL(prev); return null; });
      setFirmaVersion(Date.now());
      setFirmaMsg({ type: 'success', text: 'Firma eliminada' });
    } catch (err) {
      setFirmaMsg({ type: 'error', text: err.response?.data?.message || 'Error al eliminar firma' });
    }
  };

  // URL a mostrar en el preview:
  //  1. localPreview (dataURL) si acabamos de capturar/subir → INSTANTÁNEO
  //  2. serverPreview (object URL autenticado) si hay firma persistida
  const previewSrc = localPreview || serverPreview;

  // En modo "Dibujar", si el dispositivo configurado es la Wacom STU (y no se
  // hizo fallback a pantalla), capturamos con WacomStuPanel vía WebHID en vez
  // del canvas — el pad STU no emite eventos de puntero, así que react-signature
  // -canvas nunca recibiría el trazo.
  const useStuPanel = signatureInput === 'stu' && !stuFallback;

  return (
    <div>
      {/* Datos profesionales */}
      <form onSubmit={handleSave}>
        {msg && <div className={`settings-message ${msg.type}`}>{msg.text}</div>}
        <div className="settings-form-group">
          <label>Cédula profesional</label>
          <input value={cedula} onChange={(e) => setCedula(e.target.value)} />
        </div>
        <div className="settings-form-group">
          <label>Especialidad</label>
          <input value={especialidad} onChange={(e) => setEspecialidad(e.target.value)} />
        </div>
        <div className="settings-form-group">
          <label>Universidad</label>
          <input value={universidad} onChange={(e) => setUniversidad(e.target.value)} />
        </div>
        <div className="settings-form-group">
          <label>Registro SSA</label>
          <input value={registroSSA} onChange={(e) => setRegistroSSA(e.target.value)} />
        </div>
        <div className="settings-actions">
          <button type="submit" className="settings-btn-primary" disabled={saving}>
            {saving ? 'Guardando…' : 'Guardar datos profesionales'}
          </button>
        </div>
      </form>

      <hr style={{ margin: '2rem 0', borderColor: 'var(--color-border-light)' }} />

      {/* Dispositivo de firma — se aplica al pad de notas y al pad de aquí */}
      <h3 style={{ marginBottom: '0.5rem' }}>Dispositivo de firma</h3>
      <p style={{ marginTop: 0, marginBottom: '1rem', color: 'var(--color-text-muted)', fontSize: '0.875rem' }}>
        Cómo se captura tu firma manuscrita. Selecciona el dispositivo que usas más seguido
        para que el pad se comporte mejor (tamaño del área, bloqueo de scroll, captura del lápiz).
      </p>
      {deviceMsg && <div className={`settings-message ${deviceMsg.type}`}>{deviceMsg.text}</div>}
      <div className="signature-device-options" role="radiogroup" aria-label="Dispositivo de firma">
        {[
          {
            value: 'mouse',
            title: 'Ratón / Trackpad',
            desc: 'Para firmar con el ratón o el trackpad de la laptop.',
          },
          {
            value: 'tablet',
            title: 'Tableta gráfica',
            desc: 'Wacom, XP-Pen, Huion u otra tableta con lápiz. Bloquea el desplazamiento y captura el lápiz.',
          },
          {
            value: 'touch',
            title: 'Pantalla táctil',
            desc: 'iPad, Surface o cualquier pantalla táctil. Optimiza para dedo o lápiz capacitivo.',
          },
          {
            value: 'stu',
            title: 'Tableta de firmas Wacom STU',
            desc: 'Pad de firma con pantalla (STU-430/500/530/540). El paciente firma en el dispositivo. Requiere Chrome o Edge.',
          },
        ].map((opt) => (
          <label
            key={opt.value}
            className={`signature-device-option ${signatureInput === opt.value ? 'is-selected' : ''}`}
          >
            <input
              type="radio"
              name="signatureInput"
              value={opt.value}
              checked={signatureInput === opt.value}
              onChange={() => handleSignatureInputChange(opt.value)}
              disabled={savingDevice}
            />
            <span className="signature-device-option-info">
              <span className="signature-device-option-title">{opt.title}</span>
              <span className="signature-device-option-desc">{opt.desc}</span>
            </span>
          </label>
        ))}
      </div>

      <hr style={{ margin: '2rem 0', borderColor: 'var(--color-border-light)' }} />

      {/* Firma digital */}
      <h3 style={{ marginBottom: '1rem' }}>Firma digital</h3>
      {firmaMsg && <div className={`settings-message ${firmaMsg.type}`}>{firmaMsg.text}</div>}
      {!previewSrc && hasFirma && serverPreviewLoading && (
        <p style={{ margin: '0 0 1rem', color: 'var(--color-text-muted)', fontSize: '0.85rem' }}>
          Cargando tu firma actual…
        </p>
      )}

      {previewSrc && (
        <div style={{ marginBottom: '1rem', display: 'flex', flexDirection: 'column', gap: '0.75rem', width: '100%', maxWidth: 560, marginLeft: 'auto', marginRight: 'auto' }}>
          {/* Mismo recuadro que el pad del paciente: wrap dashed + baseline + "×".
              La firma se centra dentro manteniendo el aspect ratio del pad. */}
          <div className="signature-pad-canvas-wrap signature-pad-canvas-wrap--preview">
            <img
              src={previewSrc}
              alt="Firma digital actual"
              key={firmaVersion}
              className="signature-pad-canvas signature-pad-canvas--preview"
              onError={(e) => { e.target.style.display = 'none'; }}
            />
            <div className="signature-pad-baseline" aria-hidden="true">
              <span className="signature-pad-baseline-x">×</span>
            </div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
            <span style={{ fontWeight: 600, color: 'var(--color-text-dark)' }}>
              {localPreview ? 'Vista previa (recién guardada)' : 'Firma actual'}
            </span>
            <span style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)' }}>
              Esta es la firma que se usará al firmar con PIN en notas y consentimientos.
            </span>
            {hasFirma && (
              <button
                type="button"
                className="settings-btn-danger"
                style={{ alignSelf: 'flex-start', marginTop: '0.5rem' }}
                onClick={handleDeleteFirma}
              >
                Eliminar firma
              </button>
            )}
          </div>
        </div>
      )}

      <div className="signature-container">
        <div className="signature-toggle">
          <button
            className={firmaMode === 'upload' ? 'active' : ''}
            onClick={() => setFirmaMode('upload')}
            type="button"
          >
            <img src={folderUploadIcon} alt="" width="16" height="16" className="theme-icon" /> Subir archivo
          </button>
          <button
            className={firmaMode === 'draw' ? 'active' : ''}
            onClick={() => setFirmaMode('draw')}
            type="button"
          >
            <img src={pencilIcon} alt="" width="16" height="16" className="theme-icon" /> Dibujar
          </button>
        </div>

        {firmaMode === 'upload' ? (
          <div className="settings-form-group">
            <input type="file" accept="image/png,image/jpeg" onChange={handleFileUpload} />
            <span className="hint">PNG o JPG, máximo 500 KB</span>
          </div>
        ) : useStuPanel ? (
          // Tableta de firmas Wacom STU: mismo panel WebHID que usa el paciente
          // al firmar, ahora para que el doctor registre su propia firma.
          <WacomStuPanel
            onCapture={saveStuFirma}
            onCancel={() => setFirmaMode('upload')}
            onFallback={() => setStuFallback(true)}
            signerName={user?.nombre || ''}
            signerRole={user?.cedulaProfesional ? `Cédula ${user.cedulaProfesional}` : 'Doctor'}
            loading={firmaSaving}
            confirmLabel="Guardar firma"
          />
        ) : (
          <>
            {/* Mismo recuadro que el pad del paciente: wrap + baseline + "×". */}
            <div className="signature-pad-canvas-wrap" ref={padWrapRef}>
              <SignatureCanvas
                ref={sigPadRef}
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
            <div className="settings-actions">
              <button
                className="settings-btn-secondary"
                onClick={handleClear}
                type="button"
                disabled={firmaSaving || padEmpty}
              >
                Limpiar
              </button>
              <button
                className="settings-btn-primary"
                onClick={saveDrawnFirma}
                type="button"
                disabled={firmaSaving}
              >
                {firmaSaving ? 'Guardando…' : 'Guardar firma'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default ProfessionalProfileSection;
