import { useState, useEffect, useCallback } from 'react';
import { Radio, Skeleton, Button, Segmented } from 'antd';
import { EyeOutlined, EyeInvisibleOutlined, ReloadOutlined } from '@ant-design/icons';
import { getSessionBalance } from '../../shared/services/cashService';

const formatCOP = (amount) =>
  new Intl.NumberFormat('es-CO', {
    style: 'currency',
    currency: 'COP',
    minimumFractionDigits: 0
  }).format(amount || 0);

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

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const res = await getSessionBalance();
      setData(res);
    } catch (error) {
      console.error('Error loading session balance:', error);
      setData(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await getSessionBalance();
        if (cancelled) return;
        setData(res);
      } catch (error) {
        if (cancelled) return;
        console.error('Error loading session balance:', error);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const summary = data?.summary || {};
  const session = data?.session || null;
  const hasSession = !!data?.hasSession;
  const isOpen = !!data?.isOpen;

  const getDisplayAmount = () => {
    if (!isVisible) return '••••••';
    if (!hasSession) return formatCOP(0);

    if (view === 'onHand') {
      // Dinero en caja: efectivo físico + saldo digital (informativo)
      if (method === 'cash') return formatCOP(summary.cashOnHand);
      if (method === 'digital') return formatCOP(summary.digitalNet);
      return formatCOP((summary.cashOnHand || 0) + (summary.digitalNet || 0));
    }

    // balance: ingresos − egresos por método
    if (method === 'cash') return formatCOP(summary.cashNet);
    if (method === 'digital') return formatCOP(summary.digitalNet);
    return formatCOP(summary.net);
  };

  const getDisplayLabel = () => {
    if (!hasSession) return 'Sin sesiones registradas';

    const sessionTag = isOpen
      ? `Sesión abierta · ${formatDateTime(session.startTime)}`
      : `Última sesión cerrada · ${formatDateTime(session.endTime)}`;

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

      {hasSession && (
        <div className="cash-dashboard__breakdown">
          <span>
            Inicio: <strong>{formatCOP(session.initialAmount)}</strong>
          </span>
          <span>
            Ingresos: <strong className="cash-dashboard__income">{formatCOP(summary.totalIncome)}</strong>
          </span>
          <span>
            Egresos: <strong className="cash-dashboard__expense">{formatCOP(summary.totalExpense)}</strong>
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
