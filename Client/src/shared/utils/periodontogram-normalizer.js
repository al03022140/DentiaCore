import { validatePeriodontogramData, CANONICAL_FACE_KEYS } from '../schemas/unified-periodontogram-schema.js';
import { UniversalToothValidator } from '../validators/universal-tooth-validator.js';

const DEFAULT_FACE_ARRAY = [0, 0, 0];
const MEASUREMENT_MAPPING = [
  { canonical: 'placa', english: 'plaque' },
  { canonical: 'sangrado', english: 'bleeding' },
  { canonical: 'supuracion', english: 'suppuration' },
  { canonical: 'margenGingival', english: 'gingivalMargin' },
  { canonical: 'profundidadSondaje', english: 'probingDepth' }
];

const cloneFace = (sourceFace = {}) => ({
  placa: [...(sourceFace.placa || DEFAULT_FACE_ARRAY)],
  sangrado: [...(sourceFace.sangrado || DEFAULT_FACE_ARRAY)],
  supuracion: [...(sourceFace.supuracion || DEFAULT_FACE_ARRAY)],
  margenGingival: [...(sourceFace.margenGingival || DEFAULT_FACE_ARRAY)],
  profundidadSondaje: [...(sourceFace.profundidadSondaje || DEFAULT_FACE_ARRAY)]
});

const extractTeethFromPayload = (data) => {
  if (!data || typeof data !== 'object') {
    return {};
  }

  if (data.teeth && typeof data.teeth === 'object') {
    return data.teeth;
  }

  if (data.teethMap && typeof data.teethMap === 'object') {
    return data.teethMap;
  }

  const numericEntries = Object.entries(data).filter(([key, value]) => (/^[0-9]+$/).test(key) && value && typeof value === 'object');
  if (numericEntries.length === 0) {
    return {};
  }

  return numericEntries.reduce((acc, [key, value]) => {
    acc[key] = value;
    return acc;
  }, {});
};

const buildFallbackPayload = (backendData = {}) => ({
  teeth: {},
  statistics: {},
  versionName: backendData.versionName || backendData.version || null,
  metadata: {
    version: backendData.version || null,
    createdAt: backendData.fechaCreacion || new Date().toISOString(),
    lastModified: backendData.fechaModificacion || new Date().toISOString(),
    source: 'normalizer_fallback'
  }
});

export const normalizeBackendPeriodontogram = (backendData = {}, { patientId = null, computeStatistics = true } = {}) => {
  try {
    const teethPayload = extractTeethFromPayload(backendData);

    const sanitized = validatePeriodontogramData({
      pacienteId: backendData.pacienteId || patientId,
      teeth: teethPayload,
      statistics: backendData.statistics,
      version: backendData.version || backendData.versionName,
      fechaCreacion: backendData.fechaCreacion,
      fechaModificacion: backendData.fechaModificacion
    });

    const frontendData = {
      teeth: {},
      statistics: sanitized.statistics || {},
      versionName: backendData.versionName || sanitized.version || null,
      metadata: {
        version: sanitized.version || backendData.version || null,
        createdAt: sanitized.fechaCreacion || backendData.fechaCreacion || new Date().toISOString(),
        lastModified: sanitized.fechaModificacion || backendData.fechaModificacion || new Date().toISOString(),
        source: 'normalizer'
      }
    };

    Object.entries(sanitized.teeth || {}).forEach(([toothNumber, canonicalTooth]) => {
      if (!canonicalTooth || typeof canonicalTooth !== 'object') {
        return;
      }

      const numericToothNumber = Number.parseInt(toothNumber, 10);
      if (!Number.isFinite(numericToothNumber)) {
        return;
      }

      if (typeof UniversalToothValidator.isValidToothNumber === 'function'
        && !UniversalToothValidator.isValidToothNumber(numericToothNumber)) {
        return;
      }

      const faceMap = {};
      CANONICAL_FACE_KEYS.forEach((faceKey) => {
        faceMap[faceKey] = cloneFace(canonicalTooth[faceKey]);
      });

      const toothEntry = {
        numeroDiente: canonicalTooth.numeroDiente ?? numericToothNumber,
        toothNumber: numericToothNumber,
        arcada: canonicalTooth.arcada,
        ausente: Boolean(canonicalTooth.ausente),
        absent: Boolean(canonicalTooth.ausente),
        available: !canonicalTooth.ausente,
        implante: Boolean(canonicalTooth.implante),
        implant: Boolean(canonicalTooth.implante),
        movilidad: canonicalTooth.movilidad ?? 0,
        mobility: canonicalTooth.movilidad ?? 0,
        anchuraEncia: canonicalTooth.anchuraEncia ?? 0,
        gumWidth: canonicalTooth.anchuraEncia ?? 0,
        pronostico: (canonicalTooth.pronostico || 'bueno').toLowerCase(),
        prognosis: (canonicalTooth.pronostico || 'bueno').toLowerCase(),
        fechaUltimaModificacion: canonicalTooth.fechaUltimaModificacion || sanitized.fechaModificacion || new Date().toISOString()
      };

      CANONICAL_FACE_KEYS.forEach((faceKey) => {
        toothEntry[faceKey] = faceMap[faceKey];
      });

      MEASUREMENT_MAPPING.forEach(({ canonical, english }) => {
        const measurementFaces = {};
        CANONICAL_FACE_KEYS.forEach((faceKey) => {
          measurementFaces[faceKey] = faceMap[faceKey][canonical];
        });
        toothEntry[canonical] = measurementFaces;
        toothEntry[english] = measurementFaces;
      });

      const furcaSource = canonicalTooth.furca || {};
      const furcaVestibular = Number.isFinite(furcaSource.vestibular) ? furcaSource.vestibular : 0;
      const furcaLingual = Number.isFinite(furcaSource.lingualPalatino)
        ? furcaSource.lingualPalatino
        : furcaVestibular;
      const furca1 = Number.isFinite(furcaSource.doble?.furca1)
        ? furcaSource.doble.furca1
        : furcaVestibular;
      const furca2 = Number.isFinite(furcaSource.doble?.furca2)
        ? furcaSource.doble.furca2
        : furcaLingual;

      toothEntry.furca = {
        vestibular: furcaVestibular,
        lingualPalatino: furcaLingual,
        furca1,
        furca2,
        doble: {
          furca1,
          furca2
        }
      };

      frontendData.teeth[toothNumber] = toothEntry;
    });

    const hasBackendStats = backendData?.statistics && typeof backendData.statistics === 'object';
    if (computeStatistics && typeof UniversalToothValidator.calculateStatistics === 'function') {
      frontendData.statistics = UniversalToothValidator.calculateStatistics({ teeth: frontendData.teeth });
    } else if (hasBackendStats) {
      frontendData.statistics = backendData.statistics;
    }

    return frontendData;
  } catch (error) {
    console.error('Error normalizando datos del periodontograma', error, backendData);
    return buildFallbackPayload(backendData);
  }
};

export default {
  normalizeBackendPeriodontogram
};
