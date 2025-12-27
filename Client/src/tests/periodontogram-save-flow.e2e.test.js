/**
 * Prueba E2E-ish del flujo de guardado del periodontograma
 * - Simula datos de UI (4 caras, claves en inglés en métricas raíz)
 * - Calcula estadísticas con UniversalToothValidator
 * - Construye payload unificado (claves en español, 2 caras x 3 valores)
 * - Envía a PeriodontogramService.saveData (mock) y valida payload
 */

import PeriodontogramService from '../shared/services/periodontogram-service.js';
import { UniversalToothValidator } from '../shared/validators/universal-tooth-validator.js';
import { toTriple, pickFaceTriplesFromFourFaces, normalizeFaceObj } from '../shared/utils/periodontogram-helpers.js';

// Mock de servicio
jest.mock('../shared/services/periodontogram-service.js', () => ({
  __esModule: true,
  default: {
    saveData: jest.fn().mockResolvedValue({ ok: true }),
    getDataVersions: jest.fn().mockResolvedValue([])
  }
}));

// Helpers importados desde shared utils

const buildUnifiedPayload = (patientId, periodontogramData) => {
  const unifiedTeeth = {};
  Object.entries(periodontogramData.teeth || {}).forEach(([toothNumber, toothData]) => {
    const tNum = parseInt(toothNumber, 10);
    const isUpperTooth = !isNaN(tNum) && tNum >= 11 && tNum <= 28;
    const fieldMap = {
      plaque: 'placa',
      bleeding: 'sangrado',
      suppuration: 'supuracion',
      gingivalMargin: 'margenGingival',
      probingDepth: 'profundidadSondaje'
    };
    const metrics = {};
    Object.entries(fieldMap).forEach(([uiKey, esKey]) => {
      if (toothData && toothData[uiKey] && typeof toothData[uiKey] === 'object') {
        metrics[esKey] = pickFaceTriplesFromFourFaces(toothData[uiKey], isUpperTooth);
      }
    });

    let vestibular = {
      placa: metrics.placa?.vestibular ?? toTriple(toothData?.vestibular?.placa),
      sangrado: metrics.sangrado?.vestibular ?? toTriple(toothData?.vestibular?.sangrado),
      supuracion: metrics.supuracion?.vestibular ?? toTriple(toothData?.vestibular?.supuracion),
      margenGingival: metrics.margenGingival?.vestibular ?? toTriple(toothData?.vestibular?.margenGingival),
      profundidadSondaje: metrics.profundidadSondaje?.vestibular ?? toTriple(toothData?.vestibular?.profundidadSondaje)
    };

    let palatino = {
      placa: metrics.placa?.palatino ?? toTriple(toothData?.palatino?.placa || toothData?.lingual?.placa),
      sangrado: metrics.sangrado?.palatino ?? toTriple(toothData?.palatino?.sangrado || toothData?.lingual?.sangrado),
      supuracion: metrics.supuracion?.palatino ?? toTriple(toothData?.palatino?.supuracion || toothData?.lingual?.supuracion),
      margenGingival: metrics.margenGingival?.palatino ?? toTriple(toothData?.palatino?.margenGingival || toothData?.lingual?.margenGingival),
      profundidadSondaje: metrics.profundidadSondaje?.palatino ?? toTriple(toothData?.palatino?.profundidadSondaje || toothData?.lingual?.profundidadSondaje)
    };

    const movilidad = Number.isFinite(Number(toothData?.movilidad))
      ? Number(toothData.movilidad)
      : Number.isFinite(Number(toothData?.mobility)) ? Number(toothData.mobility) : 0;

    const anchuraEncia = Number.isFinite(Number(toothData?.anchuraEncia))
      ? Number(toothData.anchuraEncia)
      : Number.isFinite(Number(toothData?.gumWidth)) ? Number(toothData.gumWidth) : 0;

    const rawPron = toothData?.pronostico ?? toothData?.prognosis;
    const pronostico = rawPron ? (String(rawPron).charAt(0).toUpperCase() + String(rawPron).slice(1)) : 'Bueno';

    const ausente = Boolean(toothData?.ausente ?? toothData?.absent ?? false);
    const implante = Boolean(toothData?.implante ?? toothData?.implant ?? false);

    let furca = { vestibular: 0, lingual: 0, mesial: 0 };
    if (toothData?.furca && typeof toothData.furca === 'object') {
      const f = toothData.furca;
      if (typeof f.vestibular === 'number' || typeof f.lingual === 'number' || typeof f.mesial === 'number') {
        furca = {
          vestibular: Math.max(0, Math.min(3, parseInt(f.vestibular ?? 0))),
          lingual: Math.max(0, Math.min(3, parseInt((f.lingual ?? f.lingualPalatino) ?? 0))),
          mesial: Math.max(0, Math.min(3, parseInt(f.mesial ?? 0)))
        };
      } else if (typeof f.furca1 === 'number' || typeof f.furca2 === 'number') {
        const v1 = Math.max(0, Math.min(3, parseInt(f.furca1 ?? 0)));
        const v2 = Math.max(0, Math.min(3, parseInt(f.furca2 ?? 0)));
        furca = { vestibular: Math.max(v1, v2), lingual: Math.max(v1, v2), mesial: Math.max(v1, v2) };
      }
    } else if (typeof toothData?.furca === 'number') {
      const v = Math.max(0, Math.min(3, parseInt(toothData.furca)));
      furca = { vestibular: v, lingual: v, mesial: v };
    }

    unifiedTeeth[toothNumber] = {
      numeroDiente: tNum,
      ausente,
      implante,
      movilidad,
      anchuraEncia,
      furca,
      pronostico,
      vestibular: normalizeFaceObj(vestibular),
      palatino: normalizeFaceObj(palatino)
    };
  });

  const stats = UniversalToothValidator.calculateStatistics({ teeth: periodontogramData.teeth || {} });
  return {
    patientId,
    payload: {
      teeth: unifiedTeeth,
      statistics: stats,
      versionName: new Date().toISOString()
    }
  };
};

