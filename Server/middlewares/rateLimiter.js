/**
 * Rate Limiting & Bot Protection Middleware — DentiaCore
 *
 * Centralised rate-limit definitions and a lightweight bot-detection
 * middleware.  Uses express-rate-limit (already in package.json).
 *
 * Tiers:
 *   globalLimiter        – overall API ceiling (all endpoints)
 *   strictAuthLimiter    – login / password-reset (tightest)
 *   accountCreationLimit – user creation
 *   writeLimiter         – generic write operations (POST/PUT/PATCH/DELETE)
 *   readLimiter          – generic read operations  (GET)
 *   oauthLimiter         – Google OAuth flow
 *   botGuard             – rejects clearly automated / headless requests
 */

const rateLimit = require('express-rate-limit');

/* ─── helpers ──────────────────────────────────────────────────── */

/** Standard error payload factory (Spanish to match existing messages). */
const msg = (text) => ({
  success: false,
  message: text,
});

/**
 * Key generator que combina IP + user id autenticado.
 * Importante en clínicas donde varios usuarios comparten una IP pública
 * (NAT): sin esto un usuario podría agotar el cap de los demás.
 */
const keyByIpAndUser = (req) => {
  const ip = req.ip;
  const userId = req.user?._id || req.user?.id || '';
  return `${ip}_${userId}`;
};

/**
 * Skip total de todos los rate limiters en development. StrictMode dispara
 * cada useEffect dos veces, vite-hot-reload reinicia componentes y los
 * dev-tools (Network tab, react-query refetch on focus) generan tráfico
 * que en pocas horas agota el cap de 15 min y bloquea al desarrollador.
 * En producción el limiter funciona normal.
 */
const skipInDev = (req) => process.env.NODE_ENV !== 'production';

/* ─── 1. Global API limiter ────────────────────────────────────── */

const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 min
  max: 1000,                 // por usuario+IP (no por IP-sola)
  message: msg('Demasiadas solicitudes. Intente nuevamente en 15 minutos.'),
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: keyByIpAndUser,
  // Skip health-check (monitoreo) y todo el tráfico de development.
  skip: (req) => req.path === '/api/health' || skipInDev(req),
});

/* ─── 2. Strict auth limiter (login, password reset) ───────────── */

const strictAuthLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 8,
  message: msg('Demasiados intentos de autenticación. Intente nuevamente en 15 minutos.'),
  standardHeaders: true,
  legacyHeaders: false,
});

/* ─── 3. Account creation limiter ──────────────────────────────── */

const accountCreationLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 5,                    // 5 accounts per IP per hour
  message: msg('Demasiadas cuentas creadas. Intente nuevamente en 1 hora.'),
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: keyByIpAndUser,
});

/* ─── 4. Generic write limiter ─────────────────────────────────── */

const writeLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 120,
  message: msg('Demasiadas operaciones de escritura. Intente nuevamente en 15 minutos.'),
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: keyByIpAndUser,
  skip: (req) => req.method === 'GET' || skipInDev(req),
});

/* ─── 5. Generic read limiter ──────────────────────────────────── */

const readLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 600,
  message: msg('Demasiadas consultas. Intente nuevamente en 15 minutos.'),
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: keyByIpAndUser,
  skip: (req) => req.method !== 'GET' || skipInDev(req),
});

/* ─── 6. OAuth limiter ─────────────────────────────────────────── */

const oauthLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 15,
  message: msg('Demasiadas solicitudes de OAuth. Intente nuevamente en 15 minutos.'),
  standardHeaders: true,
  legacyHeaders: false,
});

/* ─── 7. Bot / automated-script guard ──────────────────────────── */

/**
 * Light-weight heuristic that rejects requests that are almost certainly
 * from bots, scrapers or automated attack scripts.
 *
 * Checks performed:
 *   a) Missing or suspicious User-Agent
 *   b) Presence of well-known bot UA strings
 *
 * This is NOT a CAPTCHA replacement — it raises the bar against
 * low-effort automation without impacting legitimate API consumers
 * (Postman, curl in dev, browsers, mobile apps).
 */
const BLOCKED_UA_PATTERNS = [
  /python-requests/i,
  /python-urllib/i,
  /scrapy/i,
  /httpclient/i,
  /java\//i,
  /libwww-perl/i,
  /wget/i,
  /nikto/i,
  /sqlmap/i,
  /nmap/i,
  /masscan/i,
  /zgrab/i,
  /gobuster/i,
  /dirbuster/i,
  /nuclei/i,
  /httpx/i,
];

const botGuard = (req, res, next) => {
  // Allow requests with no origin in development (Postman, curl)
  if (process.env.NODE_ENV !== 'production') {
    return next();
  }

  const ua = req.headers['user-agent'] || '';

  // a) No user-agent at all in production → suspicious
  if (!ua) {
    return res.status(403).json(msg('Solicitud rechazada.'));
  }

  // b) Known attack / scraping tool signatures
  for (const pattern of BLOCKED_UA_PATTERNS) {
    if (pattern.test(ua)) {
      return res.status(403).json(msg('Solicitud rechazada.'));
    }
  }

  next();
};

/* ─── exports ──────────────────────────────────────────────────── */

module.exports = {
  globalLimiter,
  strictAuthLimiter,
  accountCreationLimiter,
  writeLimiter,
  readLimiter,
  oauthLimiter,
  botGuard,
};
