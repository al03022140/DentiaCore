'use strict';

// Núcleo único de cálculo de estadísticas periodontales — fuente de verdad
// compartida por el validador del cliente (ESM) y el del servidor (CJS).
//
// Se autora en CommonJS sin imports y sin `import.meta` para que lo pueda
// `require()` el servidor (sin transpilación) y lo importe el cliente vía Vite /
// babel-jest (interop CJS->ESM). No depende de config, crypto, logger ni DOM.
//
// Convención clínica (la del cliente, adoptada como canónica):
//   - Una cara con tripleta [0,0,0] se considera NO medida, no "0 mm reales".
//   - Denominador de %SS/%placa = dientesConDatosClínicos * 6 (2 caras × 3 sitios).
//   - NIC = PS − MG con margen firmado (recesión negativa).
//   - 999 es centinela y se ignora.
//
// Devuelve SOLO acumuladores crudos; cada lado les da su forma de salida.

const PERMANENT_TEETH = [
  11, 12, 13, 14, 15, 16, 17, 18,
  21, 22, 23, 24, 25, 26, 27, 28,
  31, 32, 33, 34, 35, 36, 37, 38,
  41, 42, 43, 44, 45, 46, 47, 48,
];

const CANON_FACES = ['vestibularSuperior', 'palatinoSuperior', 'vestibularInferior', 'lingualInferior'];

function parseBoolean(value) {
  if (value === undefined || value === null) return null;
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value !== 0;
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (['true', '1', 'yes', 'si', 'sí'].includes(normalized)) return true;
    if (['false', '0', 'no'].includes(normalized)) return false;
  }
  return null;
}

const isUnmeasuredTriple = (arr) =>
  Array.isArray(arr) &&
  arr.every((value) => {
    const n = parseFloat(value);
    return isNaN(n) || n === 0;
  });

function inferArcada(toothData, toothNumber) {
  if (toothData && typeof toothData.arcada === 'string') return toothData.arcada.toLowerCase();
  const n = Number(toothNumber);
  return Number.isFinite(n) && n >= 11 && n <= 28 ? 'superior' : 'inferior';
}

// Pliega cualquiera de las formas de entrada a bloques canónicos
// { bleeding, plaque, probingDepth, gingivalMargin } cada uno keyed por las 4
// caras canónicas. Cubre: forma canónica (bloques en inglés o español por
// cara), español-por-cara (toothData.vestibularSuperior = {sangrado,...}) y
// legacy (vestibular/palatino/lingual sueltos + arrays planos de 6).
// ponytail: el mapeo legacy es best-effort para documentos viejos del servidor
//   (el cliente nunca recibe esas formas). Si aparece una 4ª forma, normalízala
//   aquí, no en los dos validadores.
function normalizeToCanonicalBlocks(toothData, toothNumber) {
  const blocks = { bleeding: {}, plaque: {}, probingDepth: {}, gingivalMargin: {} };
  if (!toothData || typeof toothData !== 'object') return blocks;

  const blockAliases = {
    bleeding: ['bleeding', 'sangrado'],
    plaque: ['plaque', 'placa'],
    probingDepth: ['probingDepth', 'profundidadSondaje'],
    gingivalMargin: ['gingivalMargin', 'margenGingival'],
  };

  const arcada = inferArcada(toothData, toothNumber);
  // El diente superior tiene cara palatina; el inferior, lingual. Un bloque
  // legacy mal etiquetado (lingual en un superior, palatino en un inferior) se
  // mapea a la cara NO-vestibular de la propia arcada. Antes iba a la cara de la
  // OTRA arcada y luego `facesForTooth` la filtraba → esas mediciones no se
  // contaban para ninguna cara. Orden de iteración: el nombre anatómicamente
  // correcto se asigna primero y gana si vienen ambos. M3.
  const legacyFaceMap = arcada === 'superior'
    ? { vestibular: 'vestibularSuperior', palatino: 'palatinoSuperior', lingual: 'palatinoSuperior' }
    : { vestibular: 'vestibularInferior', lingual: 'lingualInferior', palatino: 'lingualInferior' };

  // Forma canónica: bloque-por-medición keyed por cara canónica.
  for (const [canon, aliases] of Object.entries(blockAliases)) {
    for (const alias of aliases) {
      const block = toothData[alias];
      if (block && typeof block === 'object' && !Array.isArray(block)) {
        for (const face of CANON_FACES) {
          if (Array.isArray(block[face])) blocks[canon][face] = block[face];
        }
      } else if (Array.isArray(block) && (canon === 'probingDepth' || canon === 'gingivalMargin')) {
        // Legacy: array plano de 6 → [0..3) vestibular, [3..6) palatino/lingual.
        const v = arcada === 'superior' ? 'vestibularSuperior' : 'vestibularInferior';
        const p = arcada === 'superior' ? 'palatinoSuperior' : 'lingualInferior';
        if (block.length && blocks[canon][v] === undefined) blocks[canon][v] = block.slice(0, 3);
        if (block.length > 3 && blocks[canon][p] === undefined) blocks[canon][p] = block.slice(3, 6);
      }
    }
  }

  // Español-por-cara: toothData[face] = { sangrado, placa, profundidadSondaje, margenGingival }.
  for (const face of CANON_FACES) {
    const f = toothData[face];
    if (!f || typeof f !== 'object') continue;
    if (blocks.bleeding[face] === undefined && Array.isArray(f.sangrado ?? f.bleeding)) blocks.bleeding[face] = f.sangrado ?? f.bleeding;
    if (blocks.plaque[face] === undefined && Array.isArray(f.placa ?? f.plaque)) blocks.plaque[face] = f.placa ?? f.plaque;
    if (blocks.probingDepth[face] === undefined && Array.isArray(f.profundidadSondaje ?? f.probingDepth)) blocks.probingDepth[face] = f.profundidadSondaje ?? f.probingDepth;
    if (blocks.gingivalMargin[face] === undefined && Array.isArray(f.margenGingival ?? f.gingivalMargin)) blocks.gingivalMargin[face] = f.margenGingival ?? f.gingivalMargin;
  }

  // Legacy: vestibular/palatino/lingual sueltos con arrays de medición dentro.
  for (const [legacyKey, canonFace] of Object.entries(legacyFaceMap)) {
    const f = toothData[legacyKey];
    if (!f || typeof f !== 'object' || Array.isArray(f)) continue;
    if (blocks.bleeding[canonFace] === undefined && Array.isArray(f.sangrado ?? f.bleeding)) blocks.bleeding[canonFace] = f.sangrado ?? f.bleeding;
    if (blocks.plaque[canonFace] === undefined && Array.isArray(f.placa ?? f.plaque)) blocks.plaque[canonFace] = f.placa ?? f.plaque;
    if (blocks.probingDepth[canonFace] === undefined && Array.isArray(f.profundidadSondaje ?? f.probingDepth)) blocks.probingDepth[canonFace] = f.profundidadSondaje ?? f.probingDepth;
    if (blocks.gingivalMargin[canonFace] === undefined && Array.isArray(f.margenGingival ?? f.gingivalMargin)) blocks.gingivalMargin[canonFace] = f.margenGingival ?? f.gingivalMargin;
  }

  return blocks;
}

