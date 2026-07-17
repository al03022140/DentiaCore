const { computePeriodontalStatistics } = require('../../Client/src/shared/stats/periodontal-stats-core.cjs');
const fixtures = require('../../Client/src/shared/stats/__tests__/stats-core-fixtures.cjs');

// Cross-check de runtimes: el servidor (node/jest) debe producir EXACTAMENTE los
// mismos acumuladores que el cliente (babel-jest) con las mismas fixtures.
describe('periodontal-stats-core (servidor) — acumuladores crudos', () => {
  fixtures.forEach(({ name, input, expected }) => {
    test(name, () => {
      expect(computePeriodontalStatistics(input)).toEqual(expected);
    });
  });
});
