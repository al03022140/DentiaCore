import { useState, useEffect } from 'react';
import { Spin, message } from 'antd';
import CashDashboard from './CashDashboard';
import ActionsPanel from './ActionsPanel';
import MovementsList from './MovementsList';
import OpenBoxModal from './OpenBoxModal';
import PendingChargesPanel from './PendingChargesPanel';
import { getSessionStatus } from '../../shared/services/cashService';
import './styles/cash-page.css';

const CashPage = () => {
  const [loading, setLoading] = useState(true);
  const [isBoxOpen, setIsBoxOpen] = useState(false);
  const [showOpenModal, setShowOpenModal] = useState(false);
  const [refreshTrigger, setRefreshTrigger] = useState(0);

  const checkStatus = async () => {
    try {
      const { isOpen } = await getSessionStatus();
      setIsBoxOpen(isOpen);
      setShowOpenModal(!isOpen);
    } catch (error) {
      console.error('Error checking session:', error);
      message.error('Error al verificar estado de caja');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { isOpen } = await getSessionStatus();
        if (cancelled) return;
        setIsBoxOpen(isOpen);
        setShowOpenModal(!isOpen);
      } catch (error) {
        if (cancelled) return;
        console.error('Error checking session:', error);
        message.error('Error al verificar estado de caja');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const handleOpenSuccess = () => {
    setIsBoxOpen(true);
    setShowOpenModal(false);
    setRefreshTrigger(prev => prev + 1);
  };

  const handleDismissModal = () => {
    setShowOpenModal(false);
  };

  const handleBoxClosed = () => {
    setIsBoxOpen(false);
    setRefreshTrigger(prev => prev + 1);
  };

  const handleRequestOpenBox = () => {
    setShowOpenModal(true);
  };

  const handleMovementAdded = () => {
    setRefreshTrigger(prev => prev + 1);
  };

  if (loading) {
    return <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%' }}><Spin size="large" /></div>;
  }

  return (
    <>
      <OpenBoxModal visible={showOpenModal} onOpenSuccess={handleOpenSuccess} onCancel={handleDismissModal} />

      <div className="cash-page">
        {/* Fila superior ~40%: izq. Balance/Estado, der. Acciones operativas */}
        <div className="cash-card cash-dashboard-card">
          <CashDashboard key={refreshTrigger} />
        </div>
        <div className="cash-card cash-actions-card">
          <ActionsPanel
            isBoxOpen={isBoxOpen}
            onMovementAdded={handleMovementAdded}
            onBoxClosed={handleBoxClosed}
            onRequestOpenBox={handleRequestOpenBox}
          />
        </div>

        {/* Fila inferior ~60%: izq. Últimos movimientos, der. Cobros de citas */}
        <div className="cash-card cash-movements-card">
          <MovementsList refreshTrigger={refreshTrigger} onMovementUpdated={handleMovementAdded} />
        </div>
        <PendingChargesPanel refreshTrigger={refreshTrigger} />
      </div>
    </>
  );
};

export default CashPage;
