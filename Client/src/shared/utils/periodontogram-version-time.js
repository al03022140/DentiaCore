// Parseo y formato de nombres de versión del periodontograma (extraído de
// periodontogram-section.jsx para poder testearlo sin montar el componente).
//
// Formatos soportados:
//  - Archivado_YYYY-MM-DD[_HH-mm-ss]      → hora LOCAL (así se generaban)
//  - DD-MM-YYYY_HH-mm-ss                  → hora LOCAL (legacy)
//  - ISO-compacto YYYYMMDDTHHmmss[mmm]Z   → hora UTC (viene de toISOString();
//    parsearlo como local corría la etiqueta por el offset — p. ej. +6 h en
//    México, todas las versiones aparecían "en el futuro")
//  - fallback: Date.parse

export const parseVersionNameToTime = (name) => {
  if (!name || typeof name !== 'string') return NaN;
  try {
    // Special case: Archivado_YYYY-MM-DD or Archivado_YYYY-MM-DD_HH-mm-ss
    const mArchived = name.match(/^Archivado_(\d{4})-(\d{2})-(\d{2})(?:_(\d{2})-(\d{2})-(\d{2}))?$/);
    if (mArchived) {
      const [, yyyyA, mma, dda, HHa, MMa, SSa] = mArchived;
      const year = Number(yyyyA);
      if (year >= 1970 && year <= 2100) {
        return new Date(year, Number(mma) - 1, Number(dda), Number(HHa ?? '00'), Number(MMa ?? '00'), Number(SSa ?? '00')).getTime();
      }
    }
    // Case 1: DD-MM-YYYY_HH-mm-ss
    const m1 = name.match(/^(\d{2})-(\d{2})-(\d{4})_(\d{2})-(\d{2})-(\d{2})$/);
    if (m1) {
      const [, dd, mm, yyyy, HH, MM, SS] = m1;
      return new Date(Number(yyyy), Number(mm) - 1, Number(dd), Number(HH), Number(MM), Number(SS)).getTime();
    }
    // Case 2: Embedded ISO-compact within string, e.g., v001_20250912T235822663Z or 20250912T235822
    const m2 = name.match(/(\d{4})(\d{2})(\d{2})[T_\-]?(\d{2})(\d{2})(\d{2})/);
    if (m2) {
      const [, yyyy, MM, dd, HH, mm, SS] = m2;
      const year = Number(yyyy);
      if (year >= 1970 && year <= 2100) {
        // Si justo tras los segundos vienen (ms opcionales +) 'Z', el sello es
        // UTC (toISOString compactado) → Date.UTC. Sin 'Z', hora local.
        const tail = name.slice(m2.index + m2[0].length);
        if (/^\d*Z/.test(tail)) {
          return Date.UTC(year, Number(MM) - 1, Number(dd), Number(HH), Number(mm), Number(SS));
        }
        return new Date(year, Number(MM) - 1, Number(dd), Number(HH), Number(mm), Number(SS)).getTime();
      }
    }
    // Fallback: try Date parse
    const t = Date.parse(name);
    return isNaN(t) ? NaN : t;
  } catch {
    return NaN;
  }
};

export const sortVersionsDesc = (versions = []) => {
  try {
    const withKey = versions.map((v) => ({ v, t: parseVersionNameToTime(v) }));
    withKey.sort((a, b) => {
      const aOk = Number.isFinite(a.t);
      const bOk = Number.isFinite(b.t);
      if (aOk && bOk) return b.t - a.t; // newer first
      if (aOk && !bOk) return -1; // known time before unknown
      if (!aOk && bOk) return 1;
      // both unknown -> lexical desc
      return String(b.v).localeCompare(String(a.v));
    });
    return withKey.map((x) => x.v);
  } catch {
    return Array.isArray(versions) ? versions.slice().sort((a, b) => String(b).localeCompare(String(a))) : [];
  }
};

// Etiqueta dd/mm/yyyy HH:MM:SS en hora LOCAL si el nombre es parseable; si no, el nombre crudo.
export const formatVersionLabel = (name) => {
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
};
