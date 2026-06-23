import { useCallback, useEffect, useRef } from 'react';

const DRAFT_PREFIX = 'dentiacore:draft:';
// M-14: los drafts contienen PHI (formularios de paciente, odontogramas). Se
// acorta la retención de 7 días a 24 h para reducir la exposición en estaciones
// compartidas. Drafts más viejos se consideran obsoletos y se ignoran al cargar.
const DRAFT_MAX_AGE_MS = 24 * 60 * 60 * 1000;

const storageKey = (key) => `${DRAFT_PREFIX}${key}`;

// M-14: borra TODOS los drafts persistidos. Se invoca al cerrar sesión para no
// dejar PHI en localStorage tras el logout (estaciones clínicas compartidas).
export const clearAllDrafts = () => {
  try {
    const toRemove = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith(DRAFT_PREFIX)) toRemove.push(k);
    }
    toRemove.forEach((k) => localStorage.removeItem(k));
  } catch {
    // noop — localStorage deshabilitado
  }
};

const readDraft = (key) => {
  try {
    const raw = localStorage.getItem(storageKey(key));
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return null;
    if (typeof parsed.savedAt !== 'number') return null;
    if (Date.now() - parsed.savedAt > DRAFT_MAX_AGE_MS) {
      localStorage.removeItem(storageKey(key));
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
};

const writeDraft = (key, data) => {
  try {
    localStorage.setItem(
      storageKey(key),
      JSON.stringify({ savedAt: Date.now(), data })
    );
    return true;
  } catch {
    // localStorage lleno o deshabilitado — no romper la edición por esto.
    return false;
  }
};

const removeDraft = (key) => {
  try {
    localStorage.removeItem(storageKey(key));
  } catch {
    // noop
  }
};

/**
 * Persiste un snapshot del estado en localStorage cada `intervalMs` cuando
 * `isDirty()` devuelve true, para que cambios no guardados sobrevivan a
 * cierres de sesión, crashes y pérdidas de foco.
 *
 * Uso típico:
 *   const draft = useDraftPersistence({
 *     key: `odontogram-initial-${patientId}`,
 *     enabled: mode === 'edit' && !!patientId,
 *     isDirty: () => isDirtyRef.current,
 *     getSnapshot: () => engineRef.current?.getData() || [],
 *   });
 *
 *   useEffect(() => {
 *     const existing = draft.loadDraft();
 *     if (existing) { ... ofrecer recuperar ... }
 *   }, []);
 *
 *   // al guardar bien: draft.clearDraft();
 */
export const useDraftPersistence = ({
  key,
  enabled = true,
  isDirty,
  getSnapshot,
  intervalMs = 4000,
}) => {
  const isDirtyRef = useRef(isDirty);
  const getSnapshotRef = useRef(getSnapshot);
  const lastSerializedRef = useRef(null);

  useEffect(() => { isDirtyRef.current = isDirty; }, [isDirty]);
  useEffect(() => { getSnapshotRef.current = getSnapshot; }, [getSnapshot]);

  const saveNow = useCallback(() => {
    if (!key) return false;
    try {
      const snapshot = getSnapshotRef.current?.();
      if (snapshot === undefined || snapshot === null) return false;
      const serialized = JSON.stringify(snapshot);
      if (serialized === lastSerializedRef.current) return false;
      const ok = writeDraft(key, snapshot);
      if (ok) lastSerializedRef.current = serialized;
      return ok;
    } catch {
      return false;
    }
  }, [key]);

  const loadDraft = useCallback(() => {
    if (!key) return null;
    return readDraft(key);
  }, [key]);

  const clearDraft = useCallback(() => {
    if (!key) return;
    removeDraft(key);
    lastSerializedRef.current = null;
  }, [key]);

  useEffect(() => {
    if (!enabled || !key) return undefined;

    const tick = () => {
      if (!isDirtyRef.current?.()) return;
      saveNow();
    };

    const id = setInterval(tick, intervalMs);
    return () => clearInterval(id);
  }, [enabled, key, intervalMs, saveNow]);

  // Último intento de persistir antes de un cierre brusco: si el navegador
  // dispara `pagehide`/`beforeunload`, alcanzamos a volcar el snapshot. Es
  // síncrono y no usa red — sólo localStorage.
  useEffect(() => {
    if (!enabled) return undefined;
    const flush = () => {
      if (isDirtyRef.current?.()) saveNow();
    };
    window.addEventListener('pagehide', flush);
    window.addEventListener('beforeunload', flush);
    return () => {
      window.removeEventListener('pagehide', flush);
      window.removeEventListener('beforeunload', flush);
    };
  }, [enabled, saveNow]);

  return { loadDraft, clearDraft };
};

export default useDraftPersistence;
