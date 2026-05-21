import { useState } from 'react';
import { Modal, InputNumber, Button, message } from 'antd';
import { openBox } from '../../shared/services/cashService';

const OpenBoxModal = ({ visible, onOpenSuccess, onCancel }) => {
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
      title="Apertura de Caja"
      footer={[
        <Button key="submit" type="primary" loading={loading} onClick={handleOpen} size="large" block>
          Abrir Caja
        </Button>
      ]}
      closable={true}
      onCancel={onCancel}
      maskClosable={true}
      centered
    >
      <div className="open-box-modal__body">
        <p className="open-box-modal__hint">
          Ingrese el monto inicial en efectivo para cambio:
        </p>
        <InputNumber
          className="open-box-modal__input"
          size="large"
          prefix="$"
          min={0}
          max={100000000}
          step={0.01}
          precision={2}
          value={amount}
          onChange={setAmount}
          formatter={value => `${value}`.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}
          parser={value => value.replace(/\$\s?|(,*)/g, '')}
        />
      </div>
    </Modal>
  );
};

export default OpenBoxModal;
