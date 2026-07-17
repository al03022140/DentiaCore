/**
 * periodontogram-version-time — regresión del fix UTC (P3 auditoría):
 * los nombres ISO-compactos generados con toISOString() son UTC; parsearlos
 * como hora local corría todas las etiquetas por el offset (+6 h en México).
 */
import { parseVersionNameToTime, sortVersionsDesc, formatVersionLabel } from './periodontogram-version-time';

const fmtLocal = (t) => {
  const d = new Date(t);
  const p = (n) => String(n).padStart(2, '0');
  return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
};

test('nombre ISO-compacto con Z se parsea como UTC (fix del corrimiento de offset)', () => {
  // 2026-07-12T19:48:00.123Z → instante UTC exacto
  const expected = Date.UTC(2026, 6, 12, 19, 48, 0);
  expect(parseVersionNameToTime('20260712T194800123Z')).toBe(expected);
  // Variante con sufijo random del server
  expect(parseVersionNameToTime('20260712T194800123Z_ab12cd')).toBe(expected);
  // Variante legacy con prefijo
  expect(parseVersionNameToTime('v001_20250912T235822663Z')).toBe(Date.UTC(2025, 8, 12, 23, 58, 22));
});

test('la etiqueta renderiza el instante UTC en hora LOCAL', () => {
  const name = '20260712T194800123Z';
  const t = parseVersionNameToTime(name);
  expect(formatVersionLabel(name)).toBe(fmtLocal(t));
});

test('formatos legacy sin Z siguen siendo hora local', () => {
  expect(parseVersionNameToTime('12-07-2026_13-48-00'))
    .toBe(new Date(2026, 6, 12, 13, 48, 0).getTime());
  expect(parseVersionNameToTime('Archivado_2026-07-12_13-48-00'))
    .toBe(new Date(2026, 6, 12, 13, 48, 0).getTime());
  // Compacto SIN Z → local (no asumir UTC)
  expect(parseVersionNameToTime('20260712T134800'))
    .toBe(new Date(2026, 6, 12, 13, 48, 0).getTime());
});

test('nombres no parseables: NaN y etiqueta cruda', () => {
  expect(Number.isNaN(parseVersionNameToTime('v1'))).toBe(true);
  expect(formatVersionLabel('v1')).toBe('v1');
});

test('sortVersionsDesc: más nuevo primero, no parseables al final', () => {
  const sorted = sortVersionsDesc([
    'v1',
    '20260712T194800123Z',            // 19:48Z
    '20260712T204800123Z_suffix',     // 20:48Z (más nuevo)
    'Archivado_2020-01-01'
  ]);
  expect(sorted[0]).toBe('20260712T204800123Z_suffix');
  expect(sorted[1]).toBe('20260712T194800123Z');
  expect(sorted[sorted.length - 1]).toBe('v1');
});
