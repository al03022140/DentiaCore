import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { DatePicker, Collapse, Tag, Empty, Spin, Tooltip, message } from 'antd';
import {
  CalendarOutlined,
  ClockCircleOutlined,
  UserOutlined,
  DollarCircleOutlined,
  ReloadOutlined,
  LockOutlined,
  UnlockOutlined,
  WarningOutlined
} from '@ant-design/icons';
import dayjs from 'dayjs';
import { getSessionsByDay, getLastMovements } from '../../../shared/services/cashService';
import { formatMoney } from '../../../shared/utils/money';

const formatTime = (dateStr) => {
  if (!dateStr) return '—';
  return new Date(dateStr).toLocaleString('es-MX', {
    hour: '2-digit', minute: '2-digit'
  });
};

const formatDateTime = (dateStr) => {
  if (!dateStr) return '—';
  return new Date(dateStr).toLocaleString('es-MX', {
    day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit'
  });
};

const STATUS_META = {
  OPEN: { label: 'Abierta', color: 'green', icon: <UnlockOutlined /> },
  CLOSING: { label: 'Cerrando', color: 'orange', icon: <WarningOutlined /> },
  CLOSED: { label: 'Cerrada', color: 'default', icon: <LockOutlined /> }
};

// Calcula totales por método y por tipo a partir de los movimientos de una sesión.
const computeTotals = (movements) => {
  const init = { incomeCash: 0, incomeDigital: 0, expenseCash: 0, expenseDigital: 0 };
  return movements.reduce((acc, m) => {
    const amt = Number(m.amount) || 0;
    if (m.type === 'INCOME') {
      if (m.paymentMethod === 'CASH') acc.incomeCash += amt;
      else acc.incomeDigital += amt;
    } else {
      if (m.paymentMethod === 'CASH') acc.expenseCash += amt;
      else acc.expenseDigital += amt;
    }
    return acc;
  }, init);
};

