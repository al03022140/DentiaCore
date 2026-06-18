# Reporte de limpieza — DentiaCore

**Fecha:** 2026-06-16 · **Alcance:** repo completo (Client + Server + raíz), excluyendo `node_modules/`.
**Método:** mapa de disco + estado git (`check-ignore`), cruce de referencias de imágenes contra el código, detección de módulos no importados (verificada con las líneas `import/require` reales) y cruce de dependencias `package.json` contra el uso real.

> **Estado (2026-06-16): EJECUTADO** (Tier 1, 2, 3 y 3b). Build del cliente **verde** (✓ 3.290 módulos, 14.2 s) tras los borrados. La 1ª detección de código muerto tenía **9 falsos positivos** (archivos importados con su extensión `.jsx` en la ruta, que el detector no matcheaba); el build los detectó, se **restauraron desde git**, y la lista real de código muerto quedó en **16 archivos**. Pendiente del lado del usuario: `npm --prefix Server test` (Mongo bloqueado en este entorno) y commitear. Tier 4 (deps) NO ejecutado — queda como recomendación.

---

## Resumen

| Categoría | Hallazgo | Espacio / tamaño |
|---|---|---|
| 🟢 Logs de runtime | `Server/logs` — 1,172 archivos de rotación de winston | **6.6 GB** |
| 🟢 Cachés / cruft | `__pycache__`, `Server/tmp`, 8 × `.DS_Store`, `esb.err` | ~0.4 MB |
| 🟢 Build artifacts | `Client/dist` | 4.8 MB |
| 🟡 Trackeados a sacar de git | `.cursor`, `vite-build.log`, `DentiaCore.app` | pequeños |
| 🟠 Código muerto | **16** archivos no importados (8 cliente + 8 servidor) | aplicado |
| 🟠 Imágenes sin uso | 31 iconos/avatars/logos en `Client/src/assets` | (set de iconos) |
| 🔵 Dependencias npm sin uso | 8 Client + 4 Server + 7 raíz quitadas | **215 paquetes** podados |

**Recuperación de disco inmediata y segura:** ~6.6 GB (sin tocar código).

---

## 🟢 Tier 1 — Borrado seguro inmediato (regenerable / gitignored)

Todo esto está en `.gitignore` (no afecta al repo) o es cruft del SO. Se regenera solo.

- **`Server/logs/` — 6.6 GB.** Logs de excepciones de winston-daily-rotate (`exceptions-2026-*.log.NN`, ~20 MB c/u × 1,172). Gitignored. **El mayor ahorro con diferencia.** Vaciar el contenido (no borres la carpeta si el server espera que exista).
- **`__pycache__/` — 236 KB.** Bytecode de Python, gitignored.
- **`Server/tmp/` — 136 KB.** Temporales, gitignored.
- **8 × `.DS_Store`** (raíz, Client, Server, assets…). Cruft de macOS, gitignored.
- **`esb.err` — 432 B.** Log de error suelto, gitignored.
- **`Client/dist/` — 4.8 MB.** Output de build de Vite, gitignored.

Opcional (solo si recuperas espacio y vas a reinstalar): `node_modules` (raíz 95 MB + Client 500 MB + Server 258 MB ≈ **853 MB**) y `tools/mongo` (62 MB, binario local de Mongo). Se regeneran con `npm install` / descarga; **no** borrar si estás corriendo el proyecto.

> ⚠️ **No borrar `Server/uploads/`** (3.0 MB): son adjuntos/fotos de pacientes (PHI), datos clínicos reales, no cruft.

## 🟡 Tier 2 — Artefactos trackeados que no deberían versionarse

Están **commiteados** pese a que la intención es ignorarlos. Sacar del control de versiones.

- **`.cursor/`** — config del editor Cursor. No está en `.gitignore` (sí están `.vscode/` e `.idea/`). → agregar `.cursor/` al `.gitignore` y `git rm -r --cached .cursor`.
- **`vite-build.log`** — log de build (ya cubierto por `*.log`, pero quedó trackeado de antes). → `git rm --cached vite-build.log`.
- **`DentiaCore.app/`** — bundle de macOS "generado en instalación" (lo dice el propio `.gitignore`). → `git rm -r --cached DentiaCore.app`.

## 🟠 Tier 3 — Código muerto (16 archivos) — APLICADO

Módulos **no importados en ningún lado**, confirmado con el build del cliente (✓ verde). La 1ª pasada listaba 25, pero 9 eran **falsos positivos** (importados con la extensión en la ruta) — se restauraron. Lista real borrada:

**Client — borrados (8):**
```
src/features/audit/AuditTimelinePage.jsx
src/features/patient-detail/components/patient-diagnosis.jsx
src/features/patient-detail/components/patient-medical-cards.jsx
src/shared/components/CapturaExtemporanea.jsx
src/shared/components/SignatureModal.jsx
src/shared/components/footer.jsx
src/shared/components/notification.jsx
src/shared/utils/odontogram-normalizer.js
```
**Client — conservados (sí se usan; eran falsos positivos):** `odontograma-service.js`, `DoctorSignStep.jsx`, `SignatureBadge.jsx`, `AppointmentContext.jsx`, `UnsavedChangesContext.jsx`, `periodontogram-helpers.js`, `periodontogram-normalizer.js`, `version-name.js`.

