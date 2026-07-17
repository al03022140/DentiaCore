/**
 * Utilidades para formateo y manipulación de datos
 */

/**
 * Formatea un nombre completo en formato abreviado
 * @param {string} apellido_paterno - Primer apellido
 * @param {string} apellido_materno - Segundo apellido
 * @param {string} primer_nombre - Primer nombre
 * @param {string} segundo_nombre - Segundo nombre
 * @returns {string} Nombre formateado
 */
export const formatName = (apellido_paterno, apellido_materno, primer_nombre, segundo_nombre) => {
  const firstSurname = apellido_paterno || "";
  const secondSurname = apellido_materno ? apellido_materno.charAt(0) + "." : "";
  const firstName = primer_nombre || "";
  const secondName = segundo_nombre ? segundo_nombre.charAt(0) + "." : "";

  return `${firstSurname} ${secondSurname} ${firstName} ${secondName}`.trim();
};

/**
 * Formatea la edad en formato "X años, Y meses, Z días"
 * @param {string|Date} birthDate - Fecha de nacimiento
 * @returns {string} Edad formateada
 */
export const formatAge = (birthDate) => {
  const ageData = calculateAge(birthDate);
  
  if (!ageData || (ageData.years === 0 && ageData.months === 0 && ageData.days === 0)) {
    return "No disponible";
  }
  
  const parts = [];
  
  if (ageData.years > 0) {
    parts.push(`${ageData.years} año${ageData.years !== 1 ? 's' : ''}`);
  }
  
  if (ageData.months > 0) {
    parts.push(`${ageData.months} mes${ageData.months !== 1 ? 'es' : ''}`);
  }
  
  if (ageData.days > 0) {
    parts.push(`${ageData.days} día${ageData.days !== 1 ? 's' : ''}`);
  }
  
  return parts.join(', ');
};

/**
 * Formatea la edad mostrando solo los años
 * @param {string} birthDate - Fecha de nacimiento en formato ISO
 * @returns {string} Edad formateada solo en años
 */
export const formatAgeYearsOnly = (birthDate) => {
  const ageData = calculateAge(birthDate);
  
  if (!ageData || (ageData.years === 0 && ageData.months === 0 && ageData.days === 0)) {
    return "No disponible";
  }
  
  return `${ageData.years} año${ageData.years !== 1 ? 's' : ''}`;
};

/**
 * Elimina acentos y normaliza un string
 * @param {string} str - String a normalizar
 * @returns {string} String normalizado sin acentos
 */
export const removeAccents = (str) => {
  if (!str) return "";
  return str.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
};

/**
 * Formatea una fecha en formato legible
 * @param {string|Date} date - Fecha a formatear
 * @param {string} format - Formato deseado ('short', 'long', 'time')
 * @returns {string} Fecha formateada
 */
export const formatDate = (date, format = 'short') => {
  if (!date) return "No disponible";
  
  const dateObj = new Date(date);
  
  // Verificar si la fecha es válida
  if (isNaN(dateObj.getTime())) return "Fecha inválida";
  
  const options = {
    short: { day: '2-digit', month: '2-digit', year: 'numeric' },
    long: { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' },
    time: { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }
  };
  
  return dateObj.toLocaleDateString('es-ES', options[format] || options.short);
};

/**
 * Calcula la edad a partir de una fecha de nacimiento
 * @param {string|Date} birthDate - Fecha de nacimiento
 * @returns {Object} Objeto con años, meses y días
 */
export const calculateAge = (birthDate) => {
  if (!birthDate) return { years: 0, months: 0, days: 0 };
  
  const birth = new Date(birthDate);
  const today = new Date();
  
  // Verificar si la fecha es válida
  if (isNaN(birth.getTime())) return { years: 0, months: 0, days: 0 };
  
  let years = today.getFullYear() - birth.getFullYear();
  let months = today.getMonth() - birth.getMonth();
  let days = today.getDate() - birth.getDate();
  
  // Ajustar días negativos
  if (days < 0) {
    months--;
    // Obtener días del mes anterior
    const prevMonth = new Date(today.getFullYear(), today.getMonth(), 0);
    days += prevMonth.getDate();
  }
  
  // Ajustar meses negativos
  if (months < 0) {
    years--;
    months += 12;
  }
  
  return { years, months, days };
};

/**
 * Calcula la edad en AÑOS COMPLETOS (número entero) a partir de una fecha de
 * nacimiento. Devuelve `fallback` si no hay fecha. Misma fórmula que las
 * implementaciones locales que reemplaza (diff / 365.25 días).
 * @param {string|Date} birthDate
 * @param {*} [fallback=null] valor a devolver cuando no hay fecha
 * @returns {number|*} años completos o `fallback`
 */
export const calculateAgeYears = (birthDate, fallback = null) => {
  if (!birthDate) return fallback;
  const diff = Date.now() - new Date(birthDate).getTime();
  return Math.floor(diff / (365.25 * 24 * 60 * 60 * 1000));
};

/**
 * Formatea una fecha con el formato por defecto del locale es-ES
 * (p. ej. "3/6/2026", sin relleno de ceros). Devuelve `empty` si no hay fecha.
 * @param {string|Date} date
 * @param {string} [empty='No especificado']
 * @returns {string}
 */
export const formatDateEs = (date, empty = 'No especificado') => {
  if (!date) return empty;
  return new Date(date).toLocaleDateString('es-ES');
};

/**
 * Formatea una fecha y hora en formato localizado
 * @param {string|Date} dateTimeStr - Fecha y hora a formatear
 * @returns {string} Fecha y hora formateada según la configuración regional
 */
export const formatDateTime = (dateTimeStr) => {
  if (!dateTimeStr) return 'N/A';
  
  const dateObj = new Date(dateTimeStr);
  
  // Verificar si la fecha es válida
  if (isNaN(dateObj.getTime())) return "Fecha/hora inválida";
  
  // Usar toLocaleString para respetar la configuración regional del navegador
  return dateObj.toLocaleString();
};