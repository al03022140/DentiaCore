/**
 * Utils to adapt frontend payloads (English, block-centric) to
 * canonical backend schema (Spanish, face-centric) and normalize furca.
 */

// Ensure arrays have length 3, coerce boolean to 0/1 and clamp to [min,max]
function ensureArray3(arr, min = null, max = null) {
  if (!Array.isArray(arr)) arr = [arr, 0, 0];
  const out = [...arr];
  while (out.length < 3) out.push(0);
  return out.slice(0, 3).map(v => {
    let n = (v === true) ? 1 : (v === false || v == null) ? 0 : Number(v);
    if (!Number.isFinite(n)) n = 0;
    if (min != null && n < min) n = min;
    if (max != null && n > max) n = max;
    return n;
  });
}

// Normalize single tooth furca into { vestibular, lingualPalatino, doble: { furca1, furca2 } }
function normalizeFurcaInTooth(tooth) {
  if (!tooth || typeof tooth !== 'object') return tooth;
  const t = { ...tooth };
  const hasTopF1 = Object.prototype.hasOwnProperty.call(t, 'furca1');
  const hasTopF2 = Object.prototype.hasOwnProperty.call(t, 'furca2');
  if (hasTopF1 || hasTopF2) {
    const baseFurca = (t.furca && typeof t.furca === 'object') ? { ...t.furca } : {};
    const baseDoble = (baseFurca.doble && typeof baseFurca.doble === 'object') ? { ...baseFurca.doble } : {};
    if (hasTopF1) baseDoble.furca1 = t.furca1;
    if (hasTopF2) baseDoble.furca2 = t.furca2;
    baseFurca.doble = baseDoble;
    delete t.furca1;
    delete t.furca2;
    t.furca = baseFurca;
  }
  if (t.furca && typeof t.furca === 'object') {
    const f = { ...t.furca };
    const hasNestedF1 = Object.prototype.hasOwnProperty.call(f, 'furca1');
    const hasNestedF2 = Object.prototype.hasOwnProperty.call(f, 'furca2');
    const hasDoble = f.doble && typeof f.doble === 'object';
    if ((hasNestedF1 || hasNestedF2) && !hasDoble) {
      const { furca1, furca2, ...rest } = f;
      t.furca = { ...rest, doble: { furca1, furca2 } };
    }
  }
  return t;
}

function normalizeFurcaInTeeth(teeth) {
  if (!teeth || typeof teeth !== 'object') return teeth || {};
  const out = {};
  for (const key of Object.keys(teeth)) {
    out[key] = normalizeFurcaInTooth(teeth[key]);
  }
  return out;
}

const FACE_BUILDERS = {
  profundidadSondaje: { min: 0, max: 15 },
  margenGingival: { min: -10, max: 10 },
  sangrado: { min: 0, max: 3 },
  supuracion: { min: 0, max: 1 },
  placa: { min: 0, max: 1 }
};

const DEFAULT_ARCADAS_PAYLOAD = () => ({ superior: {}, inferior: {} });

function buildFacePayload(faceSource = {}) {
  const payload = {};
  for (const [key, limits] of Object.entries(FACE_BUILDERS)) {
    payload[key] = ensureArray3(faceSource?.[key], limits.min, limits.max);
  }
  return payload;
}

function inferArcada(toothNumber) {
  const n = Number.parseInt(toothNumber, 10);
  if (!Number.isFinite(n)) return 'superior';
  const quadrant = Math.floor(n / 10);
  return quadrant === 1 || quadrant === 2 ? 'superior' : 'inferior';
}