describe('Flujo de guardado del periodontograma', () => {
  test('mapea 4-caras (UI) a 2-caras (unificado) y conserva estadísticas', async () => {
    const patientId = 'patient-123';
    const periodontogramData = {
      teeth: {
        // Diente superior (11): usa VS/PS
        11: {
          bleeding: {
            vestibularSuperior: [0, 1, 2],
            palatinoSuperior: [3, 2, 1],
            vestibularInferior: [9, 9, 9],
            lingualInferior: [9, 9, 9]
          },
          suppuration: {
            vestibularSuperior: [1, 0, 1],
            palatinoSuperior: [0, 1, 0],
            vestibularInferior: [9, 9, 9],
            lingualInferior: [9, 9, 9]
          },
          plaque: {
            vestibularSuperior: [1, 0, 1],
            palatinoSuperior: [0, 1, 0],
            vestibularInferior: [9, 9, 9],
            lingualInferior: [9, 9, 9]
          },
          gingivalMargin: {
            vestibularSuperior: [0, -1, 2],
            palatinoSuperior: [1, 0, -2],
            vestibularInferior: [9, 9, 9],
            lingualInferior: [9, 9, 9]
          },
          probingDepth: {
            vestibularSuperior: [2, 3, 2],
            palatinoSuperior: [3, 3, 2],
            vestibularInferior: [9, 9, 9],
            lingualInferior: [9, 9, 9]
          },
          mobility: 1,
          gumWidth: 2,
          prognosis: 'reservado',
          furca: { vestibular: 1, lingual: 0, mesial: 2 },
          absent: false,
          implant: true
        },
        // Diente inferior (31): usa VI/LI
        31: {
          bleeding: {
            vestibularSuperior: [9, 9, 9],
            palatinoSuperior: [9, 9, 9],
            vestibularInferior: [2, 0, 1],
            lingualInferior: [1, 2, 0]
          },
          suppuration: {
            vestibularSuperior: [9, 9, 9],
            palatinoSuperior: [9, 9, 9],
            vestibularInferior: [1, 1, 0],
            lingualInferior: [0, 1, 1]
          },
          plaque: {
            vestibularSuperior: [9, 9, 9],
            palatinoSuperior: [9, 9, 9],
            vestibularInferior: [1, 1, 0],
            lingualInferior: [0, 1, 1]
          },
          gingivalMargin: {
            vestibularSuperior: [9, 9, 9],
            palatinoSuperior: [9, 9, 9],
            vestibularInferior: [-1, 0, 2],
            lingualInferior: [2, 1, 0]
          },
          probingDepth: {
            vestibularSuperior: [9, 9, 9],
            palatinoSuperior: [9, 9, 9],
            vestibularInferior: [3, 2, 2],
            lingualInferior: [2, 2, 3]
          },
          mobility: '2',
          gumWidth: '1',
          prognosis: 'bueno',
          furca: 2,
          absent: true,
          implant: false
        }
      }
    };

    const { patientId: pid, payload } = buildUnifiedPayload(patientId, periodontogramData);

    await PeriodontogramService.saveData(pid, payload);

    expect(PeriodontogramService.saveData).toHaveBeenCalledTimes(1);
    const [calledPatientId, calledPayload] = PeriodontogramService.saveData.mock.calls[0];

    expect(calledPatientId).toBe(patientId);

    // Validar mapeo del diente 11 (superior)
    const d11 = calledPayload.teeth['11'];
    expect(d11.numeroDiente).toBe(11);
  // bleeding/suppuration/gingivalMargin
  expect(d11.vestibular.sangrado).toEqual([0, 1, 2]);
  expect(d11.palatino.sangrado).toEqual([3, 2, 1]);
  expect(d11.vestibular.supuracion).toEqual([1, 0, 1]);
  expect(d11.palatino.supuracion).toEqual([0, 1, 0]);
  expect(d11.vestibular.margenGingival).toEqual([0, -1, 2]);
  expect(d11.palatino.margenGingival).toEqual([1, 0, -2]);
    expect(d11.vestibular.placa).toEqual([1, 0, 1]);
    expect(d11.palatino.placa).toEqual([0, 1, 0]);
    expect(d11.vestibular.profundidadSondaje).toEqual([2, 3, 2]);
    expect(d11.palatino.profundidadSondaje).toEqual([3, 3, 2]);
    expect(d11.implante).toBe(true);
    expect(d11.ausente).toBe(false);
    expect(d11.movilidad).toBe(1);
    expect(d11.anchuraEncia).toBe(2);
    expect(d11.pronostico).toBe('Reservado');
    expect(d11.furca).toEqual({ vestibular: 1, lingual: 0, mesial: 2 });

    // Validar mapeo del diente 31 (inferior)
    const d31 = calledPayload.teeth['31'];
    expect(d31.numeroDiente).toBe(31);
  // bleeding/suppuration/gingivalMargin
  expect(d31.vestibular.sangrado).toEqual([2, 0, 1]);
  expect(d31.palatino.sangrado).toEqual([1, 2, 0]);
  expect(d31.vestibular.supuracion).toEqual([1, 1, 0]);
  expect(d31.palatino.supuracion).toEqual([0, 1, 1]);
  expect(d31.vestibular.margenGingival).toEqual([-1, 0, 2]);
  expect(d31.palatino.margenGingival).toEqual([2, 1, 0]);
    expect(d31.vestibular.placa).toEqual([1, 1, 0]);
    expect(d31.palatino.placa).toEqual([0, 1, 1]);
    expect(d31.vestibular.profundidadSondaje).toEqual([3, 2, 2]);
    expect(d31.palatino.profundidadSondaje).toEqual([2, 2, 3]);
    expect(d31.implante).toBe(false);
    expect(d31.ausente).toBe(true);
    expect(d31.movilidad).toBe(2);
    expect(d31.anchuraEncia).toBe(1);
    expect(d31.pronostico).toBe('Bueno');
    expect(d31.furca).toEqual({ vestibular: 2, lingual: 2, mesial: 2 });

    // Estadísticas: se calculan desde forma UI; validamos presencia de claves del validador
    expect(calledPayload.statistics).toEqual(
      expect.objectContaining({
        plaquePercentage: expect.any(Number),
        bleedingPercentage: expect.any(Number),
        averageProbingDepth: expect.any(Number),
        totalTeeth: expect.any(Number)
      })
    );

    // versionName generado
    expect(typeof calledPayload.versionName).toBe('string');
  });

  test('no incluye caras incorrectas en payload: superiores no persisten caras inferiores y viceversa', async () => {
    const patientId = 'patient-456';
    const periodontogramData = {
      teeth: {
        // Diente superior: solo se deben tomar VS/PS
        12: {
          bleeding: {
            vestibularSuperior: [1, 1, 1],
            palatinoSuperior: [0, 0, 0],
            vestibularInferior: [7, 7, 7], // cara irrelevante para superior
            lingualInferior: [8, 8, 8]     // cara irrelevante para superior
          },
          probingDepth: {
            vestibularSuperior: [2, 2, 2],
            palatinoSuperior: [3, 3, 3],
            vestibularInferior: [9, 9, 9],
            lingualInferior: [9, 9, 9]
          }
        },
        // Diente inferior: solo se deben tomar VI/LI
        41: {
          bleeding: {
            vestibularSuperior: [6, 6, 6], // irrelevante para inferior
            palatinoSuperior: [5, 5, 5],   // irrelevante para inferior
            vestibularInferior: [1, 0, 1],
            lingualInferior: [0, 1, 0]
          },
          probingDepth: {
            vestibularSuperior: [9, 9, 9],
            palatinoSuperior: [9, 9, 9],
            vestibularInferior: [2, 3, 2],
            lingualInferior: [3, 2, 3]
          }
        }
      }
    };

    const { patientId: pid, payload } = (function build(patientId, data) {
      const unifiedTeeth = {};
      Object.entries(data.teeth || {}).forEach(([toothNumber, toothData]) => {
        const tNum = parseInt(toothNumber, 10);
        const isUpperTooth = !isNaN(tNum) && tNum >= 11 && tNum <= 28;
        const fieldMap = {
          bleeding: 'sangrado',
          probingDepth: 'profundidadSondaje'
        };
        const metrics = {};
        Object.entries(fieldMap).forEach(([uiKey, esKey]) => {
          if (toothData && toothData[uiKey] && typeof toothData[uiKey] === 'object') {
            metrics[esKey] = pickFaceTriplesFromFourFaces(toothData[uiKey], isUpperTooth);
          }
        });
        const vestibular = {
          sangrado: metrics.sangrado?.vestibular,
          profundidadSondaje: metrics.profundidadSondaje?.vestibular
        };
        const palatino = {
          sangrado: metrics.sangrado?.palatino,
          profundidadSondaje: metrics.profundidadSondaje?.palatino
        };
        unifiedTeeth[toothNumber] = {
          numeroDiente: tNum,
          vestibular,
          palatino
        };
      });
      return { patientId, payload: { teeth: unifiedTeeth, statistics: {}, versionName: 'test' } };
    })(patientId, periodontogramData);

    await PeriodontogramService.saveData(pid, payload);
    const [, calledPayload] = PeriodontogramService.saveData.mock.calls.pop();

    // Diente 12 (superior): las caras inferiores no deben afectar el payload
    expect(calledPayload.teeth['12'].vestibular.sangrado).toEqual([1, 1, 1]);
    expect(calledPayload.teeth['12'].palatino.sangrado).toEqual([0, 0, 0]);
    expect(calledPayload.teeth['12'].vestibular.profundidadSondaje).toEqual([2, 2, 2]);
    expect(calledPayload.teeth['12'].palatino.profundidadSondaje).toEqual([3, 3, 3]);

    // Diente 41 (inferior): las caras superiores no deben afectar el payload
    expect(calledPayload.teeth['41'].vestibular.sangrado).toEqual([1, 0, 1]);
    expect(calledPayload.teeth['41'].palatino.sangrado).toEqual([0, 1, 0]);
    expect(calledPayload.teeth['41'].vestibular.profundidadSondaje).toEqual([2, 3, 2]);
    expect(calledPayload.teeth['41'].palatino.profundidadSondaje).toEqual([3, 2, 3]);
  });
});
