// Utilidades compartidas para normalización/mapeo de periodontograma

/**
 * Asegura un array [a,b,c] numérico de longitud 3.
 */
export const toTriple = (arr) => {
  if (!Array.isArray(arr)) return [0, 0, 0];
  return [0, 1, 2].map(i => {
    const v = Number(arr[i] ?? 0);
    return Number.isFinite(v) ? v : 0;
  });
};

/**
 * A partir de la estructura UI de 4 caras, devuelve pares vestibular/palatino
 * basados en si el diente es superior o inferior.
 */
export const pickFaceTriplesFromFourFaces = (metricObj, isUpperTooth) => {
  if (!metricObj || typeof metricObj !== 'object' || Array.isArray(metricObj)) {
    return { vestibular: [0, 0, 0], palatino: [0, 0, 0] };
  }
  const VS = metricObj.vestibularSuperior;
  const PS = metricObj.palatinoSuperior;
  const VI = metricObj.vestibularInferior;
  const LI = metricObj.lingualInferior;
  // P7: convertir a triple SOLO las caras presentes. Una cara ausente devuelve
  // undefined (no [0,0,0]) para que la cadena de respaldo con `??` en
  // periodontogram-section continúe hacia otras fuentes (claves canónicas /
  // legacy) en lugar de cortarse y persistir ceros que pisan datos reales.
  // (El input completamente inválido sigue devolviendo ceros, arriba.)
  const tripleOrUndef = (v) => (v == null ? undefined : toTriple(v));
  const vestibular = isUpperTooth ? tripleOrUndef(VS) : tripleOrUndef(VI);
  const palatino = isUpperTooth ? tripleOrUndef(PS) : tripleOrUndef(LI);
  return { vestibular, palatino };
};

/**
 * Normaliza una cara completa con las métricas esperadas en esquema unificado.
 */
export const normalizeFaceObj = (face) => {
  if (!face || typeof face !== 'object') return undefined;
  return {
    placa: toTriple(face.placa),
    sangrado: toTriple(face.sangrado),
    supuracion: toTriple(face.supuracion),
    margenGingival: toTriple(face.margenGingival),
    profundidadSondaje: toTriple(face.profundidadSondaje)
  };
};

export default {
  toTriple,
  pickFaceTriplesFromFourFaces,
  normalizeFaceObj
};
