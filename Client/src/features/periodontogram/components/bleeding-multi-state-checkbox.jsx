/**
 * Componente de checkbox multi-estado para sangrado
 * Mantiene exactamente la misma apariencia visual que el checkbox original
 * pero permite ciclar entre 3 estados: sin marcar, punto rojo, rectángulo rojo, cuadrado rojo
 */

import React, { useCallback } from 'react';
import PropTypes from 'prop-types';
import "../styles/bleeding-multiState-checkbox.css";

const BleedingMultiStateCheckbox = ({
  value = 0, // Estado actual (0-3): 0=sin marcar, 1=punto, 2=rectángulo, 3=cuadrado
  onChange,
  disabled = false,
  className = '',
  'data-testid': testId,
  ...props
}) => {
  const getStateClass = () => {
    switch (value) {
      case 1: return 'bleeding-state-1'; // Punto rojo
      case 2: return 'bleeding-state-2'; // Rectángulo rojo
      case 3: return 'bleeding-state-3'; // Cuadrado rojo
      default: return 'bleeding-state-0'; // Sin marcar
    }
  };

  const handleClick = useCallback((event) => {
    // handleClick called
    
    if (disabled) {
      // Componente deshabilitado
      return;
    }
    
    // Prevenir comportamiento por defecto del checkbox
    event.preventDefault();
    event.stopPropagation();
    
    // Ciclar entre estados: 0 -> 1 -> 2 -> 3 -> 0
    const nextValue = (value + 1) % 4;
    // Cambio de estado de bleeding
    
    if (onChange) {
      // Llamando onChange
      onChange(nextValue);
    } else {
      // onChange no definido
    }
  }, [value, onChange, disabled]);

  // Debug: Log del estado actual
  // Renderizando BleedingMultiStateCheckbox

  const getAriaLabel = () => {
    switch (value) {
      case 1: return 'Sangrado al sondaje';
      case 2: return 'Sangrado persistente';
      case 3: return 'Exudado purulento (sangrado y pus)';
      default: return 'Sin sangrado';
    }
  };

  return (
    <input
      type="checkbox"
      className={`bleeding-multi-state ${getStateClass()} ${className}`}
      data-bleeding-type="multi-state"
      data-state={value}
      checked={value > 0} // Consideramos marcado si tiene cualquier estado > 0
      onChange={handleClick} // Usamos onChange para mantener compatibilidad
      onClick={handleClick} // También onClick por si acaso
      disabled={disabled}
      aria-label={getAriaLabel()}
      data-testid={testId}
      {...props}
    />
  );
};

BleedingMultiStateCheckbox.propTypes = {
  value: PropTypes.number,
  onChange: PropTypes.func,
  disabled: PropTypes.bool,
  className: PropTypes.string,
  'data-testid': PropTypes.string,
};

export default BleedingMultiStateCheckbox;