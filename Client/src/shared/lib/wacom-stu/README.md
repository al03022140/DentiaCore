# Integración Wacom STU (tableta de firmas) — WebHID

Captura firmas desde una **tableta de firmas Wacom serie STU** (STU-430, STU-500,
STU-520, STU-530, STU-540…) directamente en el navegador, **sin drivers nativos,
sin servicios externos y sin licencia de pago**.

Habla con el dispositivo por la API **WebHID**. El trazo del lápiz se renderiza a
un `<canvas>` y se exporta como **PNG dataURL**, exactamente el mismo formato que
ya consume el backend (`Server/utils/saveSignatureImage.js → saveSignatureDataUrl`),
así que **no hay cambios en el pipeline de firma del servidor**.

## Archivos

| Archivo | Rol |
|---|---|
| `wacomStuDriver.js` | Driver de bajo nivel WebHID. Conecta, lee capacidades y emite datos del lápiz. |
| `stuSignatureRenderer.js` | Convierte el stream del lápiz (x, y, presión) en trazos → PNG. |
| `index.js` | API pública: `createStuSession()`, `isWacomStuSupported()`, detección de motivo de no-disponibilidad. |

La UI vive en `Client/src/shared/components/WacomStuPanel.jsx`, integrada en
`SignaturePadModal.jsx` como el modo `device === 'stu'`. Como el pad del **doctor**
(`DoctorSignStep.jsx`) también abre `SignaturePadModal`, la STU sirve para firma de
**paciente y doctor** sin código extra.

## Requisitos (importante)

1. **Navegador Chromium**: Chrome o Edge. WebHID **no existe** en Safari ni Firefox.
2. **Contexto seguro**: `localhost` (cuenta como seguro) o **HTTPS**. En modo LAN por
   IP (`http://192.168.x.x:5002`) WebHID queda **bloqueado**; si la tableta se usa en
   un equipo distinto al servidor, hay que habilitar HTTPS.
3. **Gesto del usuario**: la primera conexión exige un click (lo dispara el botón
   "Conectar tableta Wacom"). Tras conceder permiso una vez, el navegador recuerda
   el dispositivo.

El `launcher.py` ya prefiere abrir Chrome/Edge automáticamente (ver
`_open_browser_prefer_chromium`).

## Modelos y PIDs

`requestDevice` filtra solo por el **VID de Wacom** (`0x056A`), así que en el diálogo
aparece cualquier STU conectada. Al conectar se leen las **capacidades reales** del
dispositivo (resolución y factor de presión), por lo que la **captura del lápiz es
portátil** entre modelos.

`KNOWN_STU_PRODUCT_IDS` en `wacomStuDriver.js` solo se usa para auto-detección en
segundo plano y eventos connect/disconnect. Si tu modelo no está, agrégalo:

```js
export const KNOWN_STU_PRODUCT_IDS = new Set([
  0x00a1, // STU-300
  0x00a2, // STU-430 / STU-430V
  0x00a3, // STU-500
  0x00a4, // STU-520
  0x00a5, // STU-530
  0x00a8, // STU-540
  0x00a9, // STU-541 / variantes
]);
```

> Para confirmar el PID exacto de tu equipo: en Chrome/Edge abre `chrome://device-log`
> o conéctalo desde el panel y revisa `navigator.hid.getDevices()` en la consola.

## Limitaciones conocidas (scaffolding)

- **Imagen en la pantalla LCD del pad** (`setImage`): el formato implementado es el del
  STU-540 (BGR 24bpp 800×480). No es necesario para capturar la firma; mostrar
  "Firme aquí" / fondos personalizados en otros modelos requiere adaptar resolución y
  formato. Mientras tanto se usan `clearScreen` + `setInking` + color de trazo, que
  son genéricos.
- **Cifrado**: igual que la librería original, se evita a propósito el modo cifrado
  (no se usan los comandos start/end capture). Se obtiene la **imagen** de la firma,
  no el stream biométrico cifrado. Suficiente para consentimientos; si en el futuro se
  requiere biometría no-repudiable cifrada, habría que implementar el handshake.
- **Verificación con hardware**: este código no se pudo probar contra un dispositivo
  físico en el entorno de desarrollo. Requiere una STU real + Chrome/Edge para la
  prueba end-to-end.

## Atribución

El driver de bajo nivel es una adaptación de
[**pabloko/Wacom-STU-WebHID**](https://github.com/pabloko/Wacom-STU-WebHID)
(Pablo García), publicado bajo **licencia MIT**. Ver `LICENSE-wacom-stu-webhid.txt`
en esta carpeta. Uso comercial permitido conservando el aviso de copyright.
