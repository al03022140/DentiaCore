import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import PropTypes from 'prop-types';
import { Table, Modal, message, Input } from 'antd';
import { prepareDataSource, normalizeEntriesForEngine } from '../utils/odontogram-utils.js';
import { useUnsavedChanges } from '../../../shared/contexts/UnsavedChangesContext.jsx';
import { useDraftPersistence } from '../../../shared/hooks/useDraftPersistence.js';

/**
 * Odontograma inicial.
 *
 * Diseño:
 * - Una sola captura por paciente. NO existe opción de archivar o re-crear: una vez
 *   guardado, queda inmutable. El servidor rechaza re-saves con 409.
 * - Sin imágenes: sólo se persisten las entradas (tooth/damage/surface/note/fecha).
 *   La vista read-only renderiza un canvas desde esos datos.
 * - Doble protección contra doble-guardado: (a) `savedOnceRef` síncrono captura el
 *   doble-click instantáneo; (b) `saving` state deshabilita el botón; (c) modal de
 *   confirmación que requiere escribir "Confirmar"; (d) el backend devuelve 409.
 * - Una sola inicialización del engine: un único `useEffect` con cleanup explícito.
 */
const OdontogramInitialSection = ({
  canvasRef,
  patientId,
  initialTableData = [],
  exists = false,
  onSaveSuccess,
  initialSnapshotStatus = 'loading',
  areScriptsReady = false,
}) => {
  // Modo derivado: si ya existe → view (canvas read-only). Si no → edit.
  const mode = exists ? 'view' : 'edit';

  const engineRef = useRef(null);
  const handlersRef = useRef(null);
  // Anti doble-guardado: una vez aceptado un save, este ref se queda en true.
  // Se resetea sólo si el backend devuelve error (para que pueda reintentar).
  const savedOnceRef = useRef(false);
  // Marca cambios sin guardar — base del warning beforeunload (cierre de
  // pestaña/recarga) y del guard SPA (cambio de paciente vía router).
  const isDirtyRef = useRef(false);
  const { markDirty: ctxMarkDirty, markClean: ctxMarkClean } = useUnsavedChanges();
  const dirtyKey = `odontogram-initial-${patientId || 'no-patient'}`;
  useEffect(() => () => ctxMarkClean(dirtyKey), [ctxMarkClean, dirtyKey]);

  // Persistencia local del borrador: si la sesión se cierra (timeout JWT,
  // crash, cierre de app) los cambios sobreviven en localStorage hasta que
  // el usuario vuelva a entrar y decida recuperarlos.
  const draft = useDraftPersistence({
    key: `odontogram-initial-${patientId || 'no-patient'}`,
    enabled: mode === 'edit' && !!patientId,
    isDirty: () => isDirtyRef.current,
    getSnapshot: () => engineRef.current?.getData?.() || [],
  });
  // Flag para mostrar el modal de recuperación una sola vez por montaje.
  const draftPromptedRef = useRef(false);

  const [saving, setSaving] = useState(false);
  const [engineError, setEngineError] = useState(null);
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [confirmationText, setConfirmationText] = useState('');
  // Tabla colapsable: por defecto oculta para que el canvas use todo el ancho.
  const [tableVisible, setTableVisible] = useState(false);

  const isConfirmationValid = confirmationText.trim().toLowerCase() === 'confirmar';

  // ── Inicialización del engine ────────────────────────────────────────────
  // Una sola ruta: limpia el engine previo (si lo hubiera), crea uno nuevo,
  // configura `preview` según el modo, carga datos, y adjunta listeners sólo
  // en modo edición. En `view` no se adjuntan listeners y `preview=true`
  // bloquea cualquier interacción.
  useEffect(() => {
    if (!areScriptsReady) return;
    if (!canvasRef?.current) return;
    if (!window.Engine) {
      setEngineError('Motor de odontograma no cargado.');
      return;
    }

    let engine;
    let clickHandler;
    let moveHandler;

    try {
      engine = new window.Engine({
        CONSTANTS: window.Constants ? new window.Constants() : null,
        patientId,
      });
      engine.setCanvas(canvasRef.current);
      engine.tipo = 'inicial';
      // NOTA: NO usar `engine.preview = true` para modo read-only.
      // En este engine, `preview` significa "print preview" — dispara `printPreview()`
      // que dibuja un header (Office/Patient/Appoint No./Dentist/Date) y crashea al
      // hacer `wrapText(this.treatmentData.specs)` cuando specs es undefined.
      // El modo read-only se logra simplemente NO adjuntando listeners de mouse al canvas.
      engine.preview = false;
      engine.init();
      engine.setPatientId(patientId);

      // Ocultar botones internos del engine.
      // - En edit-mode: ocultar sólo "Guardar" (usamos el botón React).
      // - En view-mode: ocultar TODOS los botones (Guardar, Borrar, etc.) para que el
      //   canvas se vea como un registro fijo y no como una herramienta editable.
      if (Array.isArray(engine.buttons)) {
        engine.buttons.forEach((b) => {
          const hide = (mode === 'view') || (b?.textBox?.text === 'Guardar');
          if (hide) {
            b.active = false;
            if (b.rect) b.rect.x = -1000;
            if (b.textBox && b.textBox.rect) b.textBox.rect.x = -1000;
          }
        });
      }

      // En view-mode también ocultamos los menuItems (paleta de daños) — son ítems
      // interactivos que en sólo-lectura no tienen sentido.
      if (mode === 'view' && Array.isArray(engine.menuItems)) {
        engine.menuItems.forEach((m) => {
          if (m) {
            m.active = false;
            if (m.rect) m.rect.x = -1000;
            if (m.textBox && m.textBox.rect) m.textBox.rect.x = -1000;
          }
        });
      }

      // Carga inicial: hacemos load aquí para el primer mount. Cambios
      // posteriores en `initialTableData` se gestionan en un useEffect
      // dedicado abajo (sin re-crear el engine — antes cada save
      // provocaba cleanup + reinit a mitad de la transición a view-mode).
      if (Array.isArray(initialTableData) && initialTableData.length > 0) {
        const entriesForEngine = normalizeEntriesForEngine(initialTableData);
        if (entriesForEngine.length > 0) {
          engine.loadOdontogramaData(entriesForEngine);
        }
      }

      if (typeof engine.setShowAllTeeth === 'function') {
        engine.setShowAllTeeth(false);
      }

      engine.start();

      // Listeners de mouse SÓLO en edit-mode. En view-mode el canvas queda inerte
      // porque no hay handlers del lado del DOM (el engine no se auto-registra).
      // Cada click marca isDirty=true para que el beforeunload avise antes de
      // perder cambios.
      if (mode === 'edit') {
        clickHandler = (e) => {
          isDirtyRef.current = true;
          ctxMarkDirty(dirtyKey);
          engine.onMouseClick(e);
        };
        moveHandler = (e) => engine.onMouseMove(e);
        canvasRef.current.addEventListener('click', clickHandler);
        canvasRef.current.addEventListener('mousemove', moveHandler);
      }

      engineRef.current = engine;
      handlersRef.current = { click: clickHandler, move: moveHandler };
      setEngineError(null);

      // Recuperación de borrador local: si la sesión anterior se cortó
      // (timeout JWT, cierre brusco, crash) y quedaron cambios en
      // localStorage, ofrecer recuperarlos al usuario.
      if (mode === 'edit' && !draftPromptedRef.current) {
        const existing = draft.loadDraft();
        const data = Array.isArray(existing?.data) ? existing.data : [];
        if (data.length > 0) {
          draftPromptedRef.current = true;
          const minutes = Math.max(1, Math.round((Date.now() - existing.savedAt) / 60000));
          const when = minutes < 60
            ? `hace ${minutes} ${minutes === 1 ? 'minuto' : 'minutos'}`
            : `hace ${Math.round(minutes / 60)} h`;
          Modal.confirm({
            title: 'Cambios sin guardar encontrados',
            content: `Detectamos cambios en este odontograma de ${when} que no se llegaron a guardar. ¿Recuperarlos?`,
            okText: 'Recuperar',
            cancelText: 'Descartar',
            onOk: () => {
              try {
                const entries = normalizeEntriesForEngine(data);
                if (entries.length > 0 && engineRef.current) {
                  engineRef.current.loadOdontogramaData(entries);
                  isDirtyRef.current = true;
                  ctxMarkDirty(dirtyKey);
                }
              } catch (err) {
                console.error('[OdontogramInitial] Error recuperando borrador:', err);
                message.error('No se pudo recuperar el borrador.');
              }
            },
            onCancel: () => draft.clearDraft(),
          });
        }
      }
    } catch (err) {
      console.error('[OdontogramInitial] Error inicializando engine:', err);
      setEngineError(`No se pudo inicializar el odontograma: ${err.message}`);
    }

    return () => {
      const canvasEl = canvasRef.current;
      if (engine) {
        if (typeof engine.cleanup === 'function') engine.cleanup();
        else engine.stop = true;
      }
      if (canvasEl && handlersRef.current) {
        if (handlersRef.current.click) {
          canvasEl.removeEventListener('click', handlersRef.current.click);
        }
        if (handlersRef.current.move) {
          canvasEl.removeEventListener('mousemove', handlersRef.current.move);
        }
      }
      engineRef.current = null;
      handlersRef.current = null;
    };
    // initialTableData NO está en deps a propósito: el useEffect dedicado
    // de abajo maneja los cambios sin re-crear el engine.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [areScriptsReady, mode, patientId, canvasRef]);

  // Carga de datos en el engine ya instanciado. Se separa del useEffect
  // de init para que cambios en `initialTableData` (tras un save o
  // refresh del padre) NO destruyan el engine.
  useEffect(() => {
    const engine = engineRef.current;
    if (!engine) return;
    if (!Array.isArray(initialTableData) || initialTableData.length === 0) return;
    const entriesForEngine = normalizeEntriesForEngine(initialTableData);
    if (entriesForEngine.length === 0) return;
    try {
      engine.loadOdontogramaData(entriesForEngine);
    } catch (err) {
      console.error('[OdontogramInitial] Error cargando datos en engine ya instanciado:', err);
    }
  }, [initialTableData]);

  // ── Guardado ─────────────────────────────────────────────────────────────
  const handleConfirmSave = useCallback(async () => {
    // Triple guarda: el ref captura el click instantáneo, antes de que React
    // procese el `setSaving(true)`. Esto cierra la carrera click-doble-rápido.
    if (savedOnceRef.current) {
      message.warning('Ya hay un guardado en curso o completado.');
      return;
    }
    if (saving) return;
    if (mode !== 'edit') {
      message.warning('El odontograma inicial ya está guardado.');
      return;
    }
    const engine = engineRef.current;
    if (!engine) {
      message.error('El motor del odontograma no está listo.');
      return;
    }

    savedOnceRef.current = true;
    setSaving(true);
    setShowConfirmModal(false);
    setConfirmationText('');

    try {
      const rawData = engine.getData() || [];

      // Normalizar: el engine puede devolver `damage` como número o string.
      // Filtrar entradas sin diente o sin daño.
      const entries = rawData
        .map((item) => ({
          tooth: String(item.tooth ?? ''),
          damage: String(item.damage ?? ''),
          surface: String(item.surface ?? 'O'),
          note: String(item.note ?? ''),
        }))
        .filter((e) => e.tooth && e.damage !== '');

      // El backend ahora acepta entries=[]: registra captura inicial sin
      // hallazgos sin contaminar el odontograma con un daño-fantasma ('Sano')
      // que el engine no reconoce al recargar.
      const { default: odontogramaService } = await import('../api/odontograma-service.js');
      const response = await odontogramaService.saveInitialOdontogram(patientId, entries);

      if (!response || response.exists !== true) {
        throw new Error('Respuesta inesperada del servidor.');
      }

      message.success('Odontograma inicial guardado.');
      isDirtyRef.current = false;
      ctxMarkClean(dirtyKey);
      draft.clearDraft();
      onSaveSuccess?.(response.datos || [], response.history || []);
      // `savedOnceRef` queda en true: el componente cambiará a modo view por el
      // refresh del padre, y este ref impide cualquier disparo residual.
    } catch (err) {
      // Si el error es 409 (ya existe), tratarlo como éxito de "ya guardado"
      // para forzar el switch a view-mode en el padre, evitando reintentos.
      const status = err?.response?.status;
      if (status === 409) {
        message.warning('Este paciente ya tiene un odontograma inicial guardado. Refrescando…');
        draft.clearDraft();
        onSaveSuccess?.([], []);
        return; // savedOnceRef queda true
      }
      console.error('[OdontogramInitial] Error guardando:', err);
      const msg = err?.response?.data?.error?.message || err?.message || 'Error desconocido al guardar.';
      message.error(`No se pudo guardar: ${msg}`);
      // Permitir reintentar si el guardado falló por algo recuperable.
      savedOnceRef.current = false;
    } finally {
      setSaving(false);
    }
  }, [saving, mode, patientId, onSaveSuccess]);

  const handleOpenConfirm = useCallback(() => {
    if (savedOnceRef.current || saving) return;
    setShowConfirmModal(true);
    setConfirmationText('');
  }, [saving]);

  const handleCancelConfirm = useCallback(() => {
    setShowConfirmModal(false);
    setConfirmationText('');
  }, []);

  // ── Tabla ────────────────────────────────────────────────────────────────
  const tableColumns = useMemo(() => ([
    { title: 'Diente', dataIndex: 'diente', key: 'diente', width: 40 },
    { title: 'Daño', dataIndex: 'tipo', key: 'tipo', width: 100, ellipsis: true },
    { title: 'Superficie', dataIndex: 'superficie', key: 'superficie', width: 80, ellipsis: true },
    { title: 'Fecha', dataIndex: 'fecha', key: 'fecha', width: 90, ellipsis: true },
  ]), []);

  const tableDataSource = useMemo(
    () => prepareDataSource(initialTableData, 'inicial'),
    [initialTableData]
  );

  const statusLine = useMemo(() => {
    if (initialSnapshotStatus === 'loading') return 'Comprobando odontograma inicial guardado…';
    if (mode === 'view') return 'Odontograma inicial guardado (sólo lectura). Este registro es permanente.';
    return 'Marca los dientes en el canvas y pulsa «Capturar Odontograma». Sólo se puede guardar una vez y no podrá modificarse.';
  }, [initialSnapshotStatus, mode]);

  // Bloquea cierre de pestaña/recarga con captura sin guardar. No cubre
  // navegación SPA (cambio de paciente) — eso requiere coordinación con el
  // padre y queda fuera de este parche.
  useEffect(() => {
    const handleBeforeUnload = (e) => {
      if (!isDirtyRef.current) return;
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, []);

  return (
    <section className="patient-detail_odontograma">
      <div className="odontograma-section">
        <div className="odontograma-header1">
          <div className="odontograma-initial-heading-block">
            <h2>Odontograma Inicial</h2>
            <p className="odontograma-initial-status-line" role="status">{statusLine}</p>
          </div>

          <div className="odontograma-controls">
            {mode === 'edit' && (
              <button
                type="button"
                className="button-primary capture-button"
                onClick={handleOpenConfirm}
                disabled={saving || savedOnceRef.current || !!engineError}
              >
                {saving ? 'Guardando...' : 'Capturar Odontograma'}
              </button>
            )}
            <button
              type="button"
              className="odontograma-toggle-table-btn"
              onClick={() => setTableVisible(v => !v)}
              aria-pressed={tableVisible}
              title={tableVisible ? 'Ocultar tabla de daños' : 'Mostrar tabla de daños'}
            >
              {tableVisible ? (
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="18"
                  height="18"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="odontograma-toggle-icon"
                  aria-hidden="true"
                >
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              ) : (
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="18"
                  height="18"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="odontograma-toggle-icon"
                  aria-hidden="true"
                >
                  <rect x="8" y="2" width="8" height="4" rx="1" ry="1" />
                  <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" />
                  <path d="M9 11h6" />
                  <path d="M9 15h6" />
                </svg>
              )}
              <span>{tableVisible ? 'Ocultar registro' : 'Ver registro'}</span>
              {tableDataSource.length > 0 && (
                <span className="odontograma-toggle-badge" aria-label={`${tableDataSource.length} daños`}>
                  {tableDataSource.length}
                </span>
              )}
            </button>
          </div>

        </div>

        <div className={`odontograma-container odontograma-flex-container${tableVisible ? '' : ' odontograma-table-collapsed'}`}>
          <div className={`odontograma-canvas-container${mode === 'view' ? ' odontograma-canvas-container--readonly' : ''}`}>
            {engineError && (
              <div className="error-container">
                <div className="error-message">{engineError}</div>
              </div>
            )}
            {saving && (
              <>
                <div className="loading-overlay"></div>
                <div className="loading-spinner"><p>Guardando...</p></div>
              </>
            )}
            <canvas
              ref={canvasRef}
              id="odontograma-canvas"
              width="1200"
              height="700"
              className="odontograma-canvas"
              aria-label={mode === 'view' ? 'Odontograma inicial (sólo lectura)' : 'Odontograma inicial (editable)'}
            />
          </div>

          <div className="odontograma-table-container">
            <h3>{mode === 'view' ? 'Datos guardados' : 'Daños marcados'}</h3>
            <Table
              columns={tableColumns}
              dataSource={tableDataSource}
              rowKey={(r) => r.key}
              size="small"
              pagination={false}
              bordered
              scroll={{ y: 600 }}
              tableLayout="fixed"
              className="odontograma-table"
              locale={{ emptyText: mode === 'view'
                ? 'El odontograma se guardó sin daños registrados.'
                : 'Aún no hay daños marcados.' }}
            />
          </div>
        </div>

      </div>

      <Modal
        title="Confirmar guardado del odontograma inicial"
        open={showConfirmModal}
        onOk={handleConfirmSave}
        onCancel={handleCancelConfirm}
        okText="Guardar"
        cancelText="Cancelar"
        okButtonProps={{ disabled: !isConfirmationValid || saving, loading: saving }}
        destroyOnClose
        maskClosable={!saving}
        closable={!saving}
      >
        <div style={{ marginBottom: '16px' }}>
          <p>
            <strong>Atención:</strong> el odontograma inicial sólo se puede guardar una vez por paciente. Una vez guardado, no podrá modificarse ni borrarse.
          </p>
          <p>Para confirmar, escribe <strong>"Confirmar"</strong>:</p>
          <Input
            placeholder='Escribe "Confirmar" para continuar'
            value={confirmationText}
            onChange={(e) => setConfirmationText(e.target.value)}
            onPressEnter={() => isConfirmationValid && handleConfirmSave()}
            autoFocus
            disabled={saving}
          />
          {confirmationText && !isConfirmationValid && (
            <p style={{ color: '#ff4d4f', marginTop: '8px', fontSize: '14px' }}>
              Debes escribir exactamente "Confirmar".
            </p>
          )}
        </div>
      </Modal>
    </section>
  );
};

OdontogramInitialSection.propTypes = {
  canvasRef: PropTypes.oneOfType([
    PropTypes.func,
    PropTypes.shape({ current: PropTypes.instanceOf(Element) }),
  ]),
  patientId: PropTypes.string.isRequired,
  initialTableData: PropTypes.array,
  exists: PropTypes.bool,
  onSaveSuccess: PropTypes.func,
  initialSnapshotStatus: PropTypes.oneOf(['loading', 'saved', 'none']),
  areScriptsReady: PropTypes.bool,
};

export default OdontogramInitialSection;
