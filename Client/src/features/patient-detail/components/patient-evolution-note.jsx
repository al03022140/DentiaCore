import { useEffect, useMemo, useState } from 'react';
import { Input, message } from 'antd';
import API from '../../../shared/services/axios-instance.js';
import SignatureBadge from '../../../shared/components/SignatureBadge.jsx';
import SignaturePadModal from '../../../shared/components/SignaturePadModal.jsx';
import DoctorSignStep from '../../../shared/components/DoctorSignStep.jsx';
import { useAuth } from '../../../app/auth/AuthContext.jsx';
import { hasPermission } from '../../../app/auth/permissions';
import { useCurrentAppointment } from '../../../shared/contexts/AppointmentContext.jsx';
import '../styles/patient-evolution-note.css';

const buildPatientFullName = (p) => {
  if (!p) return '';
  return [p.primer_nombre, p.otros_nombres, p.apellido_paterno, p.apellido_materno]
    .filter(Boolean)
    .join(' ')
    .trim();
};

// Clave estable por nota: usamos _id (real en notas guardadas) y caemos a un
// índice solo para notas sin _id. Debe coincidir entre el render de las cards,
// la selección de casillas y el filtro de impresión para no desincronizarse.
const noteKeyOf = (n, idx) => (n && n._id) ? n._id : `note-${idx}`;

