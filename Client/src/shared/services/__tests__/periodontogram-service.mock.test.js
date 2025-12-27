// Prueba mínima del PeriodontogramService con API simulado
// Objetivo: validar flujo saveData -> getStatistics -> getData sin backend real

// Mock del módulo axios-instance.js ANTES de importar el servicio (CommonJS)
jest.mock('../axios-instance.js', () => ({
  __esModule: true,
  default: {
    get: jest.fn(),
    put: jest.fn()
  }
}));

const API = require('../axios-instance.js').default;
const PeriodontogramService = require('../periodontogram-service.js').default;

describe('PeriodontogramService (mocked API)', () => {
  const patientId = 'e2e-patient-mock-001';

  const periodontogramPayload = {
    versionName: 'test-e2e-' + new Date().toISOString().replace(/[:.-]/g, ''),
    statistics: {},
    teeth: {
      11: {
        bleeding: {
          vestibularSuperior: [1, 1, 0],
          palatinoSuperior: [0, 1, 0],
          vestibularInferior: [0, 0, 0],
          lingualInferior: [0, 0, 0]
        },
        suppuration: {
          vestibularSuperior: [0, 0, 0],
          palatinoSuperior: [0, 0, 0],
          vestibularInferior: [0, 0, 0],
          lingualInferior: [0, 0, 0]
        },
        plaque: {
          vestibularSuperior: [1, 1, 0],
          palatinoSuperior: [0, 1, 1],
          vestibularInferior: [0, 0, 0],
          lingualInferior: [0, 0, 0]
        },
        gingivalMargin: {
          vestibularSuperior: [-1, -2, -1],
          palatinoSuperior: [0, -1, 0],
          vestibularInferior: [0, 0, 0],
          lingualInferior: [0, 0, 0]
        },
        probingDepth: {
          vestibularSuperior: [3, 4, 3],
          palatinoSuperior: [2, 3, 2],
          vestibularInferior: [3, 3, 3],
          lingualInferior: [2, 2, 2]
        }
      }
    }
  };

  test('saveData -> getStatistics -> getData', async () => {
    const savedVersion = periodontogramPayload.versionName;

    // Stub API.put para guardar datos
    API.put.mockImplementation(async (url, body) => {
      expect(url).toBe(`/patients/${patientId}/periodontogram/data`);
      expect(body.versionName).toBe(savedVersion);
      return {
        data: {
          success: true,
          message: 'Periodontograma guardado con esquema unificado',
          version: savedVersion,
          statistics: { bleedingPercentage: 12, plaquePercentage: 22 }
        }
      };
    });

    // Stub API.get para estadísticas actuales
    API.get.mockImplementation(async (url) => {
      if (url === `/patients/${patientId}/periodontogram/statistics`) {
        return {
          data: {
            success: true,
            data: {
              patientId,
              versionName: savedVersion,
              statistics: { bleedingPercentage: 12, plaquePercentage: 22 },
              source: 'current'
            }
          }
        };
      }
      if (url === `/patients/${patientId}/periodontogram/data`) {
        return {
          data: {
            success: true,
            data: {
              patientId,
              versionName: savedVersion,
              source: 'current',
              teeth: periodontogramPayload.teeth,
              statistics: { bleedingPercentage: 12, plaquePercentage: 22 },
              arcadas: {},
              metadata: { createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }
            }
          }
        };
      }
      throw new Error('Unexpected URL: ' + url);
    });

    const saveRes = await PeriodontogramService.saveData(patientId, periodontogramPayload);
    expect(saveRes.success).toBe(true);
    expect(saveRes.version).toBe(savedVersion);

    const statsRes = await PeriodontogramService.getStatistics(patientId);
    expect(statsRes.success).toBe(true);
    expect(statsRes.data.versionName).toBe(savedVersion);
    expect(statsRes.data.statistics.bleedingPercentage).toBe(12);

    const dataRes = await PeriodontogramService.getData(patientId);
    expect(dataRes.patientId).toBe(patientId);
    expect(dataRes.versionName).toBe(savedVersion);
    expect(dataRes.teeth['11'].probingDepth.vestibularSuperior).toEqual([3, 4, 3]);
  });
});