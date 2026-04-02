import React from 'react';

const SettingsSection = ({ title, onBack, children }) => {
  return (
    <div className="settings-section">
      <div className="settings-section-header">
        <div className="settings-section-header-inner">
          <button type="button" className="settings-back-btn" onClick={onBack}>← Volver</button>
          <h2 className="settings-section-title">{title}</h2>
        </div>
      </div>
      <div className="settings-section-body">
        {children}
      </div>
    </div>
  );
};

export default SettingsSection;
