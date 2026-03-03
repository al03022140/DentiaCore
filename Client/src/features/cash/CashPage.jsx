import { useState, useEffect } from 'react';
import { Spin, message } from 'antd';
import CashDashboard from './CashDashboard';
import ActionsPanel from './ActionsPanel';
import MovementsList from './MovementsList';
import OpenBoxModal from './OpenBoxModal';
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
    checkStatus();
  }, []);

  const handleOpenSuccess = () => {
    setIsBoxOpen(true);
    setShowOpenModal(false);
    setRefreshTrigger(prev => prev + 1);
  };

  const handleMovementAdded = () => {
    setRefreshTrigger(prev => prev + 1);
  };

  if (loading) {
    return <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%' }}><Spin size="large" /></div>;
  }

  return (
    <div className="cash-page">
      <OpenBoxModal visible={showOpenModal} onOpenSuccess={handleOpenSuccess} />

      {/* Columna Izquierda */}
      <div className="cash-left-section">
        {/* Panel Superior: Ganancias y Estado */}
        <div className="cash-card cash-dashboard-card">
          <CashDashboard key={refreshTrigger} />
        </div>
        
        {/* Panel Inferior: Acciones Operativas */}
        <div className="cash-card cash-actions-card">
          <ActionsPanel onMovementAdded={handleMovementAdded} />
        </div>
      </div>

      {/* Columna Derecha */}
      <div className="cash-right-section">
        <div className="cash-card cash-movements-card">
          <MovementsList refreshTrigger={refreshTrigger} />
        </div>
      </div>
    </div>
  );
};

export default CashPage;