const PatientEvolutionNote = ({
  patientId,
  initialEvolutionNotes = [],
  patientData,
  /** Solo tabla de historial (p. ej. vista de imprimir expediente): sin campos ni guardar */
  hideForm = false,
}) => {
  const { user } = useAuth();
  const { appointmentId } = useCurrentAppointment();
  // El usuario puede AUTO-firmar como OFICIAL si tiene `consultas.create`.
  // Si solo tiene `consultas.create.draft` (asistente), debe pedirle al doctor
  // que firme — o guardar como borrador.
  const canSignOfficial = hasPermission(user?.permissions, ['consultas.create']);
  const canCreateDraft = hasPermission(user?.permissions, ['consultas.create', 'consultas.create.draft']);
  const patientFullName = useMemo(() => buildPatientFullName(patientData), [patientData]);

  const [procedimiento, setProcedimiento] = useState('');
  const [observaciones, setObservaciones] = useState('');
  const [correcciones, setCorrecciones] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [notes, setNotes] = useState(Array.isArray(initialEvolutionNotes) ? initialEvolutionNotes : []);
  const [expandedNotes, setExpandedNotes] = useState(() => new Set());

  const toggleNoteExpanded = (key) => {
    setExpandedNotes(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  // Selección de notas a imprimir (casillas). Vacío = imprimir todas.
  const [selectedNoteKeys, setSelectedNoteKeys] = useState(() => new Set());

  const toggleNoteSelected = (key) => {
    setSelectedNoteKeys(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const allNoteKeys = useMemo(
    () => (Array.isArray(notes) ? notes.map((n, idx) => noteKeyOf(n, idx)) : []),
    [notes]
  );
  const selectedCount = selectedNoteKeys.size;
  const allSelected = allNoteKeys.length > 0 && allNoteKeys.every(k => selectedNoteKeys.has(k));

  const toggleSelectAll = () => {
    setSelectedNoteKeys(allSelected ? new Set() : new Set(allNoteKeys));
  };

  // Notas que realmente se imprimen: las seleccionadas, o TODAS si no hay
  // ninguna marcada (así el botón sigue funcionando como antes por defecto).
  const notesToPrint = useMemo(() => {
    if (!Array.isArray(notes)) return [];
    if (selectedNoteKeys.size === 0) return notes;
    return notes.filter((n, idx) => selectedNoteKeys.has(noteKeyOf(n, idx)));
  }, [notes, selectedNoteKeys]);

  // Nombre del profesional para la etiqueta bajo la línea de firma del doctor.
  const doctorDisplayName = user?.nombre || 'Profesional tratante';

  // Flujo de firma:
  //   null     → estado inicial (form editable)
  //   'patient' → modal de pad para que firme el paciente
  //   'doctor'  → DoctorSignStep para que firme el doctor (con selector si asistente)
  const [signStep, setSignStep] = useState(null);
  const [patientSigDataUrl, setPatientSigDataUrl] = useState(null);

  // Flujo de firma para notas ya guardadas (BORRADOR → OFICIAL)
  //   null     → sin modal abierto
  //   'patient' → pad del paciente
  //   'doctor'  → firma del doctor (PIN o pad)
  const [existingSignStep, setExistingSignStep] = useState(null);
  const [existingSignTarget, setExistingSignTarget] = useState(null); // { noteId, index }
  const [existingPatientSig, setExistingPatientSig] = useState(null);

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

  const resetSignFlow = () => {
    setSignStep(null);
    setPatientSigDataUrl(null);
  };

  // POST a /evolution-note. Si se incluyen firmas → OFICIAL; si no → BORRADOR.
  const submitNote = async ({ patientSignature, doctorSignature } = {}) => {
    setLoading(true);
    setError(null);
    try {
      const evolutionNote = {
        procedimiento: procedimiento.trim(),
        observaciones: observaciones.trim(),
        correcciones: correcciones.trim(),
        ...(appointmentId ? { appointmentId } : {}),
      };
      const body = { evolutionNote };
      if (patientSignature && doctorSignature) {
        body.patientSignature = patientSignature;
        body.doctorSignature = doctorSignature;
      }

      // Timeout 30s (no los 10s por defecto): una nota OFICIAL sube 2 PNGs de
      // firma + verificación de PIN (bcrypt) + escritura en Mongo; en una laptop
      // lenta los 10s se quedaban cortos y abortaban una subida que sí iba a
      // completar — y al reintentar se duplicaba la nota.
      const response = await API.post(`/patients/${patientId}/evolution-note`, body, { timeout: 30000 });
      const payload = response?.data;

      if (payload && payload.success && payload.data) {
        setNotes(prev => [payload.data, ...prev]);
        if (payload.data.estadoRegistro === 'OFICIAL') {
          message.success('Nota firmada y guardada como OFICIAL.');
        } else {
          message.success('Nota guardada como BORRADOR. Pídale al doctor que la firme para que sea oficial.');
        }
        resetForm();
        resetSignFlow();
      } else {
        // Respuesta 2xx pero sin success/data → no confiamos en que se guardó.
        // Antes mostrábamos "Nota guardada." y limpiábamos el form, ocultando
        // un posible fallo y haciendo perder lo capturado.
        const msg = payload?.error || payload?.message || 'No se pudo confirmar el guardado de la nota. Recargue y verifique antes de reintentar.';
        setError(msg);
        message.error(msg);
        throw new Error(msg);
      }
    } catch (err) {
      console.error(err);
      // Timeout / sin respuesta: la nota PUDO guardarse en el servidor aunque el
      // cliente no recibiera el 201. Como el POST de creación no es idempotente
      // (el contador ya avanzó), un reintento a ciegas DUPLICA la nota. Avisamos
      // explícitamente para que el usuario recargue y verifique antes de reintentar.
      const isTimeout = err?.code === 'ECONNABORTED'
        || err?.code === 'ERR_NETWORK'
        || (!err?.response && /timeout/i.test(err?.message || ''));
      const msg = isTimeout
        ? 'El servidor tardó demasiado en responder. La nota PUDO haberse guardado: recarga el expediente y verifica ANTES de volver a intentar, para no duplicarla.'
        : (err?.response?.data?.error || err?.response?.data?.message || err?.message || 'Error al guardar la nota');
      setError(msg);
      message.error(msg);
      throw err;
    } finally {
      setLoading(false);
    }
  };

  const handleSignAndSave = () => {
    setError(null);
    setSignStep('patient');
  };

  const handleSaveAsDraft = async () => {
    if (!canCreateDraft) {
      message.error('No tiene permiso para guardar notas de evolución.');
      return;
    }
    if (!window.confirm('¿Guardar la nota como BORRADOR? La nota no será oficial hasta que el doctor la firme.')) return;
    try {
      await submitNote();
    } catch { /* error ya mostrado */ }
  };

  const handlePatientSigned = (pngDataUrl) => {
    setPatientSigDataUrl(pngDataUrl);
    setSignStep('doctor');
  };

  const handleDoctorSigned = async (doctorSignature) => {
    await submitNote({
      patientSignature: patientSigDataUrl,
      doctorSignature,
    });
  };

  const handleCancelSign = () => {
    if (loading) return;
    resetSignFlow();
  };

  const resetExistingSignFlow = () => {
    setExistingSignStep(null);
    setExistingSignTarget(null);
    setExistingPatientSig(null);
  };

  const handleSignExistingNote = (noteId, index) => {
    setExistingSignTarget({ noteId, index });
    setExistingSignStep('patient');
  };

  const handleExistingPatientSigned = (pngDataUrl) => {
    setExistingPatientSig(pngDataUrl);
    setExistingSignStep('doctor');
  };

  const handleExistingDoctorSigned = async (doctorSignature) => {
    if (!existingSignTarget) return;
    setLoading(true);
    try {
      const { noteId } = existingSignTarget;
      // Timeout 30s como en la creación (sube firmas + valida PIN + escribe en
      // Mongo). Esta vía SÍ es segura ante reintentos: el server exige que la
      // nota siga en BORRADOR, así que un reintento tras firmar devuelve 409 sin
      // duplicar nada.
      const response = await API.post(
        `/patients/${patientId}/evolution-note/${noteId}/sign`,
        { patientSignature: existingPatientSig, doctorSignature },
        { timeout: 30000 }
      );
      const payload = response?.data;
      if (payload?.success && payload?.data) {
        // Reemplazar por _id, no por índice: entre abrir el modal y firmar la
        // lista pudo cambiar (se antepuso una nota nueva o se reordenó), y un
        // match por índice actualizaría la nota equivocada.
        const updated = payload.data;
        setNotes(prev => prev.map((n) => (
          (n._id && updated._id && n._id === updated._id) || n._id === noteId ? updated : n
        )));
        message.success('Nota firmada y marcada como OFICIAL.');
        resetExistingSignFlow();
      } else {
        // No confirmado: dejamos el modal abierto para reintentar.
        const msg = payload?.error || payload?.message || 'No se pudo confirmar la firma. Intente nuevamente.';
        message.error(msg);
      }
    } catch (err) {
      const msg = err?.response?.data?.error || err?.message || 'Error al firmar la nota';
      message.error(msg);
    } finally {
      setLoading(false);
    }
  };

  // Imprime SOLO las notas seleccionadas dentro de un IFRAME aislado.
  //
  // Por qué un iframe y no clonar al <body>: la app tiene reglas globales de
  // `@media print` (p. ej. en patient-print.css: `body * { visibility:hidden }`
  // y solo se vuelve visible lo que está dentro de `.patient-print-page`). Esas
  // reglas también se cargan en el expediente normal, así que cualquier nodo que
  // pusiéramos en el <body> —fuera de `.patient-print-page`— salía INVISIBLE y la
  // vista previa aparecía en blanco. Un iframe tiene su propio documento: las
  // hojas de estilo del padre no le aplican, y como no tocamos el <body> ni
  // clases globales, esta impresión tampoco puede dañar la del expediente.
  const handlePrint = () => {
    const printContent = document.querySelector('.printable-evolution-notes');
    if (!printContent) return;
    if (!Array.isArray(notesToPrint) || notesToPrint.length === 0) {
      message.info('No hay notas para imprimir.');
      return;
    }

    // Estilos autocontenidos (sin variables de la app, que no existen dentro del
    // iframe). Colores fijos para que siempre salga legible en papel.
    const printStyles = `
      * { box-sizing: border-box; }
      @page { size: letter; margin: 1.5cm; }
      html, body { margin: 0; padding: 0; background: #fff; color: #000;
        font-family: 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
        -webkit-print-color-adjust: exact; print-color-adjust: exact; }
      h1 { text-align: center; text-transform: uppercase; font-size: 18px; margin: 0 0 16px; }
      .print-patient-line { margin: 0 0 16px; font-size: 12px; }
      .print-note { border: 1px solid #000; border-radius: 4px; padding: 12px 14px;
        margin-bottom: 22px; page-break-inside: avoid; break-inside: avoid; }
      .print-note__head { display: flex; justify-content: space-between; align-items: baseline;
        gap: 12px; margin-bottom: 10px; padding-bottom: 6px; border-bottom: 1px solid #cbd5e0; font-size: 12px; }
      .print-note__num { font-weight: 700; text-transform: uppercase; }
      .print-note__date { color: #4a5568; }
      .print-note__table { width: 100%; border-collapse: collapse; margin-bottom: 18px; font-size: 12px; }
      .print-note__table th, .print-note__table td { border: 1px solid #000; padding: 6px;
        text-align: left; vertical-align: top; }
      .print-note__table th { width: 26%; white-space: nowrap; background: #e9edf2; }
      .print-note__table td { width: 74%; white-space: pre-wrap; word-break: break-word; }
      .signatures-container { display: flex; justify-content: space-between; gap: 40px;
        margin-top: 26px; page-break-inside: avoid; break-inside: avoid; }
      .signature-block { flex: 1; text-align: center; }
      .signature-line { border-bottom: 1px solid #000; margin-bottom: 8px; height: 40px; }
      .signature-label { font-weight: 600; margin: 0 0 4px; font-size: 12px; }
      .signature-title { font-size: 11px; color: #555; margin: 0; }
      .print-date { text-align: right; margin-top: 20px; font-size: 10px; color: #666;
        border-top: 1px solid #ddd; padding-top: 5px; }
      .print-empty { text-align: center; color: #666; margin: 24px 0; }
    `;

    // Reutilizamos el HTML ya renderizado por React (escapado) como cuerpo.
    const docHtml = '<!DOCTYPE html><html lang="es"><head><meta charset="utf-8">'
      + '<title>Notas de Evolución</title><style>' + printStyles + '</style></head>'
      + '<body>' + printContent.innerHTML + '</body></html>';

    // Limpia cualquier iframe que haya quedado de una impresión previa.
    const prev = document.getElementById('evolution-print-iframe');
    if (prev) prev.remove();

    const iframe = document.createElement('iframe');
    iframe.id = 'evolution-print-iframe';
    // Fuera de pantalla con tamaño real (NO display:none) para que el contenido
    // se renderice; si no, algunos navegadores imprimen en blanco.
    iframe.style.cssText = 'position:fixed;left:-9999px;top:0;width:800px;height:600px;border:0;';
    iframe.setAttribute('aria-hidden', 'true');
    document.body.appendChild(iframe);

    const cleanup = () => { if (iframe.parentNode) iframe.parentNode.removeChild(iframe); };

    let started = false;
    const run = () => {
      if (started) return;
      started = true;
      const win = iframe.contentWindow;
      if (!win) { cleanup(); return; }
      win.onafterprint = cleanup;
      win.focus();
      win.print();
      // Respaldo por si onafterprint no dispara en algún navegador.
      setTimeout(cleanup, 3000);
    };

    iframe.onload = run;

    const doc = iframe.contentWindow?.document;
    if (doc) {
      doc.open();
      doc.write(docHtml);
      doc.close();
    }
    // Respaldo: si onload no se dispara tras doc.write, lanza la impresión igual
    // (run está protegido contra doble ejecución).
    setTimeout(run, 400);
  };

  const patientConsentText = (
    <>
      <p>
        Yo, <strong>{patientFullName || 'el paciente'}</strong>, declaro que la información
        registrada en esta nota de evolución es veraz y corresponde a la atención clínica
        que se me brindó en esta fecha.
      </p>
      <p>
        Otorgo mi consentimiento para que el procedimiento, observaciones y correcciones
        descritos por el profesional tratante sean asentados en mi expediente clínico
        (NOM-004-SSA3-2012; LFPDPPP Arts. 8 y 16).
      </p>
    </>
  );

  return (
    <section
      className={`patient-detail__section patient-evolution-note${hideForm ? ' patient-evolution-note--history-only' : ''}`}
    >
      <div className="patient-evolution-note__header">
        <h2>Notas de evolución</h2>
        {!hideForm && (
          <button type="button" className="Boton_Imprimir" onClick={handlePrint}>
            {selectedCount > 0 ? `Imprimir (${selectedCount})` : 'Imprimir'}
          </button>
        )}
      </div>

      {error && <div className="error-message">{error}</div>}

      {!hideForm && !canSignOfficial && canCreateDraft && (
        <div className="evolution-note-hint">
          <strong>Solo el doctor puede firmar una nota de evolución.</strong>{' '}
          Para que la nota sea oficial, debe firmarla el doctor (con su PIN o pad).
          Mientras no firme, la nota quedará como <em>borrador</em>.
        </div>
      )}

      {!hideForm && (
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
            {!canSignOfficial && (
              <button
                type="button"
                className="save-button save-button--secondary"
                onClick={handleSaveAsDraft}
                disabled={!isFormValid || loading}
                title="La nota queda como borrador hasta que el doctor la firme"
              >
                {loading ? 'Guardando...' : 'Guardar borrador'}
              </button>
            )}
            <button
              type="button"
              className="save-button"
              onClick={handleSignAndSave}
              disabled={!isFormValid || loading}
            >
              {loading
                ? 'Guardando...'
                : (canSignOfficial ? 'Firmar y guardar nota' : 'Pedir firma del doctor ahora')}
            </button>
          </div>
        </div>
      )}

      <div className="patient-evolution-note__history">
        <h3>Historial</h3>

        {!hideForm && Array.isArray(notes) && notes.length > 0 && (
          <div className="evolution-note-select-bar no-print">
            <label className="evolution-note-select-all">
              <input
                type="checkbox"
                checked={allSelected}
                ref={(el) => {
                  if (el) el.indeterminate = selectedCount > 0 && !allSelected;
                }}
                onChange={toggleSelectAll}
              />
              Seleccionar todas
            </label>
            <span className="evolution-note-select-hint">
              {selectedCount > 0
                ? `${selectedCount} nota${selectedCount > 1 ? 's' : ''} seleccionada${selectedCount > 1 ? 's' : ''} para imprimir`
                : 'Marca las notas que quieres imprimir y firmar (si no marcas ninguna, se imprimen todas)'}
            </span>
          </div>
        )}

        <div className="patient-evolution-note__cards">
          {Array.isArray(notes) && notes.length > 0 ? (
            notes.map((n, idx) => {
              const noteKey = n._id || `note-${idx}`;
              const isExpanded = expandedNotes.has(noteKey);
              // Número canónico del backend. No usamos idx+1 como fallback:
              // tras filtrar notas soft-deleted hay huecos legítimos y idx+1
              // mostraría un número distinto al real del expediente.
              const num = n.numero_procedimiento ?? '—';
              const date = n.fechaFormateada || n.fecha || '';
              const hasProcedimiento = !!(n.procedimiento && n.procedimiento.trim());
              const hasObservaciones = !!(n.observaciones && n.observaciones.trim());
              const hasCorrecciones = !!(n.correcciones && n.correcciones.trim());
              const isLong = (n.procedimiento || '').length > 110
                || (n.observaciones || '').length > 110
                || (n.correcciones || '').length > 110;
              const showToggle = isLong;

              return (
                <article
                  key={noteKey}
                  className={`evolution-note-card${isExpanded ? ' is-expanded' : ''}`}
                >
                  <header className="evolution-note-card__header">
                    {!hideForm && (
                      <label
                        className="evolution-note-card__select no-print"
                        title="Seleccionar esta nota para imprimir"
                      >
                        <input
                          type="checkbox"
                          checked={selectedNoteKeys.has(noteKey)}
                          onChange={() => toggleNoteSelected(noteKey)}
                        />
                      </label>
                    )}
                    <h3 className="evolution-note-card__title">
                      Nota <span className="evolution-note-card__num">#{num}</span>
                      {date && (
                        <>
                          <span className="evolution-note-card__sep" aria-hidden="true">·</span>
                          <span className="evolution-note-card__date">{date}</span>
                        </>
                      )}
                    </h3>
                    <div className="evolution-note-card__sigs">
                      <div className="evolution-note-card__sig-slot">
                        <span className="evolution-note-card__sig-label">Doctor</span>
                        {n.doctorFirmaUrl ? (
                          <a
                            href={n.doctorFirmaUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="doctor-sig-link"
                            title={[
                              n.firmadoPor?.nombre ? `Firmada por ${n.firmadoPor.nombre}` : 'Firmada',
                              n.firmadoEn ? `el ${new Date(n.firmadoEn).toLocaleString()}` : '',
                              n.doctorFirmaMethod === 'pin' ? '(firmada con PIN)' : '(firmada con pad)',
                            ].filter(Boolean).join(' ')}
                          >
                            <img
                              src={n.doctorFirmaUrl}
                              alt="Firma del doctor"
                              className="doctor-sig-thumb"
                            />
                            {n.firmaDesactualizada && (
                              <span className="doctor-sig-stale" title="La nota fue modificada tras firmar — firma desactualizada">⚠</span>
                            )}
                          </a>
                        ) : (
                          <SignatureBadge
                            firmadoPor={n.firmadoPor}
                            firmadoEn={n.firmadoEn}
                            firmaDesactualizada={n.firmaDesactualizada}
                            contentHash={n.contentHash}
                            canSign={canSignOfficial}
                            onSignClick={() => handleSignExistingNote(n._id, idx)}
                          />
                        )}
                      </div>
                      <div className="evolution-note-card__sig-slot">
                        <span className="evolution-note-card__sig-label">Paciente</span>
                        {n.pacienteFirmaUrl ? (
                          <a
                            href={n.pacienteFirmaUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="patient-sig-link"
                            title={`Firmada ${n.pacienteFirmadoEn ? new Date(n.pacienteFirmadoEn).toLocaleString() : ''}`}
                          >
                            <img
                              src={n.pacienteFirmaUrl}
                              alt="Firma del paciente"
                              className="patient-sig-thumb"
                            />
                          </a>
                        ) : (
                          <span className="patient-sig-missing">— sin firma —</span>
                        )}
                      </div>
                    </div>
                  </header>

                  <div className="evolution-note-card__body">
                    {hasProcedimiento && (
                      <p className={`evolution-note-card__field${isExpanded ? '' : ' is-clamped'}`}>
                        <strong>Procedimiento:</strong>{' '}
                        <span className="evolution-note-card__value">
                          {n.procedimiento}
                        </span>
                      </p>
                    )}
                    {hasObservaciones && (
                      <p className={`evolution-note-card__field${isExpanded ? '' : ' is-clamped'}`}>
                        <strong>Observaciones:</strong>{' '}
                        <span className="evolution-note-card__value">
                          {n.observaciones}
                        </span>
                      </p>
                    )}
                    {hasCorrecciones && (
                      <p className={`evolution-note-card__field${isExpanded ? '' : ' is-clamped'}`}>
                        <strong>Correcciones:</strong>{' '}
                        <span className="evolution-note-card__value">
                          {n.correcciones}
                        </span>
                      </p>
                    )}
                    {!hasProcedimiento && !hasObservaciones && !hasCorrecciones && (
                      <p className="evolution-note-card__empty">Nota sin contenido registrado.</p>
                    )}
                  </div>

                  {showToggle && (
                    <button
                      type="button"
                      className="evolution-note-card__toggle"
                      aria-expanded={isExpanded}
                      onClick={() => toggleNoteExpanded(noteKey)}
                    >
                      {isExpanded ? 'Ver menos ▴' : 'Ver más ▾'}
                    </button>
                  )}
                </article>
              );
            })
          ) : (
            <div className="evolution-note-card evolution-note-card--empty-state">
              Sin notas registradas
            </div>
          )}
        </div>
      </div>

      {!hideForm && (
      <div className="printable-evolution-notes">
        <h1>Notas de Evolución</h1>
        <p className="print-patient-line">
          <strong>Paciente:</strong> {patientFullName || '—'}
        </p>

        {Array.isArray(notesToPrint) && notesToPrint.length > 0 ? (
          notesToPrint.map((n, idx) => {
            const num = n.numero_procedimiento ?? '—';
            const fecha = n.fechaFormateada || n.fecha || '';
            const docName = n.firmadoPor?.nombre || doctorDisplayName;
            return (
              <div className="print-note" key={n._id || `print-${idx}`}>
                <div className="print-note__head">
                  <span className="print-note__num">Nota #{num}</span>
                  {fecha && <span className="print-note__date">{fecha}</span>}
                </div>
                <table className="print-note__table">
                  <tbody>
                    <tr>
                      <th>Procedimiento</th>
                      <td>{n.procedimiento || '—'}</td>
                    </tr>
                    <tr>
                      <th>Observaciones</th>
                      <td>{n.observaciones || '—'}</td>
                    </tr>
                    <tr>
                      <th>Correcciones</th>
                      <td>{n.correcciones || '—'}</td>
                    </tr>
                  </tbody>
                </table>
                <div className="signatures-container">
                  <div className="signature-block">
                    <div className="signature-line"></div>
                    <p className="signature-label">{patientFullName}</p>
                    <p className="signature-title">Firma del Paciente</p>
                  </div>
                  <div className="signature-block">
                    <div className="signature-line"></div>
                    <p className="signature-label">{docName}</p>
                    <p className="signature-title">Firma del Doctor</p>
                  </div>
                </div>
              </div>
            );
          })
        ) : (
          <p className="print-empty">Sin notas registradas</p>
        )}

        <div className="print-date">
          Fecha de impresión: {new Date().toLocaleDateString()}
        </div>
      </div>
      )}

      {/* PASO 1 — Firma del paciente */}
      <SignaturePadModal
        isOpen={signStep === 'patient'}
        onClose={handleCancelSign}
        onConfirm={handlePatientSigned}
        title="Firma del paciente"
        subtitle="Consentimiento de la nota de evolución"
        signerName={patientFullName}
        signerRole="Paciente"
        consentText={patientConsentText}
        confirmLabel="Confirmar firma del paciente"
        loading={loading}
      />

      {/* PASO 2 — Firma del doctor (self o cross-user vía selector) */}
      <DoctorSignStep
        isOpen={signStep === 'doctor'}
        onClose={handleCancelSign}
        onConfirm={handleDoctorSigned}
        title="Firma del doctor"
        subtitle={canSignOfficial
          ? 'Confirma la autoría con tu PIN o redibujando tu firma.'
          : 'Pídale al doctor que firme con su PIN para que la nota sea oficial.'}
        loading={loading}
      />

      {/* PASO 1 — Firma del paciente (nota ya guardada) */}
      <SignaturePadModal
        isOpen={existingSignStep === 'patient'}
        onClose={() => { if (!loading) resetExistingSignFlow(); }}
        onConfirm={handleExistingPatientSigned}
        title="Firma del paciente"
        subtitle="Consentimiento de la nota de evolución"
        signerName={patientFullName}
        signerRole="Paciente"
        consentText={patientConsentText}
        confirmLabel="Confirmar firma del paciente"
        loading={loading}
      />

      {/* PASO 2 — Firma del doctor (nota ya guardada) */}
      <DoctorSignStep
        isOpen={existingSignStep === 'doctor'}
        onClose={() => { if (!loading) resetExistingSignFlow(); }}
        onConfirm={handleExistingDoctorSigned}
        title="Firma del doctor"
        subtitle={canSignOfficial
          ? 'Confirma la autoría con tu PIN o redibujando tu firma.'
          : 'Pídale al doctor que firme con su PIN para que la nota sea oficial.'}
        loading={loading}
      />
    </section>
  );
};

export default PatientEvolutionNote;
