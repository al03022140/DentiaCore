import { UniversalToothValidator } from '../universal-tooth-validator';

describe('UniversalToothValidator.calculateStatistics - attachment level', () => {
  const baseTooth = {
    absent: false,
    available: true,
    bleeding: {},
    plaque: {},
    suppuration: {}
  };

  it('defaults to 32 present teeth when no clinical data exists', () => {
    const stats = UniversalToothValidator.calculateStatistics({ teeth: {} });

    expect(stats.totalTeeth).toBe(32);
    expect(stats.presentTeeth).toBe(32);
    expect(stats.absentTeeth).toBe(0);
  });

  it('decrements present teeth only for explicit absences', () => {
    const stats = UniversalToothValidator.calculateStatistics({
      teeth: {
        11: { absent: true },
        21: { ausente: '1' },
        31: { presente: false },
        41: { disponible: false }
      }
    });

    expect(stats.presentTeeth).toBe(28);
    expect(stats.absentTeeth).toBe(4);
  });

  // NIC = PS − MG con margen FIRMADO (recesión negativa) — la convención del
  // código vivo (calculateStatistics). Las expectativas anteriores databan de
  // la fórmula vieja PS + MG y fallaban contra la implementación correcta.
  it('computes clinical attachment level as probing depth minus signed gingival margin', () => {
    const stats = UniversalToothValidator.calculateStatistics({
      teeth: {
        11: {
          ...baseTooth,
          probingDepth: {
            vestibularSuperior: [4, 5, 6]
          },
          gingivalMargin: {
            vestibularSuperior: [2, -1, 0]
          }
        }
      }
    });

    // (4−2) + (5−(−1)) + (6−0) = 2 + 6 + 6 = 14 → 14/3 ≈ 4.67
    expect(stats.averageAttachmentLevel).toBeCloseTo(4.67, 2);
  });

  it('ignores sentinel values when computing attachment level', () => {
    const stats = UniversalToothValidator.calculateStatistics({
      teeth: {
        21: {
          ...baseTooth,
          probingDepth: {
            vestibularSuperior: [3, 999, 4]
          },
          gingivalMargin: {
            vestibularSuperior: [1, 999, -2]
          }
        }
      }
    });

    // Only two valid sites should be considered: (3−1)=2 and (4−(−2))=6 -> average = 4
    expect(stats.averageAttachmentLevel).toBeCloseTo(4, 5);
  });

  it('treats all-zero face triples as unmeasured defaults, not real 0 mm readings', () => {
    const stats = UniversalToothValidator.calculateStatistics({
      teeth: {
        11: {
          ...baseTooth,
          probingDepth: {
            vestibularSuperior: [3, 3, 3],
            // Cara sin captura: el esquema rellena [0,0,0] por defecto.
            // No debe diluir los promedios como si fueran 0 mm reales.
            palatinoSuperior: [0, 0, 0]
          },
          gingivalMargin: {
            vestibularSuperior: [0, 0, 0],
            palatinoSuperior: [0, 0, 0]
          }
        }
      }
    });

    expect(stats.averageProbingDepth).toBeCloseTo(3, 5);
    // NIC sólo sobre la cara sondeada: margen 0 (unión amelocementaria) es
    // un valor válido cuando hay sondaje real → (3−0) en los 3 sitios.
    expect(stats.averageAttachmentLevel).toBeCloseTo(3, 5);
  });
});
