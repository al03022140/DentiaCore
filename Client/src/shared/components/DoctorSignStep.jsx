import React, { useEffect, useMemo, useState } from 'react';
import { useAuth } from '../../app/auth/AuthContext';
import { hasPermission } from '../../app/auth/permissions';
import { getDoctors } from '../services/settingsService';
import SignaturePadModal from './SignaturePadModal.jsx';

/**
 * Paso de firma del DOCTOR — reutilizable para notas de evolución y para el
 * consentimiento de HC.
 *
 * Lógica:
 *  - SIEMPRE se muestra el selector de doctores activos. Cualquier doctor
 *    puede caminar hasta el escritorio (sin importar qué cuenta clínica esté
 *    con sesión iniciada: doctor, doctor_admin o asistente) y firmar con SU
 *    PIN secreto. El PIN siempre se valida en el backend contra el doctor
 *    SELECCIONADO (`asDoctorId`), no contra la cuenta logueada.
 *  - Si el usuario logueado es doctor, su propia ficha queda preseleccionada
 *    por comodidad, pero puede elegirse a cualquier otro.
 *  - Si el doctor seleccionado NO tiene firmaDigitalUrl, la opción PIN
 *    queda deshabilitada con un mensaje claro — debe subir su firma en
 *    "Perfil Profesional" antes, o usar el pad.
 *  - Fallback: si la lista de doctores no carga y el usuario logueado es
 *    doctor, se permite firmar como sí mismo (el backend valida su PIN).
 *
 * Emite `onConfirm({ method, pin?, dataUrl?, asDoctorId? })`.
 */