function buildArcadasFromTeeth(teeth) {
  if (!teeth || typeof teeth !== 'object') {
    return DEFAULT_ARCADAS_PAYLOAD();
  }

  const arcadas = DEFAULT_ARCADAS_PAYLOAD();

  Object.entries(teeth).forEach(([toothKey, toothValue]) => {
    const numeroDiente = Number.parseInt(toothValue?.numeroDiente ?? toothKey, 10);
    const arcada = toothValue?.arcada || inferArcada(toothKey);
    const bucket = arcada === 'inferior' ? arcadas.inferior : arcadas.superior;

    const vestibularSource = arcada === 'inferior'
      ? toothValue?.vestibularInferior
      : toothValue?.vestibularSuperior;
    const palatinoOrLingualSource = arcada === 'inferior'
      ? toothValue?.lingualInferior
      : toothValue?.palatinoSuperior;

    bucket[toothKey] = {
      numeroDiente,
      ausente: Boolean(toothValue?.ausente),
      implante: Boolean(toothValue?.implante),
      movilidad: Number(toothValue?.movilidad ?? 0) || 0,
      anchuraEncia: Number(toothValue?.anchuraEncia ?? 0) || 0,
      furca: normalizeFurcaInTooth(toothValue?.furca || {}),
      pronostico: toothValue?.pronostico || 'Bueno',
      vestibular: buildFacePayload(vestibularSource),
      [arcada === 'inferior' ? 'lingual' : 'palatino']: buildFacePayload(palatinoOrLingualSource),
      fechaUltimaModificacion: toothValue?.fechaUltimaModificacion || new Date().toISOString()
    };
  });

  return arcadas;
}

