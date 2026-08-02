# Configuración de producción — DentiaCore

Checklist para desplegar una clínica de forma segura. Aplica sobre `Server/.env`
(ver `Server/.env.example`). El servidor **falla al arrancar** en producción si
los secretos críticos faltan o son débiles (fail-fast en `dent.js`).

---

## 1. Entorno

- [ ] `NODE_ENV=production` (activa validaciones estrictas, logs `combined`, oculta detalles de error, desactiva endpoints de debug).

## 2. Secretos (fuertes, únicos por clínica, nunca en git)

Genera cada uno con:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

- [ ] `JWT_SECRET` — ≥32 chars (recomendado 64 hex). Sin esto, el server **no arranca** en producción.
- [ ] `AUDIT_HMAC_SECRET` — ≥32 chars. Protege la integridad/no-repudio del audit log (NOM-024). Sin esto, el server **no arranca** en producción.
- [ ] `ENCRYPTION_KEY` — si se usa cifrado de datos en reposo.

> Si rotas `JWT_SECRET`, todas las sesiones se invalidan (los usuarios re-inician sesión).

### Rotación de `AUDIT_HMAC_SECRET` (key ring R-1)

Cada entrada del audit log guarda la huella (`keyId`) de la clave que la selló;
la verificación elige la clave por esa huella. Rotar NO invalida la historia y
no requiere migraciones ni tocar Mongo:

1. Añade el valor actual de `AUDIT_HMAC_SECRET` al final de
   `AUDIT_HMAC_RETIRED_SECRETS` (lista separada por comas — esas claves solo
   verifican, nunca firman).
2. Genera un `AUDIT_HMAC_SECRET` nuevo (comando de arriba).
3. Reinicia el servicio y corre `npm run verify:audit` como aceptación.

⚠️ **NUNCA elimines una clave de `AUDIT_HMAC_RETIRED_SECRETS` mientras existan
entradas firmadas con ella.** Si se elimina, `verify:audit` reportará rupturas
`unknown_key` sobre esas entradas — es la señal de "falta una clave histórica
en el `.env`", NO de corrupción de datos: se corrige restaurando la clave a la
lista. El server tampoco arranca si el ring es ambiguo (una misma clave listada
dos veces, o una retirada igual a la activa).

## 3. Cookies / HTTPS

- [ ] `COOKIE_SECURE=true` (requiere servir por HTTPS; si no, la cookie de sesión no viaja).
- [ ] TLS terminado por un reverse proxy (nginx/Caddy) o TLS nativo de Node. `CLIENT_URL` / `PUBLIC_URL` con `https://`.

## 4. MongoDB

- [ ] Autenticación habilitada (`--auth`), con un usuario dedicado para la app.
- [ ] `MONGODB_URI` con credenciales: `mongodb://usuario:password@127.0.0.1:27017/DentiaCore?authSource=admin`.
- [ ] Puerto 27017 **no expuesto** a la red (bind a `127.0.0.1`).

## 5. Verificación al desplegar

- [ ] Arrancar el server con la config de producción y confirmar que **levanta** (si un secreto falta/es débil, abortará con un mensaje claro — eso es lo esperado).
- [ ] Probar login (JWT funciona) y que una acción auditable quede registrada (audit HMAC funciona).
- [ ] Confirmar que `/uploads` exige sesión y que un rol sin `patients.read` no baja archivos clínicos (C-1).
- [ ] Backups agendados y restore probado (ver `backups-y-restauracion.md`).

---

### Comprobación rápida del fail-fast (opcional)

```bash
# En producción, sin secretos → debe abortar con error claro:
cd Server && NODE_ENV=production node -e "require('./utils/integrity').getAuditHmacSecret()"
# → lanza: 'FATAL: AUDIT_HMAC_SECRET must be set (≥32 chars) in production.'
```
