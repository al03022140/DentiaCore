import { useState, useEffect } from 'react';
import { Card, Typography, Radio, Skeleton, Button } from 'antd';
import { EyeOutlined, EyeInvisibleOutlined } from '@ant-design/icons';
import { getMonthlyBalance } from '../../shared/services/cashService';

const { Text } = Typography;

const CashDashboard = () => {
  const [balance, setBalance] = useState({ cash: 0, digital: 0, total: 0 });
  const [isVisible, setIsVisible] = useState(true);
  const [filter, setFilter] = useState('total');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchBalance = async () => {
      try {
        const data = await getMonthlyBalance();
        setBalance(data);
      } catch (error) {
        console.error('Error loading balance:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchBalance();
  }, []);

  const getDisplayAmount = () => {
    if (!isVisible) return '••••••';
    
    let amount = 0;
    switch (filter) {
      case 'cash':
        amount = balance.cash;
        break;
      case 'digital':
        amount = balance.digital;
        break;
      default:
        amount = balance.total;
    }
    
    return new Intl.NumberFormat('es-CO', {
      style: 'currency',
      currency: 'COP',
      minimumFractionDigits: 0
    }).format(amount);
  };

  return (
    <Card 
      title="Ganancias y Estado" 
      bordered={false}
      extra={
        <Button 
          type="text" 
          icon={isVisible ? <EyeOutlined /> : <EyeInvisibleOutlined />} 
          onClick={() => setIsVisible(!isVisible)}
        />
      }
    >
      <div className="balance-display">
        {loading ? (
          <Skeleton.Input active size="large" />
        ) : (
          <p className="balance-amount">
            {getDisplayAmount()}
          </p>
        )}
        <span className="balance-label">
          {filter === 'total' ? 'Total consolidado' : filter === 'cash' ? 'Efectivo en caja' : 'Bancos y digital'}
        </span>
      </div>

      <div className="filter-container">
        <Radio.Group 
          value={filter} 
          onChange={(e) => setFilter(e.target.value)}
          buttonStyle="solid"
        >
          <Radio.Button value="cash">Efectivo</Radio.Button>
          <Radio.Button value="digital">Digital</Radio.Button>
          <Radio.Button value="total">Ambos</Radio.Button>
        </Radio.Group>
      </div>
    </Card>
  );
};

export default CashDashboard;
