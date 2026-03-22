import React, { useState, useEffect } from 'react';
import '../Styles/clock.css'; // Importar los estilos del reloj

const Clock = () => {
  const [time, setTime] = useState(new Date());

  useEffect(() => {
    const interval = setInterval(() => {
      setTime(new Date());
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  // Formatear la hora y separar el sufijo AM/PM
  const timeString = time.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: true })
    .replace(/\s/g, '') // Eliminar espacios
    .replace(/\./g, '') // Eliminar puntos
    .toUpperCase();

  // Separar la hora y el sufijo AM/PM
  const match = timeString.match(/(\d{2}:\d{2})(AM|PM)$/);
  const hourPart = match ? match[1] : timeString;
  const ampmPart = match ? match[2] : '';

  return (
    <div className="clock">
      {hourPart}
      {ampmPart && (
        <span className="clock-ampm">{ampmPart}</span>
      )}
    </div>
  );
};

export default Clock;