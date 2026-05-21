import { useState, useEffect, useCallback } from 'react';
import { Radio, Skeleton, Button, Segmented, Alert, Popconfirm, message } from 'antd';
import { EyeOutlined, EyeInvisibleOutlined, ReloadOutlined, WarningOutlined } from '@ant-design/icons';
import { getSessionBalance, getStaleSessions, forceResolveSession } from '../../shared/services/cashService';
import { formatMoney } from '../../shared/utils/money';

// Format compacto sin decimales para el dashboard (montos suelen ser redondos).
const formatMXN = (amount) => formatMoney(amount, { showDecimals: false });

const formatDateTime = (dateStr) => {
  if (!dateStr) return '—';
  return new Date(dateStr).toLocaleString('es-MX', {
    day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit'
  });
};

const CashDashboard = () => {
  const [data, setData] = useState(null);
  const [isVisible, setIsVisible] = useState(true);
  // view: 'balance' (ingresos − egresos) | 'onHand' (efectivo físico disponible)
  const [view, setView] = useState('balance');
  // method (sólo aplica a 'balance'): cash | digital | total
  const [method, setMethod] = useState('total');
  const [loading, setLoading] = useState(true);
  // BUG-B14: sesiones huérfanas (OPEN > 24h, CLOSING > 1h)
  const [stale, setStale] = useState({ staleOpen: [], staleClosing: [] });
  const [resolvingId, setResolvingId] = useState(null);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const [res, staleRes] = await Promise.all([
        getSessionBalance(),
        getStaleSessions().catch(() => ({ staleOpen: [], staleClosing: [] }))
      ]);
      setData(res);
      setStale(staleRes || { staleOpen: [], staleClosing: [] });
    } catch (error) {
      console.error('Error loading session balance:', error);
      setData(null);
    } finally {
      setLoading(false);
    }
  }, []);

  const resolveSession = async (sessionId) => {
    setResolvingId(sessionId);
    try {
      await forceResolveSession(sessionId);
      message.success('Sesión cerrada correctamente');
      await load();
      window.dispatchEvent(new CustomEvent('cash:movement-changed', { detail: { source: 'force-resolve', sessionId } }));
    } catch (err) {
      message.error(err?.response?.data?.message || 'No se pudo forzar el cierre');
    } finally {
      setResolvingId(null);
    }
  };

  useEffect(() => { load(); }, [load]);

  // Escucha eventos globales para refrescar si la caja cambió desde otra vista
  useEffect(() => {
    const handler = () => { load(); };
    window.addEventListener('cash:movement-changed', handler);
    return () => window.removeEventListener('cash:movement-changed', handler);
  }, [load]);

  const summary = data?.summary || {};
  const session = data?.session || null;
  const hasSession = !!data?.hasSession;
  const isOpen = !!data?.isOpen;

  const getDisplayAmount = () => {
    if (!isVisible) return '••••••';
    // Al cerrar la caja, las cifras de la sesión anterior dejan de ser
    // relevantes hasta que se abra una nueva. Mostramos $0 en vez del último
    // saldo cerrado para evitar confundirlo con un estado vigente.
    if (!hasSession || !isOpen) return formatMXN(0);

    if (view === 'onHand') {
      // Dinero en caja: efectivo físico + saldo digital (informativo)
      if (method === 'cash') return formatMXN(summary.cashOnHand);
      if (method === 'digital') return formatMXN(summary.digitalNet);
      return formatMXN((summary.cashOnHand || 0) + (summary.digitalNet || 0));
    }

    // balance: ingresos − egresos por método
    if (method === 'cash') return formatMXN(summary.cashNet);
    if (method === 'digital') return formatMXN(summary.digitalNet);
    return formatMXN(summary.net);
  };

  const getDisplayLabel = () => {
    if (!hasSession) return 'Sin sesiones registradas';
    if (!isOpen) return 'Caja cerrada — abre una sesión para ver el balance';

    const sessionTag = `Sesión abierta · ${formatDateTime(session.startTime)}`;

    if (view === 'onHand') {
      if (method === 'cash') return `Efectivo en caja · ${sessionTag}`;
      if (method === 'digital') return `Saldo digital · ${sessionTag}`;
      return `Disponible total · ${sessionTag}`;
    }

    if (method === 'cash') return `Balance en efectivo · ${sessionTag}`;
    if (method === 'digital') return `Balance digital · ${sessionTag}`;
    return `Balance neto · ${sessionTag}`;
  };

  return (
    <>
      <div className="cash-card__header">
        <h2 className="cash-card__title">Balance y Estado</h2>
        <div className="cash-card__extra">
          <Button
            type="text"
            icon={<ReloadOutlined />}
            onClick={load}
            aria-label="Recargar balance"
            title="Recargar"
          />
          <Button
            type="text"
            icon={isVisible ? <EyeOutlined /> : <EyeInvisibleOutlined />}
            onClick={() => setIsVisible(!isVisible)}
            aria-label={isVisible ? 'Ocultar saldo' : 'Mostrar saldo'}
          />
        </div>
      </div>

      {(stale.staleClosing?.length > 0 || stale.staleOpen?.length > 0) && (
        <div className="cash-dashboard__stale-banner">
          {stale.staleClosing?.map((s) => (
            <Alert
              key={s._id}
              type="error"
              showIcon
              icon={<WarningOutlined />}
              message="Sesión con cierre incompleto"
              description={
                <span>
                  Una caja quedó en estado <strong>CLOSING</strong> (probable crash a la mitad). Hasta resolverla no se puede abrir una nueva.
                  {s.openedBy?.nombre && <> · Abierta por <strong>{s.openedBy.nombre}</strong></>}
                </span>
              }
              action={
                <Popconfirm
                  title="¿Forzar cierre de esta sesión?"
                  description="Se recalculará el saldo final con los movimientos existentes y se marcará como cerrada."
                  okText="Forzar cierre"
                  cancelText="Cancelar"
                  onConfirm={() => resolveSession(s._id)}
                >
                  <Button danger size="small" loading={resolvingId === s._id}>Forzar cierre</Button>
                </Popconfirm>
              }
              style={{ marginBottom: 8 }}
            />
          ))}
          {stale.staleOpen?.map((s) => (
            <Alert
              key={s._id}
              type="warning"
              showIcon
              icon={<WarningOutlined />}
              message="Caja olvidada (abierta > 24h)"
              description={
                <span>
                  Esta caja lleva más de 24 horas abierta — los reportes mensuales podrían
                  excluir sus movimientos a partir de las 48h. Cierra desde el botón "Cerrar Caja" o fuérzalo aquí.
                  {s.openedBy?.nombre && <> · Abierta por <strong>{s.openedBy.nombre}</strong></>}
                </span>
              }
              action={
                <Popconfirm
                  title="¿Forzar cierre de esta caja?"
                  description="Se cerrará con el efectivo calculado a partir de los movimientos registrados."
                  okText="Forzar cierre"
                  cancelText="Cancelar"
                  onConfirm={() => resolveSession(s._id)}
                >
                  <Button size="small" loading={resolvingId === s._id}>Forzar cierre</Button>
                </Popconfirm>
              }
              style={{ marginBottom: 8 }}
            />
          ))}
        </div>
      )}

      <div className="cash-dashboard__view-toggle">
        <Segmented
          block
          value={view}
          onChange={setView}
          options={[
            { label: 'Balance', value: 'balance' },
            { label: 'Dinero en caja', value: 'onHand' }
          ]}
        />
      </div>

      <div className="balance-display">
        {loading ? (
          <Skeleton.Input active size="large" />
        ) : (
          <p className={`balance-amount${(view === 'balance' && summary.net < 0) ? ' balance-amount--negative' : ''}`}>
            {getDisplayAmount()}
          </p>
        )}
        <span className="balance-label">{getDisplayLabel()}</span>
      </div>

      {hasSession && isOpen && (
        <div className="cash-dashboard__breakdown">
          <span>
            Inicio: <strong>{formatMXN(session.initialAmount)}</strong>
          </span>
          <span>
            Ingresos: <strong className="cash-dashboard__income">{formatMXN(summary.totalIncome)}</strong>
          </span>
          <span>
            Egresos: <strong className="cash-dashboard__expense">{formatMXN(summary.totalExpense)}</strong>
          </span>
        </div>
      )}

      <div className="filter-container">
        <Radio.Group
          value={method}
          onChange={(e) => setMethod(e.target.value)}
          buttonStyle="solid"
        >
          <Radio.Button value="cash">Efectivo</Radio.Button>
          <Radio.Button value="digital">Digital</Radio.Button>
          <Radio.Button value="total">Ambos</Radio.Button>
        </Radio.Group>
      </div>
    </>
  );
};

export default CashDashboard;