/**
 * Calcula los acumuladores crudos de estadísticas periodontales.
 * @param {Object} periodontogramData - { teeth: { [num]: toothData } }
 * @returns {{presentTeeth:number, teethWithClinicalData:number, bleedingCount:number,
 *   plaqueCount:number, totalDepth:number, depthCount:number, totalAttachmentLevel:number,
 *   attachmentLevelCount:number, maxProbingDepth:number}}
 */
function computePeriodontalStatistics(periodontogramData) {
  const teeth = (periodontogramData && periodontogramData.teeth) || {};

  let presentTeeth = 0;
  let teethWithClinicalData = 0;
  let bleedingCount = 0;
  let plaqueCount = 0;
  let totalDepth = 0;
  let depthCount = 0;
  let totalAttachmentLevel = 0;
  let attachmentLevelCount = 0;
  let maxProbingDepth = 0;

  for (const toothNumber of PERMANENT_TEETH) {
    const toothData = teeth[toothNumber];
    const hasToothData = toothData && typeof toothData === 'object';

    const absentValue = hasToothData ? parseBoolean(toothData.absent ?? toothData.ausente) : null;
    const presentValue = hasToothData ? parseBoolean(toothData.present ?? toothData.presente) : null;
    const availableValue = hasToothData ? parseBoolean(toothData.available ?? toothData.disponible) : null;

    const isToothPresent = !(absentValue === true || presentValue === false || availableValue === false);
    if (!isToothPresent) continue;

    presentTeeth++;
    if (!hasToothData) continue;
    teethWithClinicalData++;

    const blocks = normalizeToCanonicalBlocks(toothData, toothNumber);

    // Solo las 2 caras de la arcada del diente (denominador = 2 caras × 3 sitios).
    const arcada = inferArcada(toothData, toothNumber);
    const facesForTooth = arcada === 'superior'
      ? CANON_FACES.filter((f) => f.endsWith('Superior'))
      : CANON_FACES.filter((f) => f.endsWith('Inferior'));

    for (const faceKey of facesForTooth) {
      const bleed = blocks.bleeding[faceKey];
      if (Array.isArray(bleed)) {
        for (const value of bleed) {
          if ((typeof value === 'number' && value > 0) || value === true || value === 1) bleedingCount++;
        }
      }

      const plaque = blocks.plaque[faceKey];
      if (Array.isArray(plaque)) {
        for (const value of plaque) {
          if ((typeof value === 'number' && value > 0) || value === true || value === 1) plaqueCount++;
        }
      }

      const depthArr = blocks.probingDepth[faceKey];
      if (Array.isArray(depthArr) && !isUnmeasuredTriple(depthArr)) {
        for (const depth of depthArr) {
          const numDepth = parseFloat(depth);
          if (!isNaN(numDepth) && numDepth !== 999) {
            totalDepth += numDepth;
            depthCount++;
            if (numDepth > maxProbingDepth) maxProbingDepth = numDepth;
          }
        }
      }

      const marginArr = blocks.gingivalMargin[faceKey];
      if (Array.isArray(depthArr) && Array.isArray(marginArr) && !isUnmeasuredTriple(depthArr)) {
        for (let i = 0; i < Math.min(depthArr.length, marginArr.length); i++) {
          const depth = parseFloat(depthArr[i]);
          const margin = parseFloat(marginArr[i]);
          if (!isNaN(depth) && !isNaN(margin) && depth !== 999 && margin !== 999) {
            totalAttachmentLevel += depth - margin;
            attachmentLevelCount++;
          }
        }
      }
    }
  }

  return {
    presentTeeth,
    teethWithClinicalData,
    bleedingCount,
    plaqueCount,
    totalDepth,
    depthCount,
    totalAttachmentLevel,
    attachmentLevelCount,
    maxProbingDepth,
  };
}

module.exports = { computePeriodontalStatistics, PERMANENT_TEETH, CANON_FACES };
