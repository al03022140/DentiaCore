'use strict';

// Fixtures cross-runtime para periodontal-stats-core. Las requiere el test del
// cliente (babel-jest) y el del servidor (node/jest) para asegurar que ambos
// runtimes producen los MISMOS acumuladores con los mismos datos.

const baseTooth = { absent: false, available: true, bleeding: {}, plaque: {}, suppuration: {} };

module.exports = [
  {
    name: 'sin datos clínicos: 32 dientes presentes por defecto',
    input: { teeth: {} },
    expected: {
      presentTeeth: 32,
      teethWithClinicalData: 0,
      bleedingCount: 0,
      plaqueCount: 0,
      totalDepth: 0,
      depthCount: 0,
      totalAttachmentLevel: 0,
      attachmentLevelCount: 0,
      maxProbingDepth: 0,
    },
  },
  {
    name: 'solo decrementa presentes por ausencias explícitas (absent/ausente/presente/disponible)',
    input: {
      teeth: {
        11: { absent: true },
        21: { ausente: '1' },
        31: { presente: false },
        41: { disponible: false },
      },
    },
    expected: {
      presentTeeth: 28,
      teethWithClinicalData: 0,
      bleedingCount: 0,
      plaqueCount: 0,
      totalDepth: 0,
      depthCount: 0,
      totalAttachmentLevel: 0,
      attachmentLevelCount: 0,
      maxProbingDepth: 0,
    },
  },
  {
    name: 'NIC = PS − MG con margen firmado (forma canónica)',
    input: {
      teeth: {
        11: {
          ...baseTooth,
          probingDepth: { vestibularSuperior: [4, 5, 6] },
          gingivalMargin: { vestibularSuperior: [2, -1, 0] },
        },
      },
    },
    expected: {
      presentTeeth: 32,
      teethWithClinicalData: 1,
      bleedingCount: 0,
      plaqueCount: 0,
      totalDepth: 15,
      depthCount: 3,
      totalAttachmentLevel: 14, // 2 + 6 + 6
      attachmentLevelCount: 3,
      maxProbingDepth: 6,
    },
  },
  {
    name: 'ignora centinela 999 en PS y NIC',
    input: {
      teeth: {
        21: {
          ...baseTooth,
          probingDepth: { vestibularSuperior: [3, 999, 4] },
          gingivalMargin: { vestibularSuperior: [1, 999, -2] },
        },
      },
    },
    expected: {
      presentTeeth: 32,
      teethWithClinicalData: 1,
      bleedingCount: 0,
      plaqueCount: 0,
      totalDepth: 7,
      depthCount: 2,
      totalAttachmentLevel: 8, // (3−1) + (4−(−2))
      attachmentLevelCount: 2,
      maxProbingDepth: 4,
    },
  },
  {
    name: 'tripletas [0,0,0] = no medidas, no 0 mm reales',
    input: {
      teeth: {
        11: {
          ...baseTooth,
          probingDepth: { vestibularSuperior: [3, 3, 3], palatinoSuperior: [0, 0, 0] },
          gingivalMargin: { vestibularSuperior: [0, 0, 0], palatinoSuperior: [0, 0, 0] },
        },
      },
    },
    expected: {
      presentTeeth: 32,
      teethWithClinicalData: 1,
      bleedingCount: 0,
      plaqueCount: 0,
      totalDepth: 9,
      depthCount: 3,
      totalAttachmentLevel: 9,
      attachmentLevelCount: 3,
      maxProbingDepth: 3,
    },
  },
  {
    name: 'legacy español-por-cara (toothData.vestibularSuperior = {sangrado,...})',
    input: {
      teeth: {
        16: {
          vestibularSuperior: {
            sangrado: [1, 0, 1],
            placa: [1, 1, 1],
            profundidadSondaje: [4, 4, 4],
            margenGingival: [1, 1, 1],
          },
        },
      },
    },
    expected: {
      presentTeeth: 32,
      teethWithClinicalData: 1,
      bleedingCount: 2,
      plaqueCount: 3,
      totalDepth: 12,
      depthCount: 3,
      totalAttachmentLevel: 9, // (4−1)×3
      attachmentLevelCount: 3,
      maxProbingDepth: 4,
    },
  },
  {
    name: 'legacy array plano de 6 sitios (probingDepth/gingivalMargin)',
    input: {
      teeth: {
        36: {
          probingDepth: [3, 3, 3, 5, 5, 5],
          gingivalMargin: [0, 0, 0, 1, 1, 1],
        },
      },
    },
    expected: {
      presentTeeth: 32,
      teethWithClinicalData: 1,
      bleedingCount: 0,
      plaqueCount: 0,
      totalDepth: 24, // 9 + 15
      depthCount: 6,
      totalAttachmentLevel: 21, // (3−0)×3 + (5−1)×3
      attachmentLevelCount: 6,
      maxProbingDepth: 5,
    },
  },
  {
    name: 'legacy vestibular/palatino sueltos',
    input: {
      teeth: {
        26: {
          vestibular: { sangrado: [1, 1, 0], placa: [0, 0, 0], profundidadSondaje: [4, 4, 4], margenGingival: [1, 1, 1] },
          palatino: { profundidadSondaje: [3, 3, 3], margenGingival: [0, 0, 0] },
        },
      },
    },
    expected: {
      presentTeeth: 32,
      teethWithClinicalData: 1,
      bleedingCount: 2,
      plaqueCount: 0,
      totalDepth: 21, // 12 + 9
      depthCount: 6,
      totalAttachmentLevel: 18, // (4−1)×3 + (3−0)×3
      attachmentLevelCount: 6,
      maxProbingDepth: 4,
    },
  },
  {
    // M3: `palatino` mal etiquetado en un diente INFERIOR (46) → debe contarse
    // en lingualInferior (cara propia), no perderse. Antes iba a palatinoSuperior
    // y facesForTooth lo filtraba (todo quedaba en 0).
    name: 'legacy palatino en diente inferior se cuenta como lingual',
    input: {
      teeth: {
        46: {
          palatino: { sangrado: [1, 1, 1], profundidadSondaje: [5, 5, 5], margenGingival: [1, 1, 1] },
        },
      },
    },
    expected: {
      presentTeeth: 32,
      teethWithClinicalData: 1,
      bleedingCount: 3,
      plaqueCount: 0,
      totalDepth: 15,
      depthCount: 3,
      totalAttachmentLevel: 12, // (5−1)×3
      attachmentLevelCount: 3,
      maxProbingDepth: 5,
    },
  },
  {
    // M3: `lingual` mal etiquetado en un diente SUPERIOR (16) → debe contarse en
    // palatinoSuperior (cara propia), no perderse.
    name: 'legacy lingual en diente superior se cuenta como palatino',
    input: {
      teeth: {
        16: {
          lingual: { sangrado: [1, 0, 1], profundidadSondaje: [4, 4, 4], margenGingival: [2, 2, 2] },
        },
      },
    },
    expected: {
      presentTeeth: 32,
      teethWithClinicalData: 1,
      bleedingCount: 2,
      plaqueCount: 0,
      totalDepth: 12,
      depthCount: 3,
      totalAttachmentLevel: 6, // (4−2)×3
      attachmentLevelCount: 3,
      maxProbingDepth: 4,
    },
  },
];
