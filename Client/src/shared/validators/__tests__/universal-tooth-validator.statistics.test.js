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

  it('sums probing depth and gingival margin for clinical attachment level', () => {
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

    expect(stats.averageAttachmentLevel).toBeCloseTo(5.33, 2);
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

    // Only two valid sites should be considered: (3+1)=4 and (4-2)=2 -> average = 3
    expect(stats.averageAttachmentLevel).toBeCloseTo(3, 5);
  });
});
