import { useState } from 'react';
import { Card, Button, Modal, Form, Input, InputNumber, Radio, message } from 'antd';
import { PlusCircleOutlined, MinusCircleOutlined, ExclamationCircleFilled } from '@ant-design/icons';
import { addMovement, closeBox } from '../../shared/services/cashService';

const { confirm } = Modal;

const ActionsPanel = ({ onMovementAdded }) => {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [actionType, setActionType] = useState('INCOME'); // INCOME or EXPENSE
  const [loading, setLoading] = useState(false);
  const [form] = Form.useForm();

  const showModal = (type) => {
    setActionType(type);
    setIsModalOpen(true);
    form.resetFields();
    form.setFieldsValue({ paymentMethod: 'CASH' });
  };

  const handleOk = async () => {
    try {
      const values = await form.validateFields();
      setLoading(true);
      
      await addMovement({
        ...values,
        type: actionType
      });

      message.success('Movimiento registrado correctamente');
      setIsModalOpen(false);
      onMovementAdded();
    } catch (error) {
      console.error(error);
      message.error(error.response?.data?.message || 'Error al registrar movimiento');
    } finally {
      setLoading(false);
    }
  };

  const handleCloseBox = () => {
    confirm({
      title: '¿Cerrar Caja?',
      icon: <ExclamationCircleFilled />,
      content: 'Se generará el corte de caja y no podrá registrar más movimientos hasta abrir una nueva sesión.',
      okText: 'Cerrar Caja',
      okType: 'danger',
      cancelText: 'Cancelar',
      onOk: async () => {
        try {
          await closeBox();
          message.success('Caja cerrada correctamente');
          window.location.reload(); // Recargar para volver al estado inicial (Modal de apertura)
        } catch (error) {
          message.error('Error al cerrar la caja');
        }
      },
    });
  };

  return (
    <Card 
      title="Acciones Operativas" 
      bordered={false}
      extra={<Button type="link" danger onClick={handleCloseBox}>Cerrar Caja</Button>}
    >
      <div className="actions-container">
        <Button 
          type="primary" 
          size="large" 
          icon={<PlusCircleOutlined />} 
          className="action-button action-button--income"
          onClick={() => showModal('INCOME')}
        >
          Ingresar
        </Button>
        <Button 
          type="primary" 
          danger 
          size="large" 
          icon={<MinusCircleOutlined />} 
          className="action-button"
          onClick={() => showModal('EXPENSE')}
        >
          Retirar
        </Button>
      </div>

      <Modal
        title={actionType === 'INCOME' ? "Registrar Ingreso" : "Registrar Retiro/Gasto"}
        open={isModalOpen}
        onOk={handleOk}
        onCancel={() => setIsModalOpen(false)}
        confirmLoading={loading}
        okText="Registrar"
        cancelText="Cancelar"
        okButtonProps={{ danger: actionType === 'EXPENSE', className: actionType === 'INCOME' ? 'action-button--income' : '' }}
      >
        <Form form={form} layout="vertical">
          <Form.Item 
            name="amount" 
            label="Monto" 
            rules={[{ required: true, message: 'Ingrese el monto' }]}
          >
            <InputNumber 
              style={{ width: '100%' }} 
              prefix="$" 
              formatter={value => `${value}`.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}
              parser={value => value.replace(/\$\s?|(,*)/g, '')}
            />
          </Form.Item>

          <Form.Item 
            name="paymentMethod" 
            label="Método de Pago" 
            rules={[{ required: true }]}
          >
            <Radio.Group buttonStyle="solid">
              <Radio.Button value="CASH">Efectivo</Radio.Button>
              <Radio.Button value="DIGITAL">Digital / Banco</Radio.Button>
            </Radio.Group>
          </Form.Item>

          <Form.Item 
            name="concept" 
            label="Concepto" 
            rules={[{ required: true, message: 'Ingrese el concepto' }]}
          >
            <Input placeholder="Ej. Consulta, Pago de luz, Insumos..." />
          </Form.Item>
        </Form>
      </Modal>
    </Card>
  );
};

export default ActionsPanel;
