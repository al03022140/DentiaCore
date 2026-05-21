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

      const response = await API.post(`/patients/${patientId}/evolution-note`, body);
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
        message.success('Nota guardada.');
        resetSignFlow();
      }
    } catch (err) {
      console.error(err);
      const msg = err?.response?.data?.error || err?.response?.data?.message || err?.message || 'Error al guardar la nota';
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
      const { noteId, index } = existingSignTarget;
      const response = await API.post(
        `/patients/${patientId}/evolution-note/${noteId}/sign`,
        { patientSignature: existingPatientSig, doctorSignature }
      );
      const payload = response?.data;
      if (payload?.success && payload?.data) {
        setNotes(prev => prev.map((n, idx) => (idx === index ? payload.data : n)));
        message.success('Nota firmada y marcada como OFICIAL.');
      }
      resetExistingSignFlow();
    } catch (err) {
      const msg = err?.response?.data?.error || err?.message || 'Error al firmar la nota';
      message.error(msg);
    } finally {
      setLoading(false);
    }
  };

  const handlePrint = () => {
    const printContent = document.querySelector('.printable-evolution-notes');
    if (!printContent) return;
    const clone = printContent.cloneNode(true);
    clone.classList.add('printing-portal');
    clone.style.display = 'block';
    document.body.appendChild(clone);
    document.body.classList.add('printing-evolution-mode');
    window.print();
    document.body.removeChild(clone);
    document.body.classList.remove('printing-evolution-mode');
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
            Imprimir
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
        <div className="patient-evolution-note__cards">
          {Array.isArray(notes) && notes.length > 0 ? (
            notes.map((n, idx) => {
              const noteKey = n._id || `note-${idx}`;
              const isExpanded = expandedNotes.has(noteKey);
              const num = n.numero_procedimiento ?? idx + 1;
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

        <div className="signatures-container">
          <div className="signature-block">
            <div className="signature-line"></div>
            <p className="signature-label">{patientFullName}</p>
            <p className="signature-title">Firma del Paciente</p>
          </div>
          <div className="signature-block">
            <div className="signature-line"></div>
            <p className="signature-label">Dr. Jeferson Arley Ramirez Mejia</p>
            <p className="signature-title">Firma del Doctor</p>
          </div>
        </div>

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
