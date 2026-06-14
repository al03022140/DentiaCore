/**
 * Helpers para nombres de versión (versionName) compartidos entre el
 * periodontograma y el odontograma clínico. Ambos usan el mismo esquema de
 * nombres (ISO compacto + sufijo), por lo que estos parsers/formatters sirven
 * para los dos. Funciones puras (sin React) para poder usarse en servicios,
 * componentes y utilidades por igual.
 *
 * NOTA: `periodontogram-section.jsx` mantiene su propia copia (envuelta en
 * useCallback) por compatibilidad; este módulo es la versión reutilizable.
 */

// Convierte distintos formatos de versionName a un timestamp ordenable (ms).
// Devuelve NaN si no se puede inferir una fecha.
export function parseVersionNameToTime(name) {
  if (!name || typeof name !== 'string') return NaN;
  try {
    // Caso especial: Archivado_YYYY-MM-DD o Archivado_YYYY-MM-DD_HH-mm-ss
    const mArchived = name.match(/^Archivado_(\d{4})-(\d{2})-(\d{2})(?:_(\d{2})-(\d{2})-(\d{2}))?$/);
    if (mArchived) {
      const [, yyyyA, mma, dda, HHa, MMa, SSa] = mArchived;
      const year = Number(yyyyA);
      const month = Number(mma) - 1;
      const day = Number(dda);
      const hour = Number(HHa ?? '00');
      const minute = Number(MMa ?? '00');
      const second = Number(SSa ?? '00');
      if (year >= 1970 && year <= 2100) {
        return new Date(year, month, day, hour, minute, second).getTime();
      }
    }
    // Caso 1: DD-MM-YYYY_HH-mm-ss
    const m1 = name.match(/^(\d{2})-(\d{2})-(\d{4})_(\d{2})-(\d{2})-(\d{2})$/);
    if (m1) {
      const [, dd, mm, yyyy, HH, MM, SS] = m1;
      return new Date(Number(yyyy), Number(mm) - 1, Number(dd), Number(HH), Number(MM), Number(SS)).getTime();
    }
    // Caso 2: ISO compacto embebido, p.ej. 20250912T235822663Z o v001_20250912T235822
    const m2 = name.match(/(\d{4})(\d{2})(\d{2})[T_\-]?(\d{2})(\d{2})(\d{2})/);
    if (m2) {
      const [, yyyy, MM, dd, HH, mm, SS] = m2;
      const year = Number(yyyy);
      if (year >= 1970 && year <= 2100) {
        return new Date(year, Number(MM) - 1, Number(dd), Number(HH), Number(mm), Number(SS)).getTime();
      }
    }
    // Fallback: Date.parse
    const t = Date.parse(name);
    return isNaN(t) ? NaN : t;
  } catch {
    return NaN;
  }
}

// Ordena una lista de versionName de más reciente a más antigua.
export function sortVersionsDesc(versions = []) {
  try {
    const withKey = versions.map((v) => ({ v, t: parseVersionNameToTime(v) }));
    withKey.sort((a, b) => {
      const aOk = Number.isFinite(a.t);
      const bOk = Number.isFinite(b.t);
      if (aOk && bOk) return b.t - a.t; // más reciente primero
      if (aOk && !bOk) return -1; // tiempo conocido antes que desconocido
      if (!aOk && bOk) return 1;
      return String(b.v).localeCompare(String(a.v)); // ambos desconocidos → lexical desc
    });
    return withKey.map(x => x.v);
  } catch {
    return Array.isArray(versions) ? versions.slice().sort((a, b) => String(b).localeCompare(String(a))) : [];
  }
}

// Formatea un versionName a una etiqueta legible (DD/MM/YYYY HH:MM:SS). Si no se
// puede parsear la fecha, devuelve el nombre tal cual.
export function formatVersionLabel(name) {
  const t = parseVersionNameToTime(name);
  if (!Number.isFinite(t)) return String(name);
  const d = new Date(t);
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const yyyy = String(d.getFullYear());
  const HH = String(d.getHours()).padStart(2, '0');
  const MM = String(d.getMinutes()).padStart(2, '0');
  const SS = String(d.getSeconds()).padStart(2, '0');
  return `${dd}/${mm}/${yyyy} ${HH}:${MM}:${SS}`;
}