const CashHistorySection = () => {
  const [selectedDay, setSelectedDay] = useState(dayjs());
  const [sessions, setSessions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [movementsBySession, setMovementsBySession] = useState({});
  const [loadingSessionId, setLoadingSessionId] = useState(null);

  const dayISO = useMemo(() => selectedDay.format('YYYY-MM-DD'), [selectedDay]);

  const loadSessions = useCallback(async () => {
    setLoading(true);
    try {
      const data = await getSessionsByDay(dayISO);
      const list = Array.isArray(data?.sessions) ? data.sessions : [];
      setSessions(list);
      setMovementsBySession({});
    } catch (err) {
      console.error('Error fetching sessions:', err);
      message.error(err?.response?.data?.message || 'No se pudo cargar el historial');
      setSessions([]);
    } finally {
      setLoading(false);
    }
  }, [dayISO]);

  useEffect(() => { loadSessions(); }, [loadSessions]);

  const fetchSessionMovements = async (sessionId) => {
    if (movementsBySession[sessionId]) return;
    setLoadingSessionId(sessionId);
    try {
      const data = await getLastMovements({ boxSessionId: sessionId, limit: 200 });
      setMovementsBySession((prev) => ({ ...prev, [sessionId]: Array.isArray(data) ? data : [] }));
    } catch (err) {
      console.error('Error fetching session movements:', err);
      message.error('No se pudieron cargar los movimientos');
      setMovementsBySession((prev) => ({ ...prev, [sessionId]: [] }));
    } finally {
      setLoadingSessionId(null);
    }
  };

  const onChangeDay = (val) => {
    if (val) setSelectedDay(val);
  };

  const onCollapseChange = (openedKeys) => {
    const keys = Array.isArray(openedKeys) ? openedKeys : [openedKeys].filter(Boolean);
    keys.forEach((k) => fetchSessionMovements(k));
  };

  const renderSessionHeader = (s) => {
    const meta = STATUS_META[s.status] || STATUS_META.CLOSED;
    const opener = s.openedBy?.nombre || 'desconocido';
    const closer = s.closedBy?.nombre;
    return (
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '0.5rem', width: '100%' }}>
        <Tag icon={meta.icon} color={meta.color}>{meta.label}</Tag>
        <span style={{ fontWeight: 600 }}>
          <ClockCircleOutlined /> {formatTime(s.startTime)}
          {s.endTime ? ` → ${formatTime(s.endTime)}` : ' → en curso'}
        </span>
        <span style={{ color: 'var(--color-text-secondary)', fontSize: '0.85rem' }}>
          <UserOutlined /> Abrió: <strong>{opener}</strong>
          {closer && <> · Cerró: <strong>{closer}</strong></>}
        </span>
        <span style={{ marginLeft: 'auto', display: 'flex', gap: '0.75rem', fontSize: '0.85rem' }}>
          <Tooltip title="Saldo inicial">
            Inicio: <strong>{formatMoney(s.initialAmount)}</strong>
          </Tooltip>
          {typeof s.finalAmount === 'number' && (
            <Tooltip title="Saldo de cierre">
              Cierre: <strong>{formatMoney(s.finalAmount)}</strong>
            </Tooltip>
          )}
        </span>
      </div>
    );
  };

  const renderMovementRow = (m) => {
    const sign = m.type === 'INCOME' ? '+' : '−';
    const isCash = m.paymentMethod === 'CASH';
    const patientName = m.patientId
      ? `${m.patientId.primer_nombre || ''} ${m.patientId.apellido_paterno || ''}`.trim() || 'Paciente'
      : 'General';
    return (
      <div
        key={m._id}
        style={{
          display: 'grid',
          gridTemplateColumns: '1fr auto',
          gap: '0.25rem 0.5rem',
          padding: '0.5rem 0.25rem',
          borderBottom: '1px solid var(--color-border)',
          fontSize: '0.88rem'
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', flexWrap: 'wrap' }}>
          <DollarCircleOutlined style={{ color: m.type === 'INCOME' ? 'var(--color-success)' : 'var(--color-danger)' }} />
          <strong>{m.concept}</strong>
          <Tag color={isCash ? 'gold' : 'blue'} style={{ marginInline: 0 }}>
            {isCash ? 'Efectivo' : 'Digital'}
          </Tag>
          <span style={{ color: 'var(--color-text-secondary)' }}>{patientName}</span>
        </div>
        <div
          style={{
            color: m.type === 'INCOME' ? 'var(--color-success)' : 'var(--color-danger)',
            fontWeight: 600,
            whiteSpace: 'nowrap'
          }}
        >
          {sign}{formatMoney(m.amount)}
        </div>
        <div style={{ gridColumn: '1 / -1', fontSize: '0.78rem', color: 'var(--color-text-secondary)' }}>
          {formatDateTime(m.date)} · {m.creadoPor?.nombre || 'usuario desconocido'}
        </div>
      </div>
    );
  };

  const renderSessionPanel = (s) => {
    const movements = movementsBySession[s._id];
    const loadingMovs = loadingSessionId === s._id;
    if (loadingMovs && !movements) {
      return <div style={{ padding: '1rem', textAlign: 'center' }}><Spin size="small" /></div>;
    }
    if (!movements) {
      return <div style={{ padding: '0.5rem', color: 'var(--color-text-secondary)' }}>Expande para cargar…</div>;
    }
    if (movements.length === 0) {
      return <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="Sin movimientos en esta sesión" />;
    }
    const t = computeTotals(movements);
    const netCash = t.incomeCash - t.expenseCash;
    const netDigital = t.incomeDigital - t.expenseDigital;
    return (
      <>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
            gap: '0.5rem',
            padding: '0.5rem',
            marginBottom: '0.75rem',
            background: 'var(--color-blue-500-12)',
            borderRadius: 'var(--border-radius-md)',
            fontSize: '0.85rem'
          }}
        >
          <div>
            <div style={{ color: 'var(--color-text-secondary)' }}>Ingresos efectivo</div>
            <strong style={{ color: 'var(--color-success)' }}>{formatMoney(t.incomeCash)}</strong>
          </div>
          <div>
            <div style={{ color: 'var(--color-text-secondary)' }}>Ingresos digital</div>
            <strong style={{ color: 'var(--color-success)' }}>{formatMoney(t.incomeDigital)}</strong>
          </div>
          <div>
            <div style={{ color: 'var(--color-text-secondary)' }}>Egresos efectivo</div>
            <strong style={{ color: 'var(--color-danger)' }}>{formatMoney(t.expenseCash)}</strong>
          </div>
          <div>
            <div style={{ color: 'var(--color-text-secondary)' }}>Egresos digital</div>
            <strong style={{ color: 'var(--color-danger)' }}>{formatMoney(t.expenseDigital)}</strong>
          </div>
          <div>
            <div style={{ color: 'var(--color-text-secondary)' }}>Neto efectivo</div>
            <strong>{formatMoney(netCash)}</strong>
          </div>
          <div>
            <div style={{ color: 'var(--color-text-secondary)' }}>Neto digital</div>
            <strong>{formatMoney(netDigital)}</strong>
          </div>
        </div>
        <div>{movements.map(renderMovementRow)}</div>
      </>
    );
  };

  const items = sessions.map((s) => ({
    key: s._id,
    label: renderSessionHeader(s),
    children: renderSessionPanel(s)
  }));

  return (
    <div>
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '0.5rem', marginBottom: '1rem' }}>
        <CalendarOutlined />
        <label style={{ fontWeight: 600 }}>Día:</label>
        <DatePicker
          value={selectedDay}
          onChange={onChangeDay}
          allowClear={false}
          format="DD MMM YYYY"
          disabledDate={(d) => d && d.isAfter(dayjs().endOf('day'))}
        />
        <button
          type="button"
          className="settings-btn-secondary settings-btn--with-icon"
          onClick={loadSessions}
          disabled={loading}
        >
          <ReloadOutlined /> Recargar
        </button>
        <span style={{ marginLeft: 'auto', color: 'var(--color-text-secondary)', fontSize: '0.85rem' }}>
          {sessions.length === 0
            ? 'Sin sesiones'
            : `${sessions.length} ${sessions.length === 1 ? 'sesión' : 'sesiones'}`}
        </span>
      </div>

      {loading ? (
        <div style={{ padding: '2rem', textAlign: 'center' }}><Spin /></div>
      ) : sessions.length === 0 ? (
        <Empty description={`No hay sesiones de caja registradas el ${selectedDay.format('DD MMM YYYY')}`} />
      ) : (
        <Collapse
          accordion={false}
          onChange={onCollapseChange}
          items={items}
        />
      )}
    </div>
  );
};

export default CashHistorySection;