export default function DoctorSignStep({
  isOpen,
  onClose,
  onConfirm,
  title = 'Firma del doctor',
  subtitle = 'Confirma la autoría con tu PIN o redibujando tu firma.',
  loading = false,
}) {
  const { user } = useAuth();
  // El usuario logueado puede firmar oficialmente como sí mismo (doctor).
  // Sólo se usa para preseleccionar su ficha y como fallback si la lista falla.
  const isSelfDoctor = hasPermission(user?.permissions, ['consultas.create']);

  const [doctors, setDoctors] = useState([]);
  const [doctorsLoading, setDoctorsLoading] = useState(false);
  const [doctorsError, setDoctorsError] = useState('');
  const [selectedDoctorId, setSelectedDoctorId] = useState('');
  const [method, setMethod] = useState('pin');
  const [pin, setPin] = useState('');
  const [padOpen, setPadOpen] = useState(false);
  const [submitError, setSubmitError] = useState('');

  // SIEMPRE cargamos la lista de doctores: cualquier doctor puede firmar con
  // su PIN, independientemente de la cuenta clínica logueada.
  useEffect(() => {
    if (!isOpen) return;
    setPin('');
    setMethod('pin');
    setPadOpen(false);
    setSubmitError('');

    setDoctorsLoading(true);
    setDoctorsError('');
    getDoctors()
      .then((list) => {
        setDoctors(list);
        // Preselección: el doctor logueado si está en la lista; si no, el
        // único disponible; si no, ninguno (el firmante debe elegir).
        const self = isSelfDoctor && user?.id
          ? list.find((d) => String(d.id) === String(user.id))
          : null;
        if (self) setSelectedDoctorId(self.id);
        else if (list.length === 1) setSelectedDoctorId(list[0].id);
        else setSelectedDoctorId('');
      })
      .catch((e) => {
        setDoctors([]);
        setDoctorsError(e?.response?.data?.message || 'No se pudo cargar la lista de doctores');
      })
      .finally(() => setDoctorsLoading(false));
  }, [isOpen, isSelfDoctor, user?.id]);

  // Fallback de auto-firma: si la lista no cargó (error o vacía) pero el
  // usuario logueado es doctor, lo dejamos firmar como sí mismo para no
  // bloquearlo por un fallo del endpoint de doctores. El backend valida su PIN.
  const useSelfFallback = isSelfDoctor && !doctorsLoading && doctors.length === 0;

  // Doctor "efectivo" para mostrar info y validar si PIN está habilitado.
  const effectiveDoctor = useMemo(() => {
    if (useSelfFallback) {
      // Sin datos fiables de hasFirma desde AuthContext; el backend devolverá
      // error si falta la firma al intentar PIN.
      return { id: user?.id, nombre: user?.nombre, hasFirma: true };
    }
    return doctors.find((d) => d.id === selectedDoctorId) || null;
  }, [useSelfFallback, user, doctors, selectedDoctorId]);

  const pinDisabled = effectiveDoctor && effectiveDoctor.hasFirma === false;

  // Si el doctor seleccionado no tiene firma, forzar method=pad
  useEffect(() => {
    if (pinDisabled && method === 'pin') setMethod('pad');
  }, [pinDisabled, method]);

  if (!isOpen) return null;

  const handleSubmitPin = async (e) => {
    e?.preventDefault?.();
    setSubmitError('');
    if (!useSelfFallback && !selectedDoctorId) {
      setSubmitError('Selecciona el doctor que firmará.');
      return;
    }
    if (!/^\d{4}$/.test(pin)) {
      setSubmitError('Ingrese el PIN de 4 dígitos del doctor.');
      return;
    }
    try {
      await onConfirm({
        method: 'pin',
        pin,
        // Siempre identificamos al firmante por el doctor seleccionado; el
        // backend valida el PIN contra ÉL. Sólo se omite en el fallback de
        // auto-firma (el backend usa la cuenta logueada).
        ...(useSelfFallback ? {} : { asDoctorId: selectedDoctorId }),
      });
    } catch (err) {
      setSubmitError(err?.response?.data?.error || err?.message || 'Error al firmar');
    }
  };

  const handleSubmitPad = async (pngDataUrl) => {
    setPadOpen(false);
    setSubmitError('');
    if (!useSelfFallback && !selectedDoctorId) {
      setSubmitError('Selecciona el doctor que firmará.');
      return;
    }
    try {
      await onConfirm({
        method: 'pad',
        dataUrl: pngDataUrl,
        ...(useSelfFallback ? {} : { asDoctorId: selectedDoctorId }),
      });
    } catch (err) {
      setSubmitError(err?.response?.data?.error || err?.message || 'Error al firmar');
    }
  };

  return (
    <>
      {!padOpen && (
        <div className="signature-pad-overlay" onClick={() => !loading && onClose?.()}>
          <div className="signature-pad-card" onClick={(e) => e.stopPropagation()}>
            <div className="signature-pad-header">
              <h2>{title}</h2>
              {subtitle && <p className="signature-pad-subtitle">{subtitle}</p>}
            </div>

            {!isSelfDoctor && (
              <div className="signature-pad-consent">
                <p>
                  <strong>Esta nota requiere la firma del doctor para ser oficial.</strong>{' '}
                  Selecciona el doctor y pídele que ingrese su PIN (o que firme con el pad).
                </p>
                <p>
                  Mientras no firme un doctor, la nota se guardará como <strong>BORRADOR</strong>.
                </p>
              </div>
            )}

            {!useSelfFallback && (
              <div className="settings-form-group">
                <label htmlFor="doctor-select">Doctor que firma</label>
                {doctorsLoading ? (
                  <p style={{ margin: 0, fontSize: '0.85rem', color: '#666' }}>Cargando doctores…</p>
                ) : doctorsError ? (
                  <p className="signature-pad-error">{doctorsError}</p>
                ) : doctors.length === 0 ? (
                  <p className="signature-pad-error">No hay doctores activos disponibles.</p>
                ) : (
                  <select
                    id="doctor-select"
                    value={selectedDoctorId}
                    onChange={(e) => setSelectedDoctorId(e.target.value)}
                    disabled={loading}
                  >
                    <option value="">— Selecciona el doctor —</option>
                    {doctors.map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.nombre}
                        {d.cedulaProfesional ? ` (Céd. ${d.cedulaProfesional})` : ''}
                        {d.hasFirma ? '' : ' — sin firma subida'}
                      </option>
                    ))}
                  </select>
                )}
              </div>
            )}

            <div className="doctor-sign-tabs">
              <button
                type="button"
                className={`doctor-sign-tab${method === 'pin' ? ' is-active' : ''}`}
                onClick={() => !pinDisabled && setMethod('pin')}
                disabled={loading || pinDisabled}
                title={pinDisabled ? 'El doctor no tiene firma digital subida — use el pad' : ''}
              >
                Firmar con PIN
              </button>
              <button
                type="button"
                className={`doctor-sign-tab${method === 'pad' ? ' is-active' : ''}`}
                onClick={() => setMethod('pad')}
                disabled={loading}
              >
                Firmar con pad
              </button>
            </div>

            {pinDisabled && method === 'pad' && (
              <p className="signature-pad-error" style={{ marginTop: '-0.25rem' }}>
                Este doctor no tiene firma digital subida. Para firmar con PIN, debe subir su firma
                en <strong>Configuración → Perfil Profesional</strong>. Mientras tanto, puede firmar con el pad.
              </p>
            )}

            {method === 'pin' ? (
              <form className="doctor-sign-pin" onSubmit={handleSubmitPin}>
                <label htmlFor="doctor-pin-input">PIN del doctor (4 dígitos)</label>
                <input
                  id="doctor-pin-input"
                  type="password"
                  inputMode="numeric"
                  maxLength={4}
                  pattern="\d{4}"
                  value={pin}
                  onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 4))}
                  placeholder="••••"
                  autoFocus
                  disabled={loading}
                />
                {submitError && <p className="signature-pad-error">{submitError}</p>}
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
                    type="submit"
                    className="signature-pad-btn signature-pad-btn-confirm"
                    disabled={loading || pin.length !== 4 || (!useSelfFallback && !selectedDoctorId)}
                  >
                    {loading ? 'Firmando…' : 'Firmar y guardar'}
                  </button>
                </div>
              </form>
            ) : (
              <div className="doctor-sign-pad-prompt">
                <p>El doctor dibujará su firma en el pad.</p>
                {submitError && <p className="signature-pad-error">{submitError}</p>}
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
                    onClick={() => setPadOpen(true)}
                    disabled={loading || (!useSelfFallback && !selectedDoctorId)}
                  >
                    Abrir pad
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      <SignaturePadModal
        isOpen={padOpen}
        onClose={() => setPadOpen(false)}
        onConfirm={handleSubmitPad}
        title={title + ' — pad'}
        subtitle="Dibuja la firma para autorizar"
        signerName={effectiveDoctor?.nombre || ''}
        signerRole={effectiveDoctor?.cedulaProfesional ? `Cédula ${effectiveDoctor.cedulaProfesional}` : 'Doctor'}
        confirmLabel="Firmar y guardar"
        loading={loading}
      />
    </>
  );
}
