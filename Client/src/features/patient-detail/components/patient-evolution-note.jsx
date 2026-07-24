import { useEffect, useMemo, useState } from 'react';
import { Input, Modal, message } from 'antd';
import API from '../../../shared/services/axios-instance.js';
import SignatureBadge from '../../../shared/components/SignatureBadge.jsx';
import SignaturePadModal from '../../../shared/components/SignaturePadModal.jsx';
import DoctorSignStep from '../../../shared/components/DoctorSignStep.jsx';
import ImagePreviewModal from '../../../shared/components/ImagePreviewModal.jsx';
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

// Motivos del endpoint de verificación de integridad → texto legible.
const VERIFY_MOTIVOS = {
  contenido_alterado: 'El contenido de la nota fue modificado después de la firma.',
  oficial_sin_hash_contenido: 'La nota es OFICIAL pero no tiene hash de contenido de referencia.',
  firma_doctor_alterada: 'La imagen de la firma del doctor no coincide con la sellada al firmar.',
  oficial_sin_firma_doctor: 'La nota es OFICIAL pero no tiene firma del doctor íntegra.',
  firma_paciente_alterada: 'La imagen de la firma del paciente no coincide con la sellada al firmar.',
};

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

  // Flujo de firma unificado (nota nueva y nota ya guardada):
  //   signStep   null → sin modal abierto | 'patient' → pad del paciente | 'doctor' → DoctorSignStep
  //   signTarget null → nota nueva (submitNote) | { noteId, index } → nota existente (BORRADOR → OFICIAL)
  const [signStep, setSignStep] = useState(null);
  const [signTarget, setSignTarget] = useState(null);
  const [patientSigDataUrl, setPatientSigDataUrl] = useState(null);

  // Vista previa de una firma ya guardada (thumbnail del historial) — { src, alt, title } | null
  const [sigPreview, setSigPreview] = useState(null);

  // Edición inline de un BORRADOR propio (PATCH /evolution-note/:noteId). El
  // server exige creador-o-admin y estado BORRADOR; aquí solo se muestra al
  // creador para no ofrecer un botón que acabaría en 403.
  const [editingKey, setEditingKey] = useState(null);
  const [editValues, setEditValues] = useState({ procedimiento: '', observaciones: '', correcciones: '' });
  const [savingEdit, setSavingEdit] = useState(false);

  // Verificación de integridad (GET /evolution-note/:noteId/verify).
  const [verifyingKey, setVerifyingKey] = useState(null);

  const startEditNote = (n, key) => {
    setEditingKey(key);
    setEditValues({
      procedimiento: n.procedimiento || '',
      observaciones: n.observaciones || '',
      correcciones: n.correcciones || '',
    });
  };

  const cancelEditNote = () => {
    if (savingEdit) return;
    setEditingKey(null);
  };

  const saveEditNote = async (noteId) => {
    const hasAny = Object.values(editValues).some(v => (v || '').trim());
    if (!hasAny) {
      message.error('La nota no puede quedar vacía (requiere procedimiento, observaciones o correcciones).');
      return;
    }
    setSavingEdit(true);
    try {
      const res = await API.patch(`/patients/${patientId}/evolution-note/${noteId}`, editValues);
      const payload = res?.data;
      if (payload?.success && payload?.data) {
        setNotes(prev => prev.map(x => (x._id === noteId ? { ...x, ...payload.data } : x)));
        setEditingKey(null);
        message.success('Borrador actualizado.');
      } else {
        message.error(payload?.error || 'No se pudo actualizar la nota.');
      }
    } catch (err) {
      // 409 = la firmaron en paralelo (ya no es editable); 403 = no es el creador.
      message.error(err?.response?.data?.error || 'No se pudo actualizar la nota.');
    } finally {
      setSavingEdit(false);
    }
  };

  const handleVerifyNote = async (n, key) => {
    setVerifyingKey(key);
    try {
      const res = await API.get(`/patients/${patientId}/evolution-note/${n._id}/verify`);
      const d = res?.data;
      if (d?.success && d.integro) {
        message.success(`Nota #${n.numero_procedimiento}: íntegra — el contenido y las firmas coinciden con lo sellado al firmar.`);
      } else if (d?.success) {
        Modal.warning({
          title: `Nota #${n.numero_procedimiento}: integridad comprometida`,
          content: (
            <ul style={{ paddingLeft: 18, margin: '8px 0 0' }}>
              {(d.motivos || []).map((m) => (
                <li key={m}>{VERIFY_MOTIVOS[m] || m}</li>
              ))}
            </ul>
          ),
        });
      } else {
        message.error(d?.error || 'No se pudo verificar la nota.');
      }
    } catch (err) {
      message.error(err?.response?.data?.error || 'No se pudo verificar la nota.');
    } finally {
      setVerifyingKey(null);
    }
  };

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
    setSignTarget(null);
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

  // Inicia el flujo de firma. target=null → nota nueva (limpia el error del
  // form, igual que antes handleSignAndSave); target={noteId,index} → nota
  // existente (antes handleSignExistingNote no limpiaba error; se preserva).
  const handleStartDoctorSign = (target = null) => {
    if (!target) setError(null);
    setSignTarget(target);
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

  // Nota nueva (signTarget=null) → submitNote (el error se propaga, igual
  // que antes). Nota existente → POST .../sign; ante fallo deja el modal
  // abierto para reintentar (no relanza), igual que antes
  // handleExistingDoctorSigned.
  const handleDoctorSigned = async (doctorSignature) => {
    if (!signTarget) {
      await submitNote({
        patientSignature: patientSigDataUrl,
        doctorSignature,
      });
      return;
    }

    setLoading(true);
    try {
      const { noteId } = signTarget;
      // Timeout 30s como en la creación (sube firmas + valida PIN + escribe en
      // Mongo). Esta vía SÍ es segura ante reintentos: el server exige que la
      // nota siga en BORRADOR, así que un reintento tras firmar devuelve 409 sin
      // duplicar nada.
      const response = await API.post(
        `/patients/${patientId}/evolution-note/${noteId}/sign`,
        { patientSignature: patientSigDataUrl, doctorSignature },
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
        resetSignFlow();
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

  const handleCancelSign = () => {
    if (loading) return;
    resetSignFlow();
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

  // Enunciado del DOCTOR — paralelo al del paciente. Se muestra como paso
  // previo a la firma con pad/Wacom para que el flujo sea idéntico (leer lo
  // que se firma → aceptar → firmar). En el método PIN no aplica (no hay pad).
  const doctorConsentText = (
    <>
      <p>
        Como <strong>profesional tratante</strong>, confirmo que soy el autor de esta nota de
        evolución y que el procedimiento, observaciones y correcciones aquí registrados
        corresponden a la atención clínica brindada al paciente en esta fecha.
      </p>
      <p>
        Firmo para dar validez oficial a este registro en el expediente clínico
        (NOM-004-SSA3-2012).
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
              maxLength={5000}
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
              maxLength={20000}
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
              maxLength={20000}
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
              onClick={() => handleStartDoctorSign()}
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
              const noteKey = noteKeyOf(n, idx);
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
              const isEditing = editingKey === noteKey;
              // Solo el creador ve "Editar" (el server además acepta admins,
              // pero mostrarlo a terceros acabaría en 403).
              const creadoPorId = n.creadoPor && typeof n.creadoPor === 'object' ? n.creadoPor._id : n.creadoPor;
              const canEditThisDraft = !hideForm && canCreateDraft
                && n.estadoRegistro === 'BORRADOR' && n._id
                && creadoPorId && String(creadoPorId) === String(user?.id || '');
              const canVerify = !hideForm && n.estadoRegistro === 'OFICIAL' && n._id;

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
                      {n.estadoRegistro === 'BORRADOR' && (
                        <span
                          className="evolution-note-card__draft-badge"
                          title="Nota sin firmar — no es oficial todavía"
                        >
                          BORRADOR
                        </span>
                      )}
                    </h3>
                    <div className="evolution-note-card__sigs">
                      <div className="evolution-note-card__sig-slot">
                        <span className="evolution-note-card__sig-label">Doctor</span>
                        {n.doctorFirmaUrl ? (
                          <button
                            type="button"
                            className="doctor-sig-link"
                            title={[
                              n.firmadoPor?.nombre ? `Firmada por ${n.firmadoPor.nombre}` : 'Firmada',
                              n.firmadoEn ? `el ${new Date(n.firmadoEn).toLocaleString()}` : '',
                              n.doctorFirmaMethod === 'pin' ? '(firmada con PIN)' : '(firmada con pad)',
                            ].filter(Boolean).join(' ')}
                            onClick={() => setSigPreview({
                              src: n.doctorFirmaUrl,
                              alt: 'Firma del doctor',
                              title: 'Firma del doctor'
                            })}
                          >
                            <img
                              src={n.doctorFirmaUrl}
                              alt="Firma del doctor"
                              className="doctor-sig-thumb"
                            />
                            {n.firmaDesactualizada && (
                              <span className="doctor-sig-stale" title="La nota fue modificada tras firmar — firma desactualizada">⚠</span>
                            )}
                          </button>
                        ) : (
                          <SignatureBadge
                            firmadoPor={n.firmadoPor}
                            firmadoEn={n.firmadoEn}
                            firmaDesactualizada={n.firmaDesactualizada}
                            contentHash={n.contentHash}
                            canSign={canSignOfficial}
                            onSignClick={() => handleStartDoctorSign({ noteId: n._id, index: idx })}
                          />
                        )}
                      </div>
                      <div className="evolution-note-card__sig-slot">
                        <span className="evolution-note-card__sig-label">Paciente</span>
                        {n.pacienteFirmaUrl ? (
                          <button
                            type="button"
                            className="patient-sig-link"
                            title={`Firmada ${n.pacienteFirmadoEn ? new Date(n.pacienteFirmadoEn).toLocaleString() : ''}`}
                            onClick={() => setSigPreview({
                              src: n.pacienteFirmaUrl,
                              alt: 'Firma del paciente',
                              title: 'Firma del paciente'
                            })}
                          >
                            <img
                              src={n.pacienteFirmaUrl}
                              alt="Firma del paciente"
                              className="patient-sig-thumb"
                            />
                          </button>
                        ) : (
                          <span className="patient-sig-missing">— sin firma —</span>
                        )}
                      </div>
                    </div>
                  </header>

                  {/* El doctor rechazó este borrador desde el Centro de Firmas.
                      El motivo se persiste precisamente para que el creador lo
                      vea aquí y corrija — antes no se mostraba en ningún lado. */}
                  {n.estadoRegistro === 'BORRADOR' && n.rechazoMotivo && (
                    <div className="evolution-note-card__rejected" role="alert">
                      <strong>
                        Rechazada por el doctor
                        {n.rechazadoEn ? ` el ${new Date(n.rechazadoEn).toLocaleDateString('es-MX')}` : ''}:
                      </strong>{' '}
                      {n.rechazoMotivo}
                    </div>
                  )}

                  {isEditing ? (
                    <div className="evolution-note-card__edit">
                      <label htmlFor={`edit-proc-${noteKey}`}>Procedimiento</label>
                      <Input.TextArea
                        id={`edit-proc-${noteKey}`}
                        value={editValues.procedimiento}
                        onChange={(e) => setEditValues(v => ({ ...v, procedimiento: e.target.value }))}
                        autoSize={{ minRows: 2, maxRows: 10 }}
                        maxLength={5000}
                        disabled={savingEdit}
                      />
                      <label htmlFor={`edit-obs-${noteKey}`}>Observaciones</label>
                      <Input.TextArea
                        id={`edit-obs-${noteKey}`}
                        value={editValues.observaciones}
                        onChange={(e) => setEditValues(v => ({ ...v, observaciones: e.target.value }))}
                        autoSize={{ minRows: 2, maxRows: 10 }}
                        maxLength={20000}
                        disabled={savingEdit}
                      />
                      <label htmlFor={`edit-corr-${noteKey}`}>Correcciones</label>
                      <Input.TextArea
                        id={`edit-corr-${noteKey}`}
                        value={editValues.correcciones}
                        onChange={(e) => setEditValues(v => ({ ...v, correcciones: e.target.value }))}
                        autoSize={{ minRows: 2, maxRows: 10 }}
                        maxLength={20000}
                        disabled={savingEdit}
                      />
                      <div className="evolution-note-card__edit-actions">
                        <button
                          type="button"
                          className="save-button save-button--secondary"
                          onClick={cancelEditNote}
                          disabled={savingEdit}
                        >
                          Cancelar
                        </button>
                        <button
                          type="button"
                          className="save-button"
                          onClick={() => saveEditNote(n._id)}
                          disabled={savingEdit}
                        >
                          {savingEdit ? 'Guardando…' : 'Guardar cambios'}
                        </button>
                      </div>
                    </div>
                  ) : (
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
                  )}

                  {!isEditing && (showToggle || canEditThisDraft || canVerify) && (
                    <div className="evolution-note-card__footer no-print">
                      {canEditThisDraft && (
                        <button
                          type="button"
                          className="evolution-note-card__action-btn"
                          onClick={() => startEditNote(n, noteKey)}
                        >
                          Editar borrador
                        </button>
                      )}
                      {canVerify && (
                        <button
                          type="button"
                          className="evolution-note-card__action-btn"
                          onClick={() => handleVerifyNote(n, noteKey)}
                          disabled={verifyingKey === noteKey}
                        >
                          {verifyingKey === noteKey ? 'Verificando…' : 'Verificar integridad'}
                        </button>
                      )}
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
                    </div>
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

      {/* PASO 1 — Firma del paciente (nueva nota o nota ya guardada, según signTarget) */}
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

      {/* PASO 2 — Firma del doctor (self o cross-user vía selector), nueva nota o nota ya guardada */}
      <DoctorSignStep
        isOpen={signStep === 'doctor'}
        onClose={handleCancelSign}
        onConfirm={handleDoctorSigned}
        title="Firma del doctor"
        subtitle={canSignOfficial
          ? 'Confirma la autoría con tu PIN o redibujando tu firma.'
          : 'Pídale al doctor que firme con su PIN para que la nota sea oficial.'}
        consentText={doctorConsentText}
        loading={loading}
      />

      <ImagePreviewModal
        open={!!sigPreview}
        onClose={() => setSigPreview(null)}
        src={sigPreview?.src}
        alt={sigPreview?.alt}
        title={sigPreview?.title}
      />
    </section>
  );
};

export default PatientEvolutionNote;
