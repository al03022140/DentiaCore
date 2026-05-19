import { useEffect, useState } from 'react';
import { Card, List, Avatar, Typography, Tag } from 'antd';
import { UserOutlined, DollarCircleOutlined, AuditOutlined } from '@ant-design/icons';
import { getLastMovements } from '../../shared/services/cashService';

const { Text } = Typography;

const MovementsList = ({ refreshTrigger }) => {
  const [movements, setMovements] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const data = await getLastMovements();
        if (cancelled) return;
        setMovements(data);
      } catch (error) {
        if (cancelled) return;
        console.error('Error fetching movements:', error);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [refreshTrigger]);

  return (
    <Card 
      title="Últimos Movimientos" 
      bordered={false}
    >
      <div className="movements-list-container">
        <List
          loading={loading}
          itemLayout="horizontal"
          dataSource={movements}
          renderItem={(item) => (
            <List.Item>
              <List.Item.Meta
                avatar={
                  <Avatar 
                    icon={item.type === 'INCOME' ? <UserOutlined /> : <DollarCircleOutlined />} 
                    className={item.type === 'INCOME' ? 'movement-avatar--income' : 'movement-avatar--expense'}
                  />
                }
                title={
                  <div className="movement-item-title">
                    <Text strong>{item.concept}</Text>
                    <span className={item.type === 'INCOME' ? 'movement-amount-income' : 'movement-amount-expense'}>
                      {item.type === 'INCOME' ? '+' : '-'} 
                      {new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0 }).format(item.amount)}
                    </span>
                  </div>
                }
                description={
                  <>
                    <div className="movement-meta">
                      <Text type="secondary" className="movement-patient-name">
                        {item.patientId ? `${item.patientId.primer_nombre} ${item.patientId.apellido_paterno}` : 'General'}
                      </Text>
                      <Tag color={item.paymentMethod === 'CASH' ? 'gold' : 'blue'}>
                        {item.paymentMethod === 'CASH' ? 'Efectivo' : 'Digital'}
                      </Tag>
                    </div>
                    {item.creadoPor && (
                      <div className="movement-audit">
                        <AuditOutlined /> Registrado por: {item.creadoPor.nombre}
                      </div>
                    )}
                  </>
                }
              />
            </List.Item>
          )}
        />
      </div>
    </Card>
  );
};

export default MovementsList;
