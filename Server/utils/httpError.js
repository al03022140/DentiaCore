const config = require('../config/env');
// BE-05: expone `error.message` en respuestas 500 SOLO fuera de producción,
// replicando el gate del error handler global (scripts/dent.js). En producción
// devuelve undefined para no filtrar internals de Mongoose (nombres de
// colección/campo, valores de un índice único E11000 con posible PII).
const devError = (error) =>
  config.isProd ? undefined : (error?.message || String(error));

module.exports = { devError };
