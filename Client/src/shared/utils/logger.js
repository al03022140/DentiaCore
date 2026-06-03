// Logger gateado por entorno.
//
// En producción se silencian log/info/debug: son ruido en la consola del
// usuario y un riesgo de filtrar datos clínicos (PHI). `warn` y `error` se
// mantienen SIEMPRE activos porque son señales que no queremos perder en prod.
//
// Se usa `process.env.NODE_ENV` (NO `import.meta`) a propósito:
//   - Vite lo reemplaza estáticamente en el bundle por 'production' o
//     'development' (es el mismo mecanismo con el que React activa/desactiva
//     su modo dev), así que en el build de producción estas ramas se eliminan.
//   - Jest/Babel en este repo no soportan `import.meta`; usarlo aquí rompería
//     cualquier test que importe un módulo que a su vez importe el logger.
//
// Uso:
//   import { logger } from '<ruta>/shared/utils/logger';
//   logger.log('...'); logger.info('...'); logger.debug('...');
//   logger.warn('...'); logger.error('...'); // siempre visibles

const isDev = process.env.NODE_ENV !== 'production';

const noop = () => {};

export const logger = {
  log: isDev ? console.log.bind(console) : noop,
  info: isDev ? console.info.bind(console) : noop,
  debug: isDev
    ? (console.debug ? console.debug.bind(console) : console.log.bind(console))
    : noop,
  // Siempre activos:
  warn: console.warn.bind(console),
  error: console.error.bind(console),
};

export default logger;
