import React from 'react';
import './styles/signature-badge.css';

/**
 * Badge que muestra el estado de firma de un documento clínico.
 *
 * Estados:
 * - Sin firmar (gris)
 * - Firmado (verde) — muestra nombre + fecha
 * - Firma desactualizada (amarillo) — el documento cambió después de la firma
 *
 * @param {object} props
 * @param {object|string|null} props.firmadoPor - Objeto poblado { nombre, cedulaProfesional } o ID
 * @param {string|Date|null}   props.firmadoEn - Fecha de firma
 * @param {boolean}            props.firmaDesactualizada - Si la firma ya no es válida
 * @param {string|null}        [props.contentHash] - Hash del contenido al momento de firmar
 * @param {Function}           [props.onSignClick] - Callback para abrir modal de firma
 * @param {boolean}            [props.canSign] - Si el usuario puede firmar (rol clínico)
 */
export default function SignatureBadge({
  firmadoPor,
  firmadoEn,
  firmaDesactualizada = false,
  contentHash,
  onSignClick,
  canSign = false,
}) {
  const isSigned = !!firmadoPor;

  // Nombre del firmante
  const firmanteName = firmadoPor && typeof firmadoPor === 'object'
    ? firmadoPor.nombre || 'Doctor'
    : null;
  const cedula = firmadoPor && typeof firmadoPor === 'object'
    ? firmadoPor.cedulaProfesional
    : null;

  // Formatear fecha
  const fechaStr = firmadoEn
    ? new Date(firmadoEn).toLocaleDateString('es-MX', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      })
    : null;

  if (!isSigned) {
    return (
      <div className="signature-badge signature-badge--unsigned">
        <span className="signature-badge__icon">&#9634;</span>
        <span className="signature-badge__text">Sin firmar</span>
        {canSign && onSignClick && (
          <button
            type="button"
            className="signature-badge__btn"
            onClick={onSignClick}
          >
            Firmar
          </button>
        )}
      </div>
    );
  }

  if (firmaDesactualizada) {
    return (
      <div className="signature-badge signature-badge--outdated" title={contentHash ? `Hash: ${contentHash}` : undefined}>
        <span className="signature-badge__icon">&#9888;&#65039;</span>
        <div className="signature-badge__info">
          <span className="signature-badge__text">Firma desactualizada</span>
          {firmanteName && <span className="signature-badge__signer">{firmanteName}</span>}
          {fechaStr && <span className="signature-badge__date">{fechaStr}</span>}
        </div>
        {canSign && onSignClick && (
          <button
            type="button"
            className="signature-badge__btn signature-badge__btn--re-sign"
            onClick={onSignClick}
          >
            Re-firmar
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="signature-badge signature-badge--signed" title={contentHash ? `Hash: ${contentHash}` : undefined}>
      <span className="signature-badge__icon">&#9989;</span>
      <div className="signature-badge__info">
        <span className="signature-badge__text">Firmado</span>
        {firmanteName && (
          <span className="signature-badge__signer">
            {firmanteName}
            {cedula && <span className="signature-badge__cedula"> (Céd. {cedula})</span>}
          </span>
        )}
        {fechaStr && <span className="signature-badge__date">{fechaStr}</span>}
      </div>
    </div>
  );
}
