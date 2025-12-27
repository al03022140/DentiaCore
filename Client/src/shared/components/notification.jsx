import React, { useState, useEffect } from 'react';
import '../Styles/Notification.css';

/**
 * Componente para mostrar notificaciones temporales
 * @param {Object} props - Propiedades del componente
 * @param {string} props.message - Mensaje a mostrar
 * @param {string} props.type - Tipo de notificación ('success', 'error', 'warning', 'info')
 * @param {number} props.duration - Duración en ms (por defecto 3000)
 * @param {function} props.onClose - Función a ejecutar al cerrar
 */
const Notification = ({ message, type = 'info', duration = 3000, onClose }) => {
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    // Reiniciar visibilidad si cambia el mensaje
    setVisible(true);
    
    // Configurar temporizador para ocultar
    const timer = setTimeout(() => {
      setVisible(false);
      if (onClose) setTimeout(onClose, 300); // Dar tiempo a la animación
    }, duration);

    return () => clearTimeout(timer);
  }, [message, duration, onClose]);

  // Si no hay mensaje, no renderizar
  if (!message) return null;

  return (
    <div className={`notification ${type} ${visible ? 'visible' : 'hidden'}`}>
      <div className="notification-content">
        <div className="notification-icon">
          {type === 'success' && '✅'}
          {type === 'error' && '❌'}
          {type === 'warning' && '⚠️'}
          {type === 'info' && 'ℹ️'}
        </div>
        <div className="notification-message">{message}</div>
        <button 
          className="notification-close" 
          onClick={() => {
            setVisible(false);
            if (onClose) setTimeout(onClose, 300);
          }}
        >
          ×
        </button>
      </div>
    </div>
  );
};

export default Notification;