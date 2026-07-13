/**
 * Regresión de los fixes de la auditoría de seguridad (Fase 6).
 * Lógica pura — sin BD.
 */
const mongoSanitize = require('../middlewares/mongoSanitize');
const Usuario = require('../models/users');

describe('SEC-04 — mongoSanitize (strip de operadores $)', () => {
  const run = (obj) => {
    const req = { body: obj, query: {}, params: {} };
    mongoSanitize(req, {}, () => {});
    return req.body;
  };

  test('elimina clave $ne de nivel superior', () => {
    expect(run({ version: { $ne: 'x' } })).toEqual({ version: {} });
  });

  test('elimina $ anidado en arrays y objetos', () => {
    const out = run({ a: [{ $gt: 1 }], b: { c: { $regex: '.*' } } });
    expect(out).toEqual({ a: [{}], b: { c: {} } });
  });

  test('conserva claves legítimas (incluidas con punto)', () => {
    expect(run({ versionName: 'v1', 'a.b': 2 })).toEqual({ versionName: 'v1', 'a.b': 2 });
  });

  test('sanea query y params, no sólo body', () => {
    const req = { body: {}, query: { v: { $ne: 1 } }, params: { id: { $gt: 0 } } };
    mongoSanitize(req, {}, () => {});
    expect(req.query).toEqual({ v: {} });
    expect(req.params).toEqual({ id: {} });
  });
});

describe('SEC-01 — revokeAllSessions limpia las TRES variantes de refresh', () => {
  test('borra refreshTokenHash, previousRefreshTokenHash y refreshTokenExpiresAt', () => {
    const u = new Usuario({
      nombre: 'X', email: 'x@x.com', contraseña: 'Aa1!aaaa',
      refreshTokenHash: 'cur', previousRefreshTokenHash: 'prev',
      refreshTokenExpiresAt: new Date(),
    });
    u.revokeAllSessions();
    expect(u.refreshTokenHash).toBeNull();
    // El bug SEC-01: previousRefreshTokenHash sobrevivía al reset y un token
    // robado ya rotado a "previo" seguía siendo aceptado por refresh().
    expect(u.previousRefreshTokenHash).toBeNull();
    expect(u.refreshTokenExpiresAt).toBeNull();
  });
});
