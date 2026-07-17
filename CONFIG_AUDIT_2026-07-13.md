# DentiaCore Config Audit — 2026-07-13

Scope: `Server/config/*`, `Server/ecosystem.config.cjs`, `Client/src/shared/config/periodontogram-config.js`, `Client/vite.config.js`, `Client/jest.config.js`, `Client/babel.config.cjs`. First run of this scheduled audit (no previous report found).

Overall: no hardcoded secrets in any config file — secrets correctly live in `Server/.env`, which is gitignored (`.gitignore:2-8`). CORS is an allowlist, `/metrics` is dev-only, `/health` returns 503 when DB is down. The main issues are a stale secret backup file, DB URI handling, and the duplicated periodontogram config that has drifted between Server and Client.

---

## High

### H1. Stale env backup with old JWT secret — `Server/.env.bak-jwt`
A backup of the env file (presumably from a JWT secret rotation) sits next to `.env`. It's gitignored, but it likely contains a previously valid `JWT_SECRET` in plaintext on disk. If the rotation happened because of exposure, the old secret is still recoverable; if tokens signed with it haven't all expired, it's a live risk.
**Fix:** delete the file. If unsure the old secret was ever exposed, confirm rotation completed (all refresh tokens reissued), then delete.

### H2. MongoDB URI logged on connection failure — `Server/config/db.js:78`
`logger.error('🛑 No se pudo conectar…', maxRetries, { uri })` writes the full connection string to the rotated log. Your own `.env.example` recommends production URIs of the form `mongodb://usuario:password@127.0.0.1:27017/...` — that password would land in plaintext logs (14-day retention) precisely on the failure path.
**Fix:** redact credentials before logging: `uri.replace(/\/\/[^@]+@/, '//***@')`, or log only host/db name.

### H3. No validation that `MONGODB_URI` is set — `Server/config/db.js:14,43`
`const uri = options.uri || process.env.MONGODB_URI;` — if the env var is missing, `mongoose.connect(undefined)` fails with a cryptic driver error, retried 5 times with backoff (~31s) before `process.exit(1)`. The server already fails-fast on weak `AUDIT_HMAC_SECRET`; DB URI deserves the same.
**Fix:** at the top of `connectDB`, `if (!uri) { logger.error('MONGODB_URI no definido'); process.exit(1); }`.

### H4. `AUDIT_HMAC_SECRET` missing from the active `.env` — `Server/.env`
`.env.example` marks it REQUIRED in production (≥32 chars, NOM-024 audit-log tamper protection) and says the server won't boot in production without it. The current `.env` has no `AUDIT_HMAC_SECRET` key at all, while `ecosystem.config.cjs` defaults this machine to `NODE_ENV=production`. If PM2 is (or becomes) the launch path here, the API won't start — or worse, if the boot check ever regresses, audit logs run unprotected.
**Fix:** generate and add the secret now (`node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`).

---

## Medium

### M1. Periodontogram config duplicated and drifted — `Server/config/periodontogram-config.js` vs `Client/src/shared/config/periodontogram-config.js`
Both claim to be the "single source of truth" (Server header says "SINCRONIZADO CON CONFIGURACIÓN DEL CLIENTE v1.0.0"; Client is at v4.0.0). Concrete drift:

- **Key naming:** Server `MEASUREMENT_LIMITS` uses English UPPER_SNAKE (`PROBING_DEPTH`), Client uses Spanish camelCase (`profundidadSondaje`) plus mutated-in legacy aliases (Client lines 145-151). Same numeric ranges today, but nothing enforces that — a future limit change must be made twice in two shapes.
- **Stale comment:** Server `DEFAULT_TOOTH_DATA.pronostico` comment (line 143) lists only `'Bueno', 'Regular', 'Malo', 'Dudoso'`; the real enum (Client `FIELD_OPTIONS.pronostico` and `Server/models/periodontogram.js:195`) includes `'Imposible'`. The model is correct; the config comment misleads.
- **Structure:** Server exposes `TOOTH_NUMBERS` quadrant map + `MOLAR_TEETH`/furca helpers; Client exposes `TOOTH_QUADRANTS`/`FACE_MAPPING`. Different quadrant ordering for lower teeth (Server LOWER_LEFT `[38…31]`, Client Q3 `[31…38]`).

