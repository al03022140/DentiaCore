/*
 * Driver WebHID para tabletas de firma Wacom serie STU (STU-430/500/520/530/540…).
 * ───────────────────────────────────────────────────────────────────────────────
 * Adaptado a un módulo ES a partir del trabajo de Pablo García (licencia MIT):
 *   https://github.com/pabloko/Wacom-STU-WebHID
 *
 * Habla con el dispositivo directamente por la API WebHID del navegador, SIN
 * drivers nativos, SIN servicios externos y SIN licencia de pago. Solo funciona
 * en navegadores Chromium (Chrome/Edge) y en contexto seguro (localhost o HTTPS).
 *
 * NOTA sobre cifrado: igual que la librería original, NO usamos los comandos de
 * "start/end capture" que activan el cifrado del stream del lápiz. Leemos los
 * datos del lápiz en modo abierto. Para capturar la IMAGEN de una firma de
 * consentimiento esto es suficiente; no se obtiene el stream biométrico cifrado.
 *
 * NOTA sobre modelos: la captura del lápiz es portátil entre modelos STU porque
 * al conectar leemos las capacidades reales del dispositivo (resolución, factor
 * de presión) y derivamos la escala. Lo único atado al STU-540 es `setImage`
 * (subir un bitmap a la pantalla LCD, formato BGR 24bpp 800×480) — opcional y
 * solo para UX en el pad.
 */

// VID de Wacom (0x056A). Todos los STU lo comparten.
export const WACOM_VENDOR_ID = 0x056a; // 1386

// PIDs conocidos de la serie STU. Se usan para auto-detección y para filtrar
// los eventos connect/disconnect. NO se usan para `requestDevice` (ahí filtramos
// solo por VID para que el usuario pueda elegir cualquier STU desde el diálogo).
// Si tu modelo no aparece, la conexión sigue funcionando: solo no se
// auto-detectará en segundo plano hasta que lo agregues aquí.
export const KNOWN_STU_PRODUCT_IDS = new Set([
  0x00a1, // STU-300
  0x00a2, // STU-430 / STU-430V
  0x00a3, // STU-500
  0x00a4, // STU-520
  0x00a5, // STU-530
  0x00a8, // STU-540
  0x00a9, // STU-541 / variantes
]);

// Report IDs del protocolo STU (ver SDK de Wacom para la matriz de compatibilidad).
const COMMAND = {
  penData: 0x01,
  information: 0x08,
  capability: 0x09,
  writingMode: 0x0e,
  eSerial: 0x0f,
  clearScreen: 0x20,
  inkMode: 0x21,
  writeImageStart: 0x25,
  writeImageData: 0x26,
  writeImageEnd: 0x27,
  writingArea: 0x2a,
  brightness: 0x2b,
  backgroundColor: 0x2e,
  penColorAndWidth: 0x2d,
  penDataTiming: 0x34,
};

/**
 * ¿El navegador soporta WebHID en contexto seguro?
 * WebHID solo existe en Chromium (Chrome/Edge) y exige secure context
 * (localhost cuenta como seguro; en LAN por IP haría falta HTTPS).
 */
export function isWebHidAvailable() {
  return (
    typeof navigator !== 'undefined' &&
    navigator.hid != null &&
    typeof window !== 'undefined' &&
    window.isSecureContext === true
  );
}

export class WacomStuDriver {
  constructor() {
    this.device = null;
    this.image = null; // chunks de la última imagen enviada al LCD (reenvío sin reprocesar)
    this.onPenDataCb = null;
    this.onHidChangeCb = null;
    this._inputHandler = null;
    this._onHidConnect = null;
    this._onHidDisconnect = null;

    // Capacidades; se rellenan en connect() leyendo el dispositivo. Los valores
    // por defecto corresponden al STU-540 y solo se usan si el dispositivo no
    // expone el reporte de capacidades.
    this.config = {
      chunkSize: 253,
      imageFormat24BGR: 0x04,
      width: 800, // ancho de pantalla en px (se sobrescribe al conectar)
      height: 480, // alto de pantalla en px (se sobrescribe al conectar)
      scaleFactor: 13.5, // tabletUnits / screenPx (se recalcula al conectar)
      pressureFactor: 1023,
      refreshRate: 0,
      tabletWidth: 0,
      tabletHeight: 0,
      deviceName: null,
      firmware: null,
      eSerial: null,
    };

    // Listeners globales de conexión/desconexión HID. Guardamos las referencias
    // para poder removerlas en disconnect(): cada createStuSession() crea un
    // driver nuevo y el panel de firma abre una sesión en CADA montaje, así que
    // sin remover se acumularían (y cada driver quedaría retenido vivo por el
    // closure del listener global, sin recolectarse).
    this._onHidConnect = (e) => this._handleHidChange('connect', e.device);
    this._onHidDisconnect = (e) => this._handleHidChange('disconnect', e.device);
    if (typeof navigator !== 'undefined' && navigator.hid) {
      navigator.hid.addEventListener('connect', this._onHidConnect);
      navigator.hid.addEventListener('disconnect', this._onHidDisconnect);
    }
  }

