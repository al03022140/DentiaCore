import { computePeriodontalStatistics } from '../periodontal-stats-core.cjs';
import fixtures from './stats-core-fixtures.cjs';

describe('periodontal-stats-core (cliente) — acumuladores crudos', () => {
  fixtures.forEach(({ name, input, expected }) => {
    it(name, () => {
      expect(computePeriodontalStatistics(input)).toEqual(expected);
    });
  });
});