**Server — borrados (8):**
```
config/swagger.js                      (y la dep swagger-jsdoc, su único usuario)
middlewares/upload.js                  (superseded por uploadFirma/uploadLogo + multer inline)
middlewares/uploadDocs.js
middlewares/uploadImage.js
models/schemas/damageSchema.js
models/schemas/initialSnapshotSchema.js
utils/odontogramUtils.js
utils/periodontogramUtils.js
```

> **Conservados (parecen huérfanos pero NO lo están):** `utils/periodontograma.js` (lo requiere `scripts/dent.js`), `models/prescription.js` (migración `0001-resellar-hashes`) y `utils/periodontogramData.js` (script de tests).
> **Revisar con ojo clínico antes de borrar:** los `utils/*odontogram*`/`*periodontogram*` y los `schemas/*` — son cálculos clínicos; confirmar que de verdad fueron reemplazados por las versiones en `helpers/`/`normalizers/`.

## 🟠 Tier 3b — Imágenes sin uso (31)

En `Client/src/assets/` (verificado: el nombre del archivo no aparece en ningún `.js/.jsx/.css/.html`). El set del Periodontograma (`Client/public/images/Periodontogram/…`) **sí se usa** (carga dinámica por número de diente) — no tocar.

```
src/assets/images/avatars/UserNot.png
src/assets/images/avatars/plantilla.png
src/assets/images/logos/logo.png
src/assets/images/logos/logo.svg
src/assets/images/icons/  →  3 dots menu.svg, Dentiacore16x16.png, Edit.svg, House.svg,
   X.svg, alert-circle.svg, alert-triangulo.svg, arrow dropbox.svg, arrow-left.svg,
   arrow-right.svg, arrow-up.svg, check circle.svg, check.svg, configuration.svg,
   dentiacoreblanco.png, eye-closed.svg, gemini-svg.svg, job.svg, menos.svg, menu.svg,
   message.svg, notification .svg, notification bell ringin.svg, open lock .svg,
   search.svg, trash.svg, trazability.svg
```

## 🔵 Tier 4 — Dependencias npm sin uso — APLICADO

Quitadas y verificadas: build del cliente **verde tras poda física** (✓ 5.6 s), y el grafo de rutas del servidor resuelve todos los `require`. **215 paquetes** podados de node_modules (Client −50, Server −58, raíz −107).

**Client (8):** `@fullcalendar/daygrid`, `@fullcalendar/google-calendar`, `@fullcalendar/react` (el calendario se reimplementó sin FullCalendar), `gapi-script`, `html2canvas`, `react-toastify` (se usa `message` de antd), `web-vitals` (deps), y `http-proxy-middleware` (devDep; Vite usa su proxy nativo). **Conservadas (sí se usan):** `axios`, `react-easy-crop` (cropper de fotos en add-patient).

**Server (4):** `axios`, `google-auth-library`, `http-proxy-middleware`, `swagger-jsdoc` (su única usuaria era `config/swagger.js`, ya borrado). La integración Google usa solo `googleapis`.

**Raíz (7):** `form-data`, `fs-extra`, `html2canvas`, `joi`, `multer`, `node-fetch`, `react-easy-crop` (vestigiales; pertenecían a Client/Server). **Conservadas:** `concurrently`, `nodemon`, `mongoose`, `cross-env`, `kill-port`.

**Install / launcher — alineados sin cambios:** `install.sh` e `install.ps1` ejecutan `npm install` dinámico desde cada `package.json` (sin listas de paquetes hardcodeadas), así que las deps quitadas se reflejan solas; el chequeo de dependencias de `launcher.py` solo valida paquetes **conservados** (`concurrently`, `nodemon`, `express`, `mongoose`, `dotenv`, `react`, `vite`); y `DentiaCore.app` lo **regenera** `install.sh` en cada instalación (por eso quitar la copia versionada es correcto). No hubo que tocar ningún instalador ni el launcher.

---

## Comandos sugeridos

```bash
# Tier 1 — recuperar 6.6 GB (seguro, gitignored)
find Server/logs -type f -delete
find . -name '.DS_Store' -not -path '*/node_modules/*' -delete
rm -rf __pycache__ Server/tmp/* Client/dist esb.err

# Tier 2 — sacar de git lo trackeado
echo ".cursor/" >> .gitignore
git rm -r --cached .cursor vite-build.log DentiaCore.app

# Tier 3/3b — código muerto + imágenes (revisar lista arriba, luego):
npm --prefix Server test      # confirmar verde
npm --prefix Client run build # confirmar que el build no rompe
```

## Verificación recomendada tras borrar código/imágenes

1. `npm --prefix Server test` → 0 fallos.
2. `npm --prefix Client run build` → build OK (atrapa cualquier import roto).
3. Revisar el `git diff`/`git status` antes de commitear.