  _handleHidChange(kind, device) {
    if (!device || device.vendorId !== WACOM_VENDOR_ID) return;
    // 'disconnect' solo nos importa si es EL dispositivo que tenemos abierto:
    // que se desconecte OTRA Wacom (p.ej. una tableta de dibujo del mismo VID)
    // no debe reportarse como "se desconectó la tableta de firma".
    if (kind === 'disconnect' && device !== this.device) return;
    // Para 'connect' aceptamos cualquier PID del VID de Wacom; si conocemos el
    // set de STU lo priorizamos, pero no descartamos modelos nuevos.
    if (this.onHidChangeCb) this.onHidChangeCb(kind, device);
  }

  /**
   * ¿Hay ya un STU con permiso concedido y disponible?
   * Nota: WebHID solo lista dispositivos tras un requestDevice() previo con
   * gesto del usuario. No te fíes de esto para la PRIMERA conexión.
   */
  async checkAvailable() {
    if (this.checkConnected()) return true;
    if (!isWebHidAvailable()) return false;
    const devices = await navigator.hid.getDevices();
    return devices.some(
      (d) => d.vendorId === WACOM_VENDOR_ID && KNOWN_STU_PRODUCT_IDS.has(d.productId),
    );
  }

  /**
   * Conecta al dispositivo. Muestra el diálogo de selección WebHID filtrando
   * por el VID de Wacom (cualquier STU es seleccionable). Requiere gesto del
   * usuario (click). Es la PRIMERA conexión: tras ella el permiso queda
   * concedido para el origen y `reconnect()` ya puede abrir en silencio.
   * @returns {Promise<boolean>} true si quedó conectado
   */
  async connect() {
    if (this.checkConnected()) return true;
    if (!isWebHidAvailable()) return false;

    const picked = await navigator.hid.requestDevice({
      filters: [{ vendorId: WACOM_VENDOR_ID }],
    });
    if (!picked || picked.length === 0 || picked[0] == null) return false;

    return this._attachDevice(picked[0]);
  }

  /**
   * Reconexión SILENCIOSA. Si en una sesión previa ya se concedió permiso a una
   * STU (vía `requestDevice` con gesto del usuario), `getDevices()` la lista sin
   * mostrar ningún diálogo y la abrimos directamente — sin selector y sin clic.
   * `open()` no exige gesto del usuario (solo `requestDevice()` lo hace).
   *
   * Devuelve false en silencio si no hay ninguna STU autorizada (primera vez /
   * navegador nuevo) o si la apertura falla (p.ej. otra app la está usando): en
   * ese caso el usuario siempre puede conectar manualmente con `connect()`.
   * @returns {Promise<boolean>} true si quedó conectado a una STU ya autorizada
   */
  async reconnect() {
    if (this.checkConnected()) return true;
    if (!isWebHidAvailable()) return false;
    try {
      const devices = await navigator.hid.getDevices();
      const stu = devices.find(
        (d) => d.vendorId === WACOM_VENDOR_ID && KNOWN_STU_PRODUCT_IDS.has(d.productId),
      );
      if (!stu) return false;
      return await this._attachDevice(stu);
    } catch {
      // Limpieza defensiva: si la apertura silenciosa falló a medias, soltamos
      // el dispositivo para que el botón manual quede operativo.
      await this.disconnect().catch(() => {});
      return false;
    }
  }

  /**
   * Abre el HIDDevice ya elegido (por `requestDevice` o `getDevices`), engancha
   * el listener de reportes del lápiz y lee las capacidades reales (resolución,
   * factor de presión). Compartido por `connect()` y `reconnect()`.
   * @param {HIDDevice} device
   * @returns {Promise<boolean>}
   */
  async _attachDevice(device) {
    this.device = device;
    if (!this.device.opened) await this.device.open();

    this._inputHandler = (event) => this._onInputReport(event);
    this.device.addEventListener('inputreport', this._inputHandler);

    await this._readCapabilities();
    return true;
  }

