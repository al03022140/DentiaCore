/**
 * Tests de la lógica pura del runner de migraciones (sin BD):
 * descubrimiento/orden de archivos y cálculo de pendientes.
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const { discoverMigrationFiles, computePending } = require('../../scripts/migrate');

describe('migrate — discoverMigrationFiles', () => {
  test('encuentra NNNN-*.js ordenadas e ignora lo demás', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mig-'));
    fs.writeFileSync(path.join(dir, '0002-b.js'), 'module.exports = {};');
    fs.writeFileSync(path.join(dir, '0001-a.js'), 'module.exports = {};');
    fs.writeFileSync(path.join(dir, '0010-c.js'), 'module.exports = {};');
    fs.writeFileSync(path.join(dir, 'README.md'), '# no');
    fs.writeFileSync(path.join(dir, 'helper.js'), '// sin prefijo NNNN');
    try {
      const ids = discoverMigrationFiles(dir).map((m) => m.id);
      expect(ids).toEqual(['0001-a', '0002-b', '0010-c']);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  test('directorio inexistente → []', () => {
    expect(discoverMigrationFiles('/ruta/que/no/existe')).toEqual([]);
  });
});

describe('migrate — computePending', () => {
  const all = [{ id: '0001-a' }, { id: '0002-b' }, { id: '0003-c' }];

  test('filtra las ya aplicadas', () => {
    expect(computePending(all, new Set(['0001-a'])).map((m) => m.id)).toEqual(['0002-b', '0003-c']);
  });
  test('ninguna aplicada → todas pendientes', () => {
    expect(computePending(all, []).map((m) => m.id)).toEqual(['0001-a', '0002-b', '0003-c']);
  });
  test('todas aplicadas → vacío', () => {
    expect(computePending(all, new Set(['0001-a', '0002-b', '0003-c']))).toEqual([]);
  });
});
