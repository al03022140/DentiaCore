import React, { useCallback, useEffect, useState } from 'react';
import API from '../../shared/services/axios-instance';
import { useAuth } from '../../app/auth/AuthContext';
import { hasPermission } from '../../app/auth/permissions';
import './styles/DraftsCenter.css';

const RESOURCE_LABELS = {
  odontograma: 'Odontograma',
  periodontograma: 'Periodontograma',
  examen: 'Examen',
};

const DISMISS_KEY = 'dentiacore_drafts_dismissed';

/**
 * Centro de Firmas Pendientes — roles.MD §9.4
 *
 * Notificación flotante que muestra borradores pendientes de firma.
 */
const DraftsCenter = () => {
  const { user } = useAuth();
  const permissions = user?.permissions || [];
  const canSign = hasPermission(permissions, ['draft.approve', 'drafts.batch_sign']);

  const [drafts, setDrafts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [signing, setSigning] = useState(false);
  const [pin, setPin] = useState('');
  const [showPinModal, setShowPinModal] = useState(false);
  const [batchMode, setBatchMode] = useState(false);
  const [selectedDraft, setSelectedDraft] = useState(null);
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const [dismissed, setDismissed] = useState(false);
  const [expanded, setExpanded] = useState(false);

  const fetchDrafts = useCallback(async () => {
    try {
      setLoading(true);
      const res = await API.get('/drafts');
      setDrafts(res.data?.drafts || []);
    } catch {
      setError('Error al cargar borradores');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (canSign) fetchDrafts();
  }, [canSign, fetchDrafts]);

  // Cuando se cargan los drafts, decidir si mostrar la notificación
  useEffect(() => {
    if (loading) return;
    if (drafts.length > 0) {
      // Si hay firmas pendientes, siempre mostrar al cargar
      setDismissed(false);
    } else {
      // Sin firmas: si ya se descartó antes, no mostrar de nuevo
      const wasDismissed = sessionStorage.getItem(DISMISS_KEY) === 'empty';
      setDismissed(wasDismissed);
    }
  }, [drafts, loading]);

  const handleDismiss = () => {
    setDismissed(true);
    setExpanded(false);
    if (drafts.length === 0) {
      // Sin firmas: guardar para no mostrar de nuevo en esta sesión
      sessionStorage.setItem(DISMISS_KEY, 'empty');
    }
    // Con firmas: no se guarda, reaparecerá al recargar/navegar
  };

  const openSignSingle = (draft) => {
    setSelectedDraft(draft);
    setBatchMode(false);
    setPin('');
    setError('');
    setShowPinModal(true);
  };

  const openSignAll = () => {
    setSelectedDraft(null);
    setBatchMode(true);
    setPin('');
    setError('');
    setShowPinModal(true);
  };

  const handleSign = async () => {
    if (pin.length !== 4) {
      setError('Ingrese un PIN de 4 dígitos');
      return;
    }

    setSigning(true);
    setError('');

    try {
      if (batchMode) {
        const draftIds = drafts.map(d => ({ id: d._id, resourceType: d.resourceType }));
        const res = await API.post('/drafts/batch-sign', { draftIds, pin });
        setSuccessMsg(res.data?.message || 'Firma en lote completada');
      } else if (selectedDraft) {
        await API.patch(`/drafts/${selectedDraft._id}/sign`, {
          resourceType: selectedDraft.resourceType,
          pin,
        });
        setSuccessMsg('Borrador firmado correctamente');
      }

      setShowPinModal(false);
      setPin('');
      await fetchDrafts();
      setTimeout(() => setSuccessMsg(''), 4000);
    } catch (err) {
      setError(err?.response?.data?.message || err?.message || 'Error al firmar');
    } finally {
      setSigning(false);
    }
  };

  const handleReject = async (draft) => {
    const motivo = window.prompt('Motivo del rechazo (mínimo 5 caracteres):');
    if (!motivo || motivo.trim().length < 5) return;

    try {
      await API.patch(`/drafts/${draft._id}/reject`, {
        resourceType: draft.resourceType,
        motivo: motivo.trim(),
      });
      setSuccessMsg('Borrador rechazado');
      await fetchDrafts();
      setTimeout(() => setSuccessMsg(''), 4000);
    } catch (err) {
      setError(err?.response?.data?.message || 'Error al rechazar borrador');
    }
  };

  if (!canSign || loading || dismissed) return null;

  return (
    <>
      {/* Notificación flotante */}
      <div className="drafts-notification">
        <div className="drafts-notification-header" onClick={() => drafts.length > 0 && setExpanded(!expanded)}>
          <div className="drafts-notification-title">
            {drafts.length > 0 ? (
              <>
                <span className="drafts-notif-icon">&#9888;</span>
                <span>
                  <strong>{drafts.length}</strong> {drafts.length === 1 ? 'firma pendiente' : 'firmas pendientes'}
                </span>
              </>
            ) : (
              <>
                <span className="drafts-notif-icon drafts-notif-icon--ok">&#10003;</span>
                <span>No hay firmas pendientes</span>
              </>
            )}
          </div>
          <div className="drafts-notification-actions">
            {drafts.length > 1 && !expanded && (
              <button className="drafts-btn-batch-mini" onClick={(e) => { e.stopPropagation(); openSignAll(); }} disabled={signing}>
                Firmar Todas
              </button>
            )}
            <button className="drafts-notification-close" onClick={(e) => { e.stopPropagation(); handleDismiss(); }} title="Cerrar">
              &times;
            </button>
          </div>
        </div>

        {successMsg && <div className="drafts-success">{successMsg}</div>}
        {error && !showPinModal && <div className="drafts-error">{error}</div>}

        {expanded && drafts.length > 0 && (
          <div className="drafts-notification-body">
            {drafts.length > 1 && (
              <button className="drafts-btn-batch" onClick={openSignAll} disabled={signing}>
                Firmar Todas ({drafts.length})
              </button>
            )}
            <div className="drafts-list">
              {drafts.map((draft) => (
                <div key={draft._id} className="draft-card">
                  <div className="draft-card-type">
                    {RESOURCE_LABELS[draft.resourceType] || draft.resourceType}
                  </div>
                  <div className="draft-card-info">
                    <span className="draft-card-label">Resumen:</span> {draft.resumen}
                  </div>
                  <div className="draft-card-date">
                    {draft.createdAt ? new Date(draft.createdAt).toLocaleString('es-MX') : '—'}
                  </div>
                  <div className="draft-card-actions">
                    <button className="drafts-btn-sign" onClick={() => openSignSingle(draft)} disabled={signing}>
                      Firmar
                    </button>
                    <button className="drafts-btn-reject" onClick={() => handleReject(draft)} disabled={signing}>
                      Rechazar
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Modal de PIN */}
      {showPinModal && (
        <div className="drafts-pin-overlay" onClick={() => setShowPinModal(false)}>
          <div className="drafts-pin-modal" onClick={(e) => e.stopPropagation()}>
            <h3>{batchMode ? `Firmar todas (${drafts.length})` : 'Aprobar y Firmar'}</h3>
            <p>Ingrese su PIN para confirmar la firma</p>

            <form onSubmit={(e) => { e.preventDefault(); handleSign(); }}>
              <input
                type="password"
                inputMode="numeric"
                maxLength={4}
                pattern="\d{4}"
                value={pin}
                onChange={(e) => {
                  setPin(e.target.value.replace(/\D/g, '').slice(0, 4));
                  setError('');
                }}
                placeholder="••••"
                autoFocus
                className="drafts-pin-input"
              />
              {error && <p className="drafts-pin-error">{error}</p>}
              <div className="drafts-pin-actions">
                <button type="button" className="drafts-btn-cancel" onClick={() => setShowPinModal(false)}>
                  Cancelar
                </button>
                <button type="submit" className="drafts-btn-confirm" disabled={pin.length !== 4 || signing}>
                  {signing ? 'Firmando...' : 'Confirmar'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
};

export default DraftsCenter;