  async _readCapabilities() {
    // Capacidades (obligatorio para escala/resolución correctas).
    try {
      const dv = await this.readData(COMMAND.capability);
      if (dv) {
        this.config.tabletWidth = dv.getUint16(1);
        this.config.tabletHeight = dv.getUint16(3);
        this.config.pressureFactor = dv.getUint16(5) || this.config.pressureFactor;
        this.config.width = dv.getUint16(7) || this.config.width;
        this.config.height = dv.getUint16(9) || this.config.height;
        this.config.refreshRate = dv.getUint8(11);
        if (this.config.tabletWidth && this.config.width) {
          this.config.scaleFactor = this.config.tabletWidth / this.config.width;
        }
      }
    } catch {
      /* algunos modelos/firmwares no exponen este reporte: usamos defaults */
    }
    // Información (nombre y firmware) — best effort.
    try {
      const dv = await this.readData(COMMAND.information);
      if (dv) {
        this.config.deviceName = this._dataViewString(dv, 1, 7);
        this.config.firmware = `${dv.getUint8(8)}.${dv.getUint8(9)}.${dv.getUint8(10)}.${dv.getUint8(11)}`;
      }
    } catch {
      /* opcional */
    }
    // Número de serie — best effort.
    try {
      const dv = await this.readData(COMMAND.eSerial);
      if (dv) this.config.eSerial = this._dataViewString(dv, 1);
    } catch {
      /* opcional */
    }
  }

  _onInputReport(event) {
    if (this.onPenDataCb == null) return;
    // Solo reportes de datos del lápiz (modo básico 0x01 o con timing 0x34).
    if (event.reportId !== COMMAND.penData && event.reportId !== COMMAND.penDataTiming) return;

    const data = event.data; // DataView (sin el byte de reportId)
    const status = data.getUint8(0);
    const packet = {
      rdy: (status & (1 << 0)) !== 0, // lápiz en proximidad
      sw: (status & (1 << 1)) !== 0, // lápiz en contacto con la superficie
      cx: Math.trunc(data.getUint16(2) / this.config.scaleFactor), // px de pantalla
      cy: Math.trunc(data.getUint16(4) / this.config.scaleFactor), // px de pantalla
      x: data.getUint16(2), // unidades de tableta
      y: data.getUint16(4), // unidades de tableta
      press: 0,
      seq: null,
      time: null,
    };
    // La presión está en los 2 primeros bytes con los bits de estado en el MSB.
    // Limpiamos el nibble alto del primer byte y leemos como uint16.
    data.setUint8(0, status & 0x0f);
    packet.press = data.getUint16(0) / this.config.pressureFactor; // 0..~1
    if (event.reportId === COMMAND.penDataTiming) {
      packet.time = data.getUint16(6);
      packet.seq = data.getUint16(8);
    }
    this.onPenDataCb(packet);
  }

  getTabletInfo() {
    return this.checkConnected() ? { ...this.config } : null;
  }

  /** Color y grosor del trazo en la pantalla del pad. color '#RRGGBB', width 0-5. */
  async setPenColorAndWidth(color, width) {
    if (!this.checkConnected()) return;
    const c = this._hexToRgb(color);
    c.push(parseInt(width, 10));
    await this.sendData(COMMAND.penColorAndWidth, new Uint8Array(c));
  }

  /** Brillo del backlight 0-3. No conviene llamarlo con frecuencia. */
  async setBacklight(intensity) {
    if (!this.checkConnected()) return;
    const dv = await this.readData(COMMAND.brightness);
    if (dv && dv.getUint8(1) === intensity) return;
    await this.sendData(COMMAND.brightness, new Uint8Array([intensity, 0]));
  }

  /** Color de fondo '#RRGGBB'. Requiere clearScreen() para aplicarse. */
  async setBackgroundColor(color) {
    if (!this.checkConnected()) return;
    const c = this._hexToRgb(color);
    const dv = await this.readData(COMMAND.backgroundColor);
    if (dv && dv.getUint8(1) === c[0] && dv.getUint8(2) === c[1] && dv.getUint8(3) === c[2]) return;
    await this.sendData(COMMAND.backgroundColor, new Uint8Array(c));
  }

  /** Área activa de escritura. p = {x1,y1 (sup-izq), x2,y2 (inf-der)}. */
  async setWritingArea(p) {
    if (!this.checkConnected()) return;
    const pk = this._makePacket(8);
    pk.view.setUint16(0, p.x1, true);
    pk.view.setUint16(2, p.y1, true);
    pk.view.setUint16(4, p.x2, true);
    pk.view.setUint16(6, p.y2, true);
    await this.sendData(COMMAND.writingArea, pk.data);
  }

