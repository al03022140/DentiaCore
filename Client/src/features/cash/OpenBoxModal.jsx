import React, { useState } from 'react';
import { Modal, InputNumber, Typography, Button, message } from 'antd';
import { openBox } from '../../shared/services/cashService';

const { Title, Text } = Typography;

const OpenBoxModal = ({ visible, onOpenSuccess }) => {
  const [amount, setAmount] = useState(0);
  const [loading, setLoading] = useState(false);

  const handleOpen = async () => {
    setLoading(true);
    try {
      await openBox(amount);
      message.success('Caja abierta correctamente');
      onOpenSuccess();
    } catch (error) {
      message.error('Error al abrir la caja');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal
      open={visible}
      title={<Title level={3}>Apertura de Caja</Title>}
      footer={[
        <Button key="submit" type="primary" loading={loading} onClick={handleOpen} size="large" block>
          Abrir Caja
        </Button>
      ]}
      closable={false}
      maskClosable={false}
      centered
    >
      <div style={{ textAlign: 'center', padding: '20px 0' }}>
        <Text>Ingrese el monto inicial en efectivo para cambio:</Text>
        <div style={{ marginTop: '15px' }}>
          <InputNumber
            style={{ width: '100%' }}
            size="large"
            prefix="$"
            min={0}
            value={amount}
            onChange={setAmount}
            formatter={value => `${value}`.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}
            parser={value => value.replace(/\$\s?|(,*)/g, '')}
          />
        </div>
      </div>
    </Modal>
  );
};

export default OpenBoxModal;