The repo already shares `periodontal-stats-core.cjs` between Server and Client (see `vite.config.js` dev-CJS plugin) — the same mechanism fits here.
**Fix:** extract the truly shared constants (teeth lists, `MEASUREMENT_LIMITS`, pronóstico enum) into one shared `.cjs` consumed by both sides; keep UI-only (colors, faces) client-side. Minimum: fix the stale comment and add a comment cross-referencing the two files.

### M2. Conflicting cache policy on `/uploads` — `Client/vite.config.js:88-91` vs `Server/scripts/dent.js:164`
The dev proxy sets `Cache-Control: public, max-age=31536000` for `/uploads` (patient attachments = PHI), while the server deliberately serves them `private, no-store`. Note http-proxy's `headers` option applies to the *outgoing request*, not the response — so this config almost certainly does nothing except document the wrong intent. Dev-only, but a `public, 1yr` policy on patient files should not exist anywhere in the repo.
**Fix:** delete the `headers` block from the `/uploads` proxy.

### M3. Dead config options — `Server/config/periodontogram-config.js`
`TRANSFORMATION_CONFIG` (lines 128-133) is referenced nowhere outside its own file. `CACHE_CONFIG`/`LOGGING_CONFIG`/`VALIDATION_CONFIG` are consumed only by `UniversalToothValidator.js`. Client side, `LOGGING_CONFIG` (lines 294-306) hardcodes `currentLevel: 2` and `enableConsoleOutput: true` with no prod/dev switch — if honored, info-level console logging ships to production browsers.
**Fix:** delete `TRANSFORMATION_CONFIG`; gate client console output on `import.meta.env.PROD`.

---

## Low

### L1. Verbose per-request proxy logging — `Client/vite.config.js:60-86`
Every dev API request logs 2 lines to console (`Sending Request…` / `Received Response…`). Noise that buries real errors. Keep the `error` handlers, drop `proxyReq`/`proxyRes`.

### L2. CORS allows requests with no Origin, with `credentials: true` — `Server/scripts/dent.js:94-95`
`if (!origin) return callback(null, true)` is standard (curl/Postman/same-origin don't send Origin, and cookies still require auth), but worth knowing it's deliberate. No change needed; add a one-line comment stating the rationale.

### L3. PM2 config minimal — `Server/ecosystem.config.cjs`
No `max_restarts`/`min_uptime` (a crash-looping app restarts forever at full speed) and no `log_date_format`. Winston handles app logs, so this only affects PM2's own stdout capture. Optional: add `max_restarts: 10, min_uptime: '10s'`.

### L4. Jest coverage excludes nonexistent files — `Client/jest.config.js:22-23`
`!src/index.js` and `!src/reportWebVitals.js` are CRA leftovers; Vite entry is `src/main.jsx`. Harmless, but the real entry isn't excluded from coverage while phantom files are. Swap to `!src/main.jsx`.

### L5. `babel.config.cjs` — no issues
Minimal, test-only (Vite ignores it), targets `node: 'current'`. Correct as-is.

### L6. `Server/config/patientValidation.js` — no issues
Dead PII validators already removed; sanitizer correctly trims-only with escape-on-output documented. `LIMITS` are sane.

---

## Summary

| Severity | Count | Files |
|---|---|---|
| High | 4 | `.env.bak-jwt`, `db.js` ×2, `.env` |
| Medium | 3 | periodontogram-config ×2, `vite.config.js` |
| Low | 6 | vite/dent/ecosystem/jest/babel/patientValidation |

Priority order: delete `.env.bak-jwt` → add `AUDIT_HMAC_SECRET` → redact URI in `db.js` logs → fail-fast on missing `MONGODB_URI` → remove `/uploads` cache header block.
