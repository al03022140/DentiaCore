# Instalación de v1.1.0 en la clínica — ensayo y día real

**Regla de oro: no se improvisa.** El día de la clínica se ejecuta exactamente
este documento, nada más. Cualquier cosa que salga mal ya tiene procedimiento
(rollback = restaurar el backup del paso 3).

---

## 1. Ensayo previo (máquina de prueba, ANTES de la visita)

Clonar exactamente la BD de la clínica y correr la secuencia completa:

```
mongodump (en la clínica, de su BD real)
   ↓
mongorestore (en la máquina de prueba)
   ↓
./update.sh          # backup → migrate:dry → migraciones 0001–0008 → build
   ↓
node scripts/check-health.js
   ↓
npm run verify:audit         # cadena NOM-024 íntegra
   ↓
npm run restore:test         # PASS de punta a punta
```

Si todo termina en verde, la visita ya está ensayada. Si algo falla, se
corrige AQUÍ — nunca por primera vez en la clínica.

> El ensayo con datos sintéticos ya pasó (2026-08-02, ver
> [RELEASE_v1.1.0.md](../../../RELEASE_v1.1.0.md)). Este ensayo repite lo mismo
> con la copia real para eliminar la última incógnita: los datos de la clínica.

---

## 2. Día de la clínica — orden exacto

```
 1. Avisar que el sistema entrará en mantenimiento.
 2. Cerrar la aplicación (nadie escribiendo durante la migración).
 3. Backup manual adicional:  npm run backup:db
 4. Ejecutar ./update.sh   (Windows: .\update.ps1)
 5. Esperar las migraciones (0001–0008; idempotentes, backup-first).
 6. Health check:          node scripts/check-health.js
 7. Cadena de auditoría:   npm run verify:audit   → "✅ Cadena íntegra"
 8. Entrar al sistema (login normal).
 9. Revisión funcional de 5 minutos:
    - abrir un expediente con historia (notas, odontograma, adjuntos)
    - los adjuntos/radiografías cargan (no 404)
    - agenda del día visible
    - un movimiento de caja de prueba (y cancelarlo)
10. Fin. Avisar que el sistema está de vuelta.
```

**Si algo falla en 4–7:** no se depura en vivo. Restaurar el backup del paso 3
(`npm run restore:db -- backups/<ultimo>.tar.gz --drop --force`), verificar
`npm run verify:audit`, dejar la clínica operando con su versión anterior, y
depurar el fallo en la máquina de prueba.

**Al terminar en verde:** llenar la sección "Instalado en clínica" de
[RELEASE_v1.1.0.md](../../../RELEASE_v1.1.0.md) (fecha y resultado).

---

## 3. Lo que NO se toca ese día

Nada que no esté en la lista de arriba. Explícitamente prohibido:

- mejoras de UI · refactors · rendimiento · limpieza
- `React.lazy` · ESLint · `npm update` · dependencias nuevas

Todo eso pertenece al backlog P1 / siguiente versión. El día de la clínica se
instala **exactamente** el commit del acta (`c959cb32`) — el que pasó las
validaciones. Un commit distinto = un acta distinta.

---

## 4. Recordatorios de configuración en sitio

- `Server/.env` de la clínica: **conservar su `AUDIT_HMAC_SECRET`** (nunca
  regenerarlo — ver [configuracion-produccion.md](configuracion-produccion.md)).
- Configurar `BACKUP_MIRROR_DIR` hacia el USB/NAS de la clínica y verificar
  con `node scripts/check-health.js` que el espejo reporta ✅.
- Opcional pero recomendado: `ALERT_WEBHOOK_URL` para recibir alertas de
  backup/salud/restauración sin estar presente.
