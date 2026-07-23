/**
 * Server/config/env.js — ÚNICO lector de process.env del Server.
 * (DEPLOYMENT_MODE fase 1 — ver docs-locales/DISENO_DEPLOYMENT_MODE_2026-07-16.md §3.2)
 *
 * Regla: ningún otro archivo del Server lee process.env (lint no-process-env).
 * Excepciones documentadas: este archivo, y en scripts/dent.js la carga de
 * dotenv + el default de TZ (escrituras, no lecturas de configuración).
 *
 * FASE 1 — CERO cambio de comportamiento:
 * - Getters VIVOS (leen process.env en cada acceso), no snapshot congelado:
 *   preserva la semántica actual con cualquier orden de carga (dotenv se
 *   carga en los entrypoints como hoy: dent.js y config/db.js) y con los
 *   tests que mutan process.env. El snapshot + Object.freeze del diseño
 *   queda para un endurecimiento posterior, con los tests adaptados.
 * - Los getters devuelven el valor CRUDO (sin defaults) salvo donde el
 *   default era idéntico en todos los call-sites (jwtIssuer, TTLs). Los
 *   defaults por sitio se quedan en el sitio — misma semántica que hoy.
 * - `mode`/`isCloud` existen desde ya, pero NADA deriva comportamiento de
 *   ellos todavía (eso es fase 2: cookies; fase 3+: same-origin, storage).
 */

const config = {
  /** local | cloud — default local: cero riesgo para lo ya instalado. */
  get mode() {
    const m = (process.env.DEPLOYMENT_MODE || 'local').toLowerCase();
    if (m !== 'local' && m !== 'cloud') {
      throw new Error(`DEPLOYMENT_MODE inválido: "${m}" (usa local | cloud)`);
    }
    return m;
  },
  get isCloud() { return config.mode === 'cloud'; },

  get env() { return process.env.NODE_ENV; },
  get isProd() { return process.env.NODE_ENV === 'production'; },
  get isDev() { return process.env.NODE_ENV === 'development'; },
  get isTest() { return process.env.NODE_ENV === 'test'; },

  server: {
    get port() { return process.env.PORT; },
    get host() { return process.env.HOST; },
    get trustProxy() { return process.env.TRUST_PROXY; },
    get apiUrl() { return process.env.API_URL; },
    get clientUrl() { return process.env.CLIENT_URL; },
  },

  security: {
    get jwtSecret() { return process.env.JWT_SECRET; },
    get jwtIssuer() { return process.env.JWT_ISSUER || 'dentia-core'; },
    get jwtAccessTtl() { return process.env.JWT_ACCESS_TTL || '15m'; },
    get jwtRefreshTtl() { return process.env.JWT_REFRESH_TTL || '7d'; },
    /** Flag crudo COOKIE_SECURE ('true' ⇒ true). La política final de la
     *  cookie vive en authController (fase 2 la derivará del modo). */
    get cookieSecureFlag() {
      return String(process.env.COOKIE_SECURE || 'false').toLowerCase() === 'true';
    },
    get auditHmacSecret() { return process.env.AUDIT_HMAC_SECRET; },
  },

  storage: {
    get uploadsDir() { return process.env.UPLOADS_DIR; },
  },

  db: {
    get uri() { return process.env.MONGODB_URI; },
  },

  ops: {
    get logLevel() { return process.env.LOG_LEVEL; },
    get logsDir() { return process.env.LOGS_DIR; },
    get logMaxFiles() { return process.env.LOG_MAX_FILES; },
    get alertWebhookUrl() { return process.env.ALERT_WEBHOOK_URL; },
  },

  google: {
    get clientId() { return process.env.GOOGLE_CLIENT_ID; },
    get clientSecret() { return process.env.GOOGLE_CLIENT_SECRET; },
    get redirectUri() { return process.env.GOOGLE_REDIRECT_URI; },
  },
};

module.exports = config;