// Adapt frontend-style teeth payload to canonical Spanish face-centric schema
function adaptTeethFromClientPayload(teeth) {
  if (!teeth || typeof teeth !== 'object') return {};

  const FACE_KEYS = ['vestibularSuperior', 'palatinoSuperior', 'vestibularInferior', 'lingualInferior'];
  const BLOCKS_EN = {
    bleeding: { key: 'sangrado', min: 0, max: 3 },
    plaque: { key: 'placa', min: 0, max: 1 },
    suppuration: { key: 'supuracion', min: 0, max: 1 },
    gingivalMargin: { key: 'margenGingival', min: -10, max: 10 },
    probingDepth: { key: 'profundidadSondaje', min: 0, max: 15 }
  };
  const BLOCKS_ES = {
    sangrado: { key: 'sangrado', min: 0, max: 3 },
    placa: { key: 'placa', min: 0, max: 1 },
    supuracion: { key: 'supuracion', min: 0, max: 1 },
    margenGingival: { key: 'margenGingival', min: -10, max: 10 },
    profundidadSondaje: { key: 'profundidadSondaje', min: 0, max: 15 }
  };

  const getArcada = (num) => {
    const n = parseInt(num, 10);
    const first = Math.floor(n / 10);
    return (first === 1 || first === 2) ? 'superior' : 'inferior';
  };

  const out = {};
  for (const [toothKey, toothVal] of Object.entries(teeth)) {
    const baseFace = () => ({
      profundidadSondaje: [0, 0, 0],
      margenGingival: [0, 0, 0],
      sangrado: [0, 0, 0],
      supuracion: [0, 0, 0],
      placa: [0, 0, 0]
    });

    const normalizedTooth = {
      numeroDiente: parseInt(toothKey, 10),
      arcada: getArcada(toothKey),
      ausente: (() => {
        const present = (typeof toothVal?.present === 'boolean') ? toothVal.present : undefined;
        if (present !== undefined) return !present;
        return Boolean(toothVal?.ausente ?? toothVal?.absent ?? false);
      })(),
      implante: Boolean(toothVal?.implante ?? toothVal?.implant ?? false),
      movilidad: Number(toothVal?.movilidad ?? toothVal?.mobility ?? 0) || 0,
      anchuraEncia: Number(toothVal?.anchuraEncia ?? toothVal?.gumWidth ?? 0) || 0,
      furca: (() => {
        const f = toothVal?.furca || {};
        const topF1 = toothVal?.furca1; const topF2 = toothVal?.furca2;
        const doble = {
          furca1: Number(f?.doble?.furca1 ?? f?.furca1 ?? topF1 ?? 0) || 0,
          furca2: Number(f?.doble?.furca2 ?? f?.furca2 ?? topF2 ?? 0) || 0
        };
        return {
          vestibular: Number(f?.vestibular ?? 0) || 0,
          lingualPalatino: Number(f?.lingualPalatino ?? 0) || 0,
          doble
        };
      })(),
      pronostico: (() => {
        const p = (toothVal?.pronostico || toothVal?.prognosis || 'bueno').toString().toLowerCase();
        const allowed = ['bueno', 'regular', 'malo', 'dudoso'];
        const v = allowed.includes(p) ? p : 'bueno';
        return v.charAt(0).toUpperCase() + v.slice(1);
      })(),
      vestibularSuperior: baseFace(),
      palatinoSuperior: baseFace(),
      vestibularInferior: baseFace(),
      lingualInferior: baseFace(),
      fechaUltimaModificacion: new Date().toISOString()
    };

    const isUpper = normalizedTooth.arcada === 'superior';

    // If it looks like face-first Spanish structure, normalize arrays and continue
    const looksLikeFaceFirst = FACE_KEYS.some(face =>
      toothVal && typeof toothVal[face] === 'object' && (
        Array.isArray(toothVal[face]?.sangrado) ||
        Array.isArray(toothVal[face]?.placa) ||
        Array.isArray(toothVal[face]?.supuracion) ||
        Array.isArray(toothVal[face]?.margenGingival) ||
        Array.isArray(toothVal[face]?.profundidadSondaje)
      )
    );
    if (looksLikeFaceFirst) {
      FACE_KEYS.forEach(face => {
        const src = toothVal[face] || {};
        if (!src) return;
        normalizedTooth[face] = {
          profundidadSondaje: ensureArray3(src.profundidadSondaje, 0, 15),
          margenGingival: ensureArray3(src.margenGingival, -10, 10),
          sangrado: ensureArray3(src.sangrado, 0, 3),
          supuracion: ensureArray3(src.supuracion, 0, 1),
          placa: ensureArray3(src.placa, 0, 1)
        };
      });
      out[toothKey] = normalizedTooth;
      continue;
    }

    // Nueva forma unificada del front: bloques "vestibular" y "palatino" con métricas normalizadas
    const hasTwoFaceStructure = (
      toothVal && typeof toothVal === 'object' && (
        typeof toothVal.vestibular === 'object' ||
        typeof toothVal.palatino === 'object' ||
        typeof toothVal.lingual === 'object'
      )
    );
    if (hasTwoFaceStructure) {
      const mapFace = (faceObj = {}) => ({
        profundidadSondaje: ensureArray3(faceObj.profundidadSondaje, 0, 15),
        margenGingival: ensureArray3(faceObj.margenGingival, -10, 10),
        sangrado: ensureArray3(faceObj.sangrado, 0, 3),
        supuracion: ensureArray3(faceObj.supuracion, 0, 1),
        placa: ensureArray3(faceObj.placa, 0, 1)
      });

      const vestibularSrc = toothVal.vestibular;
      const palatinoSrc = toothVal.palatino ?? toothVal.lingual;

      if (isUpper) {
        if (vestibularSrc) normalizedTooth.vestibularSuperior = mapFace(vestibularSrc);
        if (palatinoSrc) normalizedTooth.palatinoSuperior = mapFace(palatinoSrc);
      } else {
        if (vestibularSrc) normalizedTooth.vestibularInferior = mapFace(vestibularSrc);
        if (palatinoSrc) normalizedTooth.lingualInferior = mapFace(palatinoSrc);
      }

      out[toothKey] = normalizedTooth;
      continue;
    }

    // Front canonical blocks in English or Spanish
    const blocks = { ...toothVal };
    const tryBlocks = [BLOCKS_EN, BLOCKS_ES];
    for (const BLOCKS of tryBlocks) {
      for (const [bKey, meta] of Object.entries(BLOCKS)) {
        const blockObj = blocks[bKey];
        if (blockObj && typeof blockObj === 'object') {
          FACE_KEYS.forEach(face => {
            const arr = blockObj[face];
            if (Array.isArray(arr) || typeof arr !== 'undefined') {
              normalizedTooth[face][meta.key] = ensureArray3(arr, meta.min, meta.max);
            }
          });
        }
      }
    }

    out[toothKey] = normalizedTooth;
  }
  return out;
}

module.exports = {
  ensureArray3,
  normalizeFurcaInTooth,
  normalizeFurcaInTeeth,
  adaptTeethFromClientPayload,
  buildArcadasFromTeeth
};
