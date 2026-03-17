import React from 'react';
import { useTheme } from '../../../shared/context/ThemeContext';

const OPTIONS = [
  { value: 'light', label: '☀️ Claro', desc: 'Interfaz con fondo blanco' },
  { value: 'dark', label: '🌙 Oscuro', desc: 'Interfaz con fondo oscuro' },
  { value: 'system', label: '💻 Sistema', desc: 'Sigue la preferencia del sistema operativo' },
];

const AppearanceSection = () => {
  const { theme, setTheme } = useTheme();

  return (
    <div>
      <p style={{ marginBottom: '1rem', color: 'var(--color-text-muted)' }}>
        Selecciona cómo se ve la interfaz de DentiaCore.
      </p>
      <div className="settings-radio-group">
        {OPTIONS.map((opt) => (
          <label
            key={opt.value}
            className={`settings-radio-option${theme === opt.value ? ' active' : ''}`}
          >
            <input
              type="radio"
              name="theme"
              value={opt.value}
              checked={theme === opt.value}
              onChange={() => setTheme(opt.value)}
            />
            <div>
              <div style={{ fontWeight: 500 }}>{opt.label}</div>
              <div style={{ fontSize: '0.85rem', color: 'var(--color-text-muted)' }}>{opt.desc}</div>
            </div>
          </label>
        ))}
      </div>
    </div>
  );
};

export default AppearanceSection;
