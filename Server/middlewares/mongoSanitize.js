// SEC-04 (defensa en profundidad): elimina claves que empiezan con `$` de
// req.body / req.query / req.params antes de que lleguen a cualquier filtro
// Mongo. El parser `qs` (extended:true) permite `?campo[$ne]=x`, que sin esto
// se convierte en `{ campo: { $ne: 'x' } }` — un operador de consulta inyectado.
//
// Reemplaza a `express-mongo-sanitize` (deprecado / incompatible con Express 5)
// con ~10 líneas sin dependencias. NO borra claves con `.` porque este proyecto
// no usa dot-notation en input de usuario y hacerlo rompería payloads legítimos;
// el vector real reportado es el operador `$`.
// ponytail: strip de claves `$` recursivo; si algún día se necesita bloquear
// también dot-notation, extender `isForbiddenKey`.

const isForbiddenKey = (key) => typeof key === 'string' && key.startsWith('$');

const sanitize = (value) => {
  if (Array.isArray(value)) {
    value.forEach(sanitize);
    return;
  }
  if (value && typeof value === 'object') {
    for (const key of Object.keys(value)) {
      if (isForbiddenKey(key)) {
        delete value[key];
        continue;
      }
      sanitize(value[key]);
    }
  }
};

const mongoSanitize = (req, _res, next) => {
  // req.query en Express 4 es un objeto cacheado y mutable; lo saneamos in situ.
  sanitize(req.body);
  sanitize(req.query);
  sanitize(req.params);
  next();
};

module.exports = mongoSanitize;
module.exports.sanitize = sanitize;
