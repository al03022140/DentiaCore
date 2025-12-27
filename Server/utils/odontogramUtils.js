/**
 * 🦷 UTILIDADES PARA EL MANEJO DE ODONTOGRAMAS - BACKEND
 * 
 * Funciones auxiliares para validación y procesamiento de datos de odontogramas.
 * UTILIZA CONFIGURACIÓN CENTRALIZADA v1.0.0
 * 
 * CARACTERÍSTICAS:
 * ✅ Validación unificada de dientes
 * ✅ Configuración centralizada
 * ✅ Eliminación de duplicaciones
 * ✅ Consistencia con frontend
 * 
 * @version 2.0.0 - CONFIGURACIÓN CENTRALIZADA
 * @author Sistema de Utilidades Unificadas
 */

const { PERIODONTOGRAM_CONFIG } = require('../config/periodontogram-config');

/**
 * Verifica si un array contiene un elemento (por diente, tipo y superficie)
 * @param {Array} array - Array a verificar
 * @param {Object} element - Elemento a buscar
 * @param {Array} props - Propiedades a comparar
 * @returns {boolean} - true si el elemento existe, false en caso contrario
 */
const includesEntry = (array, element, props = ['diente','tipo','superficie']) => {
  if (!Array.isArray(array) || typeof element !== 'object' || element == null) {
    return false;
  }
  return array.some(item =>
    props.every(prop => item?.[prop] === element?.[prop])
  );
};

// Alias para compatibilidad con tu componente
const arrayContainsElement = includesEntry;

/**
 * Formatea el número de diente para mostrar múltiples dientes con guión
 * @param {string|number} toothNumber - Número del diente
 * @returns {string} - Número formateado (ej: '1121' -> '11-21')
 */
const formatToothNumber = (toothNumber) => {
  const toothStr = String(toothNumber);
  
  // Si el número tiene 4 dígitos y parece ser dos dientes concatenados
  if (toothStr.length === 4 && /^\d{4}$/.test(toothStr)) {
    const firstTooth = toothStr.substring(0, 2);
    const secondTooth = toothStr.substring(2, 4);
    
    // Verificar que ambos números sean válidos usando configuración centralizada
    if (PERIODONTOGRAM_CONFIG.isValidToothNumber(parseInt(firstTooth)) && 
        PERIODONTOGRAM_CONFIG.isValidToothNumber(parseInt(secondTooth))) {
      return `${firstTooth}-${secondTooth}`;
    }
  }
  
  return toothStr;
};

/**
 * Normaliza los datos del odontograma para uso en el servidor
 * @param {Array} data - Array de objetos del odontograma
 * @returns {Array} - Array normalizado con formato consistente
 */
const normalizeOdontogramaData = (data) => {
  if (!Array.isArray(data)) {
    console.warn('normalizeOdontogramaData recibió datos no válidos:', data);
    return [];
  }
  
  return data.map((item) => {
    const { formatDateToDDMMYYYY, getCurrentDateFormatted } = require('./dateUtils');
    
    const rawDiente = item.diente || item.tooth || 'N/A';
    const diente = formatToothNumber(rawDiente);
    const tipo = item.tipo || item.damage || '';
    const superficie = item.superficie || item.surface || 'O';
    const fechaRaw = item.fecha || getCurrentDateFormatted();
    const fecha = formatDateToDDMMYYYY(fechaRaw);
    
    return {
      diente,
      tipo,
      superficie,
      fecha
    };
  });
};

module.exports = {
  includesEntry,
  arrayContainsElement,
  formatToothNumber,
  normalizeOdontogramaData
};