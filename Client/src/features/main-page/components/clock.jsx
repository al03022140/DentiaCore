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

  // Formatear la hora en mayúsculas con espacio entre números y AM/PM
  const formattedTime = time.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: true })
    .replace(/\s/g, '') // Eliminar espacios
    .replace(/\./g, '') // Eliminar puntos
    .toUpperCase()
    .replace(/(AM|PM)$/, ' $1'); // Agregar espacio antes de AM/PM

  return (
    <div className="clock">
      {formattedTime}
    </div>
  );
};

export default Clock;