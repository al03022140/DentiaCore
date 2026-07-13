/**
 * 0005 — Decodificar entidades HTML en la ficha de pacientes (legacy).
 *
 * CONTEXTO: hasta esta migración, SANITIZERS.sanitizeText escapaba ' " & < >
 * a entidades HTML AL GUARDAR (escape-en-entrada). Como React vuelve a escapar
 * en salida y el cliente nunca decodificaba, un paciente "O'Brien" se mostraba
 * literalmente como "O&#x27;Brien" en el expediente. El sanitizador ya es
 * trim-only (el escape correcto vive en la capa de salida); esta migración
 * restaura el texto original de lo ya persistido.
 *
 * ALCANCE: sólo los campos de ficha que el whitelist de create/update permitía
 * escribir (únicos que pasaron por el sanitizador). NO se tocan
 * notas_evolucion, planes_tratamiento ni consentimientoHC: son inmutables
 * (NOM-004), llevan contentHash firmado, y sus endpoints nunca aplicaron el
 * entity-encoding — no pueden contener entidades generadas por el sistema.
 *
 * El decode itera hasta estabilizar (máx. 5 pasadas) porque un sanitizador
 * anterior no-idempotente llegó a doble-escapar ("&amp;amp;"). Efecto
 * secundario asumido: si un usuario tecleó literalmente "&amp;" como texto,
 * se decodifica a "&" (indistinguible del artefacto del sistema).
 *
 * Idempotente: re-correr no encuentra strings con entidades que decodificar.
 */

// Mismo set de campos que CREATE/UPDATE_ALLOWED_FIELDS (patientsController).
const FICHA_FIELDS = [
  'documento', 'primer_nombre', 'otros_nombres', 'apellido_paterno', 'apellido_materno',
  'sexo', 'estado_civil', 'nacionalidad', 'lugar_nacimiento',
  'escolaridad', 'ocupacion', 'email', 'situacion_laboral', 'contacto',
  'contactos_emergencia', 'antecedentes_heredo_familiares', 'encuesta_medica',
  'informacion_femenina', 'habitos_higiene', 'evaluacion_dental_oclusal',
];

// Reversa exacta del encoder retirado (incluye &#39; de la variante más vieja).
// &amp; se decodifica AL FINAL de cada pasada para no fabricar entidades nuevas.
const decodeOnce = (s) => s
  .replace(/&lt;/g, '<')
  .replace(/&gt;/g, '>')
  .replace(/&quot;/g, '"')
  .replace(/&#x27;/g, "'")
  .replace(/&#39;/g, "'")
  .replace(/&amp;/g, '&');

const decodeEntities = (s) => {
  let out = s;
  for (let i = 0; i < 5; i++) {
    const next = decodeOnce(out);
    if (next === out) break;
    out = next;
  }
  return out;
};

// Recorre el valor decodificando strings. Devuelve [nuevoValor, cambió].
const decodeDeep = (value) => {
  if (typeof value === 'string') {
    const decoded = decodeEntities(value);
    return [decoded, decoded !== value];
  }
  if (Array.isArray(value)) {
    let changed = false;
    const out = value.map((item) => {
      const [v, c] = decodeDeep(item);
      if (c) changed = true;
      return v;
    });
    return [out, changed];
  }
  if (value && typeof value === 'object' && !(value instanceof Date)) {
    // Subdocs BSON llegan como objetos planos; _id/fechas se preservan tal cual.
    let changed = false;
    const out = {};
    for (const [k, v] of Object.entries(value)) {
      const [nv, c] = decodeDeep(v);
      if (c) changed = true;
      out[k] = nv;
    }
    return [out, changed];
  }
  return [value, false];
};

module.exports = {
  id: '0005-decodificar-entidades-html-pacientes',

  // Exportados para test unitario (migration-decode.test.js).
  _decodeEntities: decodeEntities,
  _decodeDeep: decodeDeep,

  async up(db) {
    const patients = db.collection('patients');
    // Sólo candidatos con alguna entidad en el doc serializado — evita
    // recorrer campo por campo los pacientes limpios.
    const cursor = patients.find({});

    let actualizados = 0;
    let revisados = 0;

    for await (const doc of cursor) {
      revisados++;
      const set = {};
      for (const field of FICHA_FIELDS) {
        if (doc[field] === undefined) continue;
        const [decoded, changed] = decodeDeep(doc[field]);
        if (changed) set[field] = decoded;
      }
      if (Object.keys(set).length > 0) {
        // Driver directo: sin validadores de schema (legacy-safe) y sin tocar
        // updatedAt — es un fix de representación, no una edición de contenido.
        await patients.updateOne({ _id: doc._id }, { $set: set });
        actualizados++;
      }
    }

    console.log(`[0005] pacientes revisados: ${revisados}; con entidades decodificadas: ${actualizados}`);
  },
};
