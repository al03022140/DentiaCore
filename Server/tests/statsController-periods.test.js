const { _internal } = require('../controllers/statsController');
const { buildPeriodLabels, isoWeekString, parseDateRange } = _internal;

// Guarda las correcciones H1 (año de la semana ISO) y H3 (última semana parcial)
// sin necesidad de Mongo: son funciones puras. Si vuelven a romperse, los charts
// semanales pierden datos en silencio cerca de bordes de año / semanas parciales.

describe('isoWeekString — año de la semana ISO (H1)', () => {
  // Casos clásicos de la norma ISO-8601 (semana pertenece al año de su jueves).
  test.each([
    ['2005-01-01', '2004-W53'], // sábado → semana 53 de 2004
    ['2007-01-01', '2007-W01'], // lunes → semana 1 de 2007
    ['2027-01-01', '2026-W53'], // viernes → jueves cae el 2026-12-31 → 2026-W53
    ['2026-01-01', '2026-W01'], // jueves → semana 1 de 2026
  ])('%s → %s', (iso, expected) => {
    const [y, m, d] = iso.split('-').map(Number);
    expect(isoWeekString(new Date(y, m - 1, d))).toBe(expected);
  });

  test('el año calendario y el año de la semana ISO difieren en el borde (por eso %G y no %Y)', () => {
    const label = isoWeekString(new Date(2027, 0, 1));
    expect(label.startsWith('2027')).toBe(false); // %Y daría "2027-W53"; ISO da 2026
    expect(label).toBe('2026-W53');
  });
});

describe('buildPeriodLabels semanal', () => {
  test('incluye la ÚLTIMA semana parcial aunque start/end caigan en días distintos (H3)', () => {
    const start = new Date(2026, 0, 7);  // miércoles
    const end = new Date(2026, 1, 2);    // lunes, en 2026-W06
    const labels = buildPeriodLabels(start, end, 'week');

    // La semana del end debe estar; antes el cursor (+7 desde el miércoles)
    // saltaba por encima y W06 nunca se emitía.
    expect(labels).toContain(isoWeekString(end));
    expect(labels[labels.length - 1]).toBe(isoWeekString(end));
    expect(new Set(labels).size).toBe(labels.length); // sin duplicados
  });

  test('cruza el borde de año usando el año de la semana ISO (H1)', () => {
    const start = new Date(2026, 11, 28); // lunes 2026-W53
    const end = new Date(2027, 0, 3);     // domingo, misma semana ISO
    const labels = buildPeriodLabels(start, end, 'week');

    // Un movimiento del 2027-01-01 se agrupa (Mongo %G-W%V) como "2026-W53";
    // ese label DEBE existir o el dato desaparece.
    expect(labels).toContain('2026-W53');
    expect(labels).toContain(isoWeekString(new Date(2027, 0, 1)));
  });
});

describe('parseDateRange — robustez', () => {
  test('un `to` inválido cae al default en vez de producir fechas NaN', () => {
    const { start, end } = parseDateRange(undefined, 'no-es-fecha', 'month');
    expect(Number.isNaN(start.getTime())).toBe(false);
    expect(Number.isNaN(end.getTime())).toBe(false);
    expect(start <= end).toBe(true);
  });
});
