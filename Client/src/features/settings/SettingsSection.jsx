import React from 'react';
import { confirmLeaveSection } from '../../shared/utils/sectionDirtyGuard';

const SettingsSection = ({ title, onBack, children }) => {
  const titleId = `settings-section-${title?.toLowerCase().replace(/\s+/g, '-') || 'section'}`;
  // Si la sección activa registró cambios sin guardar (sectionDirtyGuard),
  // confirmar antes de descartar la navegación SPA. `beforeunload` no cubre
  // esto porque navigate() no recarga la página.
  const handleBack = () => {
    if (confirmLeaveSection()) onBack();
  };
  return (
    <div className="settings-section">
      <button type="button" className="settings-back-btn" onClick={handleBack}>← Volver</button>
      <section className="settings-card" aria-labelledby={titleId}>
        <h2 id={titleId} className="settings-section-title">{title}</h2>
        <div className="settings-section-body">
          {children}
        </div>
      </section>
    </div>
  );
};

export default SettingsSection;
