import React from 'react';
import { Link } from 'react-router-dom';

// FE-01 (Navegación): ruta catch-all. Antes, cualquier URL no reconocida no
// montaba nada (ni el layout) → pantalla en blanco sin sidebar ni mensaje, que
// el personal clínico percibe como "el sistema se rompió".
const NotFound = () => (
  <div
    role="alert"
    style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      gap: '1rem',
      padding: '3rem 1rem',
      textAlign: 'center',
    }}
  >
    <h1 style={{ fontSize: '3rem', margin: 0, color: 'var(--color-primary, #084888)' }}>404</h1>
    <p style={{ fontSize: '1.1rem', margin: 0 }}>
      La página que buscas no existe o fue movida.
    </p>
    <Link
      to="/"
      style={{
        padding: '0.5rem 1.25rem',
        borderRadius: 6,
        background: 'var(--color-primary, #084888)',
        color: '#fff',
        textDecoration: 'none',
      }}
    >
      Volver al inicio
    </Link>
  </div>
);

export default NotFound;
