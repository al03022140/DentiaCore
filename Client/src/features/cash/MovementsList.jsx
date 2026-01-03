import React, { useEffect, useState } from 'react';
import { Card, List, Avatar, Typography, Tag } from 'antd';
import { UserOutlined, DollarCircleOutlined } from '@ant-design/icons';
import { getLastMovements } from '../../shared/services/cashService';

const { Text } = Typography;

const MovementsList = ({ refreshTrigger }) => {
  const [movements, setMovements] = useState([]);
  const [loading, setLoading] = useState(true);

  const fetchMovements = async () => {
    try {
      const data = await getLastMovements();
      setMovements(data);
    } catch (error) {
      console.error('Error fetching movements:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchMovements();
  }, [refreshTrigger]);

  return (
    <Card 
      title="Últimos Movimientos" 
      bordered={false}
      style={{ height: '100%', background: 'transparent' }}
      headStyle={{ borderBottom: '1px solid #f0f0f0', padding: 0 }}
      bodyStyle={{ padding: 0, height: 'calc(100% - 57px)' }}
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
                    style={{ backgroundColor: item.type === 'INCOME' ? '#87d068' : '#f56a00' }}
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
                  <div className="movement-meta">
                    <Text type="secondary" style={{ fontSize: '12px' }}>
                      {item.patientId ? `${item.patientId.primer_nombre} ${item.patientId.apellido_paterno}` : 'General'}
                    </Text>
                    <Tag color={item.paymentMethod === 'CASH' ? 'gold' : 'blue'}>
                      {item.paymentMethod === 'CASH' ? 'Efectivo' : 'Digital'}
                    </Tag>
                  </div>
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