  /** Modo de escritura. 0: lápiz básico. 1: lápiz suave con timing extra. */
  async setWritingMode(mode) {
    if (!this.checkConnected()) return;
    await this.sendData(COMMAND.writingMode, new Uint8Array([mode]));
  }

  /** Habilita/inhabilita el "ink" en la pantalla del pad (no detiene eventos). */
  async setInking(enabled) {
    if (!this.checkConnected()) return;
    await this.sendData(COMMAND.inkMode, new Uint8Array([enabled ? 1 : 0]));
  }

  /** Limpia la pantalla del pad al color de fondo. */
  async clearScreen() {
    if (!this.checkConnected()) return;
    await this.sendData(COMMAND.clearScreen, new Uint8Array([0]));
  }

  /**
   * Envía un bitmap a la pantalla del pad. SOLO STU-540 (BGR 24bpp 800×480).
   * Para otros modelos hay que adaptar formato/resolución; no es necesario
   * para capturar la firma. Si imageData es null, reenvía la última imagen.
   */
  async setImage(imageData) {
    if (!this.checkConnected()) return;
    if (imageData != null) this.image = this._splitToBulks(imageData, this.config.chunkSize);
    if (this.image == null) return;
    await this.sendData(COMMAND.writeImageStart, new Uint8Array([this.config.imageFormat24BGR]));
    for (const e of this.image) {
      // eslint-disable-next-line no-await-in-loop
      await this.sendData(COMMAND.writeImageData, new Uint8Array([e.length, 0].concat(e)));
    }
    await this.sendData(COMMAND.writeImageEnd, new Uint8Array([0]));
  }

  checkConnected() {
    return this.device != null && this.device.opened;
  }

  /** Cierra y libera el dispositivo. Importante llamarlo al cerrar el modal. */
  async disconnect() {
    this.onPenDataCb = null;
    if (this.device) {
      try {
        if (this._inputHandler) this.device.removeEventListener('inputreport', this._inputHandler);
        if (this.device.opened) await this.device.close();
      } catch {
        /* ignore */
      }
    }
    // Remueve los listeners globales registrados en el constructor para que no
    // se acumulen entre sesiones. Mientras el dispositivo está conectado siguen
    // activos, así que la desconexión física se detecta hasta el teardown.
    if (typeof navigator !== 'undefined' && navigator.hid) {
      navigator.hid.removeEventListener('connect', this._onHidConnect);
      navigator.hid.removeEventListener('disconnect', this._onHidDisconnect);
    }
    this.device = null;
    this._inputHandler = null;
    this.image = null;
  }

  // ── Helpers internos ──────────────────────────────────────────────────────

  async sendData(reportId, data) {
    if (!this.checkConnected()) return;
    await this.device.sendFeatureReport(reportId, data);
  }

  async readData(reportId) {
    if (!this.checkConnected()) return null;
    return this.device.receiveFeatureReport(reportId);
  }

  _makePacket(len) {
    const data = new Uint8Array(len);
    return { data, view: new DataView(data.buffer) };
  }

  _hexToRgb(color) {
    const hex = String(color).replace('#', '');
    return [
      parseInt(hex.slice(0, 2), 16) || 0,
      parseInt(hex.slice(2, 4), 16) || 0,
      parseInt(hex.slice(4, 6), 16) || 0,
    ];
  }

  _splitToBulks(arr, bulkSize) {
    const bulks = [];
    for (let i = 0; i < Math.ceil(arr.length / bulkSize); i += 1) {
      const a = new Array(bulkSize);
      for (let x = i * bulkSize, z = 0; x < (i + 1) * bulkSize; x += 1, z += 1) a[z] = arr[x];
      bulks.push(a);
    }
    return bulks;
  }

  _dataViewString(dv, offset, length) {
    const end = typeof length === 'number' ? offset + length : dv.byteLength;
    let text = '';
    let pos = offset;
    while (pos < dv.byteLength && pos < end) {
      const val = dv.getUint8(pos);
      pos += 1;
      if (val === 0) break;
      text += String.fromCharCode(val);
    }
    return text;
  }

  // ── Suscripciones ─────────────────────────────────────────────────────────

  onPenData(func) {
    this.onPenDataCb = func;
  }

  onHidChange(func) {
    this.onHidChangeCb = func;
  }
}

export default WacomStuDriver;
