/*
 * Renderer de firma para tabletas Wacom STU.
 * ───────────────────────────────────────────────────────────────────────────
 * El driver WebHID solo entrega datos crudos del lápiz (cx, cy en px de
 * pantalla, presión 0..1, y `sw` = contacto). Aquí convertimos ese stream en
 * trazos sobre un <canvas> y exportamos un PNG dataURL — el mismo formato que
 * ya consume el backend (`saveSignatureDataUrl`), así que no hay cambios de
 * pipeline.
 *
 * El trazo usa ancho variable por presión y suavizado por punto medio
 * (quadratic), imitando el look del pad on-screen (signature_pad).
 */

const DEFAULT_OPTIONS = {
  inkColor: '#102a43', // mismo azul tinta que el pad on-screen
  background: null, // null = transparente (coherente con getTrimmedCanvas)
  minWidth: 0.7,
  maxWidth: 2.8,
  // Multiplicador para escalar el lienzo lógico del pad (px de pantalla) a un
  // PNG más nítido. 2 = doble resolución.
  scale: 2,
  // Padding (en px de pantalla) alrededor del bounding box al recortar.
  trimPadding: 12,
};

export class StuSignatureRenderer {
  /**
   * @param {object} opts
   * @param {number} opts.width  Ancho lógico (px de pantalla del pad)
   * @param {number} opts.height Alto lógico (px de pantalla del pad)
   */
  constructor(opts = {}) {
    this.options = { ...DEFAULT_OPTIONS, ...opts };
    this.width = Math.max(1, Math.round(opts.width || 800));
    this.height = Math.max(1, Math.round(opts.height || 480));

    this.canvas = document.createElement('canvas');
    this.canvas.width = Math.round(this.width * this.options.scale);
    this.canvas.height = Math.round(this.height * this.options.scale);
    this.ctx = this.canvas.getContext('2d');

    this._strokes = []; // [[{x,y,press}, ...], ...]
    this._current = null; // stroke en curso
    this._bbox = null; // {minX,minY,maxX,maxY}
    this._onChange = null;

    this._resetCanvas();
  }

  /** Suscribe un callback que se dispara cuando cambia el dibujo (preview en vivo). */
  onChange(cb) {
    this._onChange = cb;
  }

  /**
   * Procesa un paquete de pen data del driver.
   * @param {object} pen {sw, press, cx, cy}
   */
  addPenPoint(pen) {
    const touching = pen.sw === true && pen.press > 0;
    if (touching) {
      const point = { x: pen.cx, y: pen.cy, press: pen.press };
      if (!this._current) {
        this._current = [point];
        this._strokes.push(this._current);
      } else {
        this._current.push(point);
      }
      this._growBbox(point);
      this._drawIncremental();
      this._emitChange();
    } else if (this._current) {
      // El lápiz se levantó: cerramos el trazo en curso.
      this._current = null;
    }
  }

  _growBbox(p) {
    if (!this._bbox) {
      this._bbox = { minX: p.x, minY: p.y, maxX: p.x, maxY: p.y };
      return;
    }
    if (p.x < this._bbox.minX) this._bbox.minX = p.x;
    if (p.y < this._bbox.minY) this._bbox.minY = p.y;
    if (p.x > this._bbox.maxX) this._bbox.maxX = p.x;
    if (p.y > this._bbox.maxY) this._bbox.maxY = p.y;
  }

  _resetCanvas() {
    const { ctx } = this;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    if (this.options.background) {
      ctx.fillStyle = this.options.background;
      ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    }
    ctx.scale(this.options.scale, this.options.scale);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = this.options.inkColor;
    ctx.fillStyle = this.options.inkColor;
  }

  // Dibuja solo el último segmento del trazo en curso (eficiente para preview).
  _drawIncremental() {
    const s = this._current;
    if (!s || s.length < 2) {
      // Un único punto: dibuja un punto redondo.
      if (s && s.length === 1) {
        const p = s[0];
        this.ctx.beginPath();
        this.ctx.arc(p.x, p.y, this._widthFor(p.press) / 2, 0, Math.PI * 2);
        this.ctx.fill();
      }
      return;
    }
    const a = s[s.length - 2];
    const b = s[s.length - 1];
    const w = this._widthFor((a.press + b.press) / 2);
    this.ctx.beginPath();
    this.ctx.lineWidth = w;
    // Suavizado: punto medio como control quadratic.
    const midPrev = s.length >= 3
      ? { x: (s[s.length - 3].x + a.x) / 2, y: (s[s.length - 3].y + a.y) / 2 }
      : a;
    const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    this.ctx.moveTo(midPrev.x, midPrev.y);
    this.ctx.quadraticCurveTo(a.x, a.y, mid.x, mid.y);
    this.ctx.stroke();
  }

  _widthFor(press) {
    const { minWidth, maxWidth } = this.options;
    const p = Math.max(0, Math.min(1, press || 0));
    return minWidth + (maxWidth - minWidth) * p;
  }

  _emitChange() {
    if (this._onChange) this._onChange();
  }

  /** Redibuja todo desde cero (tras un resize o restauración). */
  redrawAll() {
    this._resetCanvas();
    for (const stroke of this._strokes) {
      // Reusa la lógica incremental acumulando los puntos en un array que se
      // reaprovecha (push O(1)) en vez de un slice por punto — antes era O(n²)
      // por trazo. _drawIncremental solo mira los últimos puntos de _current.
      this._current = [];
      for (let i = 0; i < stroke.length; i += 1) {
        this._current.push(stroke[i]);
        this._drawIncremental();
      }
    }
    this._current = null;
    this._emitChange();
  }

  isEmpty() {
    return this._strokes.length === 0 || this._bbox == null;
  }

  /** Borra todo. */
  clear() {
    this._strokes = [];
    this._current = null;
    this._bbox = null;
    this._resetCanvas();
    this._emitChange();
  }

  /** El canvas en vivo (para montar un preview en el DOM si se desea). */
  getLiveCanvas() {
    return this.canvas;
  }

  /**
   * Exporta un PNG dataURL recortado al bounding box de la firma (con padding),
   * imitando getTrimmedCanvas() de react-signature-canvas.
   * @returns {string|null} dataURL PNG o null si está vacío
   */
  toTrimmedDataUrl() {
    if (this.isEmpty()) return null;
    const { scale, trimPadding } = this.options;
    const pad = trimPadding;
    const minX = Math.max(0, this._bbox.minX - pad);
    const minY = Math.max(0, this._bbox.minY - pad);
    const maxX = Math.min(this.width, this._bbox.maxX + pad);
    const maxY = Math.min(this.height, this._bbox.maxY + pad);
    const w = Math.max(1, Math.round((maxX - minX) * scale));
    const h = Math.max(1, Math.round((maxY - minY) * scale));

    const out = document.createElement('canvas');
    out.width = w;
    out.height = h;
    const octx = out.getContext('2d');
    if (this.options.background) {
      octx.fillStyle = this.options.background;
      octx.fillRect(0, 0, w, h);
    }
    octx.drawImage(
      this.canvas,
      Math.round(minX * scale),
      Math.round(minY * scale),
      w,
      h,
      0,
      0,
      w,
      h,
    );
    return out.toDataURL('image/png');
  }

  /** PNG dataURL del lienzo completo (sin recortar). */
  toFullDataUrl() {
    if (this.isEmpty()) return null;
    return this.canvas.toDataURL('image/png');
  }
}

export default StuSignatureRenderer;
