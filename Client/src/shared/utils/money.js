/**
 * Formato monetario centralizado.
 *
 * Antes había seis formateadores distintos esparcidos por la UI (es-CO/COP en
 * el dashboard, es-MX/MXN en ficha del paciente, `.toLocaleString()` sin
 * moneda en otros lados). La moneda configurada en Settings → Caja se
 * ignoraba por completo. Este módulo centraliza el formato y los componentes
 * leen la moneda desde el cache de `settingsService`.
 *
 * `formatMoney(amount)` usa la moneda activa (sync) — adecuado para render.
 * `setActiveCurrency(code)` se llama una vez al boot y cada vez que el
 * usuario guarda Settings, para mantener el cache alineado.
 */

const CURRENCY_LOCALES = {
  MXN: 'es-MX',
  USD: 'en-US',
  EUR: 'de-DE',
  COP: 'es-CO',
  ARS: 'es-AR',
  CLP: 'es-CL',
  PEN: 'es-PE'
};

const DEFAULT_CURRENCY = 'MXN';
let activeCurrency = DEFAULT_CURRENCY;

/** Define la moneda activa para subsiguientes formatMoney(). */
export const setActiveCurrency = (code) => {
  if (typeof code !== 'string') return;
  const upper = code.trim().toUpperCase();
  if (CURRENCY_LOCALES[upper]) {
    activeCurrency = upper;
  }
};

/** Lee la moneda activa (útil para tests / debug). */
export const getActiveCurrency = () => activeCurrency;

/**
 * Formatea un monto en la moneda activa. Acepta number, string numérico o
 * null/undefined (devuelve "0"). Para totales sin decimales (montos enteros)
 * se omiten los .00 para mantener la UI compacta.
 *
 * @param {number|string|null|undefined} amount
 * @param {object} [opts]
 * @param {string} [opts.currency] — override puntual (no cambia la activa).
 * @param {boolean} [opts.showDecimals=true] — fuerza/oculta .00.
 */
export const formatMoney = (amount, opts = {}) => {
  const n = typeof amount === 'number' ? amount : Number(amount);
  const safe = Number.isFinite(n) ? n : 0;
  const currency = (opts.currency || activeCurrency || DEFAULT_CURRENCY).toUpperCase();
  const locale = CURRENCY_LOCALES[currency] || 'es-MX';

  const showDecimals = opts.showDecimals !== false;
  const fractionDigits = showDecimals && !Number.isInteger(safe) ? 2 : 0;

  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency,
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: 2
  }).format(safe);
};

/**
 * Variante "plana" sin símbolo de moneda — útil dentro de un placeholder o
 * cuando el símbolo ya está fuera del componente. Mantiene el locale activo.
 */
export const formatAmount = (amount) => {
  const n = typeof amount === 'number' ? amount : Number(amount);
  const safe = Number.isFinite(n) ? n : 0;
  const locale = CURRENCY_LOCALES[activeCurrency] || 'es-MX';
  return new Intl.NumberFormat(locale, {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2
  }).format(safe);
};
