import React from 'react';

const SettingsSection = ({ title, onBack, children }) => {
  const titleId = `settings-section-${title?.toLowerCase().replace(/\s+/g, '-') || 'section'}`;
  return (
    <div className="settings-section">
      <button type="button" className="settings-back-btn" onClick={onBack}>← Volver</button>
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
