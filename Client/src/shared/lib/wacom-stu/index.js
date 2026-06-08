/*
 * API pública de la integración Wacom STU (WebHID).
 * ───────────────────────────────────────────────────────────────────────────
 * Une el driver de bajo nivel (wacomStuDriver) con el renderer de trazos
 * (stuSignatureRenderer) y expone una sesión de captura con una API simple y
 * basada en promesas para usar desde React.
 *
 * Flujo típico:
 *   const session = createStuSession({ inkColor: '#102a43' });
 *   await session.connect();          // muestra el diálogo WebHID (gesto del usuario)
 *   session.onPreview((dataUrl) => …) // preview en vivo mientras se firma
 *   await session.start();            // limpia pantalla y habilita el inking
 *   // … el paciente firma en el pad …
 *   const png = session.getPngDataUrl();
 *   await session.disconnect();
 */

import {
  WacomStuDriver,
  isWebHidAvailable,
  WACOM_VENDOR_ID,
  KNOWN_STU_PRODUCT_IDS,
} from './wacomStuDriver.js';
import { StuSignatureRenderer } from './stuSignatureRenderer.js';

export { isWebHidAvailable } from './wacomStuDriver.js';
export { WacomStuDriver } from './wacomStuDriver.js';
export { StuSignatureRenderer } from './stuSignatureRenderer.js';

/**
 * ¿Es viable usar el Wacom STU en este entorno?
 * No garantiza que haya un dispositivo conectado, solo que el navegador puede
 * hablar con él (Chromium + contexto seguro).
 */
export function isWacomStuSupported() {
  return isWebHidAvailable();
}

/**
 * ¿Hay ya una tableta STU con permiso concedido en una sesión previa?
 * Usa `getDevices()` — NO muestra ningún diálogo. Sirve para decidir si vale la
 * pena intentar la reconexión silenciosa (sin construir una sesión completa)
 * antes de caer al botón manual "Conectar".
 * @returns {Promise<boolean>}
 */
export async function hasAuthorizedStu() {
  if (!isWebHidAvailable()) return false;
  try {
    const devices = await navigator.hid.getDevices();
    return devices.some(
      (d) => d.vendorId === WACOM_VENDOR_ID && KNOWN_STU_PRODUCT_IDS.has(d.productId),
    );
  } catch {
    return false;
  }
}

/**
 * Razón por la que NO se puede usar el STU (para mostrar un mensaje claro).
 * @returns {string|null} null si está soportado
 */
export function getWacomStuUnavailabilityReason() {
  if (typeof navigator === 'undefined' || navigator.hid == null) {
    return 'Tu navegador no soporta WebHID. Usa Google Chrome o Microsoft Edge para firmar con la tableta Wacom STU.';
  }
  if (typeof window !== 'undefined' && window.isSecureContext !== true) {
    return 'La tableta Wacom STU requiere una conexión segura (localhost o HTTPS). Abre DentiaCore en el equipo donde está conectada la tableta, o habilita HTTPS para acceso por red.';
  }
  return null;
}

/**
 * Crea una sesión de captura STU.
 * @param {object} opts
 * @param {string} [opts.inkColor='#102a43']
 * @param {number} [opts.penWidth=2] grosor del trazo en el LCD del pad (0-5)
 * @param {string} [opts.backgroundColor='#ffffff'] fondo del LCD del pad
 */
export function createStuSession(opts = {}) {
  const inkColor = opts.inkColor || '#102a43';
  const penWidth = opts.penWidth != null ? opts.penWidth : 2;
  const padBackground = opts.backgroundColor || '#ffffff';

  const driver = new WacomStuDriver();
  let renderer = null;
  let previewCb = null;
  let connectionCb = null;

  driver.onHidChange((kind) => {
    if (connectionCb) connectionCb(kind);
  });

  function emitPreview() {
    if (!previewCb || !renderer) return;
    // Para el preview usamos el lienzo completo (no recortado) para que el
    // trazo aparezca en su posición real mientras se firma.
    previewCb(renderer.toFullDataUrl());
  }

  // Crea el renderer dimensionado a las capacidades reales del dispositivo y
  // engancha el flujo de datos del lápiz. Compartido por connect()/reconnect().
  function wireRenderer() {
    const info = driver.getTabletInfo();
    renderer = new StuSignatureRenderer({
      width: info?.width || 800,
      height: info?.height || 480,
      inkColor,
    });
    renderer.onChange(emitPreview);
    driver.onPenData((pen) => renderer.addPenPoint(pen));
    return info;
  }

  return {
    /** ¿El navegador soporta WebHID? */
    isSupported() {
      return isWacomStuSupported();
    },

    /** Suscribe el preview en vivo: (pngDataUrl|null) => void */
    onPreview(cb) {
      previewCb = cb;
    },

    /** Suscribe cambios de conexión HID: ('connect'|'disconnect') => void */
    onConnectionChange(cb) {
      connectionCb = cb;
    },

    /** Abre el diálogo WebHID y conecta. Devuelve info del dispositivo o null. */
    async connect() {
      const ok = await driver.connect();
      if (!ok) return null;
      return wireRenderer();
    },

    /**
     * Reconexión SILENCIOSA a una STU ya autorizada (sin diálogo ni clic).
     * Devuelve info del dispositivo, o null si no hay ninguna autorizada / falla.
     */
    async reconnect() {
      const ok = await driver.reconnect();
      if (!ok) return null;
      return wireRenderer();
    },

    isConnected() {
      return driver.checkConnected();
    },

    getDeviceInfo() {
      return driver.getTabletInfo();
    },

    /**
     * Prepara el pad para firmar: configura color, fondo, limpia pantalla y
     * habilita el inking. Best-effort: si algún comando falla en cierto modelo,
     * la captura del lápiz sigue funcionando.
     */
    async start() {
      if (!driver.checkConnected()) return;
      if (renderer) renderer.clear();
      try {
        await driver.setBackgroundColor(padBackground);
        await driver.setPenColorAndWidth(inkColor, penWidth);
        await driver.clearScreen();
        await driver.setInking(true);
        // Modo 1 = lápiz suave con timing extra (mejores trazos).
        await driver.setWritingMode(1);
      } catch {
        /* algunos comandos de LCD son específicos por modelo: no es crítico */
      }
    },

    /** Limpia la firma (lienzo + pantalla del pad). */
    async clear() {
      if (renderer) renderer.clear();
      try {
        await driver.clearScreen();
      } catch {
        /* ignore */
      }
    },

    isEmpty() {
      return renderer ? renderer.isEmpty() : true;
    },

    /** PNG dataURL recortado al trazo, listo para enviar al backend. */
    getPngDataUrl() {
      return renderer ? renderer.toTrimmedDataUrl() : null;
    },

    /** Cierra y libera el dispositivo. Llamar SIEMPRE al cerrar el modal. */
    async disconnect() {
      try {
        await driver.setInking(false);
      } catch {
        /* ignore */
      }
      await driver.disconnect();
      previewCb = null;
      connectionCb = null;
      renderer = null;
    },
  };
}

export default { createStuSession, isWacomStuSupported, getWacomStuUnavailabilityReason };
