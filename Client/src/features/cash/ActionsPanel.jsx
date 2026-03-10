import { useState, useEffect, useCallback } from 'react';
import { Card, Button, Modal, Form, Input, InputNumber, Radio, Select, message, Descriptions, Statistic } from 'antd';
import { PlusCircleOutlined, MinusCircleOutlined, ExclamationCircleFilled, SearchOutlined, LockOutlined } from '@ant-design/icons';
import { addMovement, closeBox } from '../../shared/services/cashService';
import { getAllPatients } from '../../shared/services/api';

const { confirm } = Modal;

const formatCOP = (value) => new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0 }).format(value);

const ActionsPanel = ({ isBoxOpen, onMovementAdded, onBoxClosed, onRequestOpenBox }) => {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [actionType, setActionType] = useState('INCOME'); // INCOME or EXPENSE
  const [loading, setLoading] = useState(false);
  const [form] = Form.useForm();
  const [patients, setPatients] = useState([]);
  const [patientsLoading, setPatientsLoading] = useState(false);
  const [summaryVisible, setSummaryVisible] = useState(false);
  const [closeSummary, setCloseSummary] = useState(null);

  const fetchPatients = useCallback(async () => {
    setPatientsLoading(true);
    try {
      const data = await getAllPatients();
      const list = data?.patients ?? data ?? [];
      setPatients(Array.isArray(list) ? list : []);
    } catch (_err) {
      setPatients([]);
    } finally {
      setPatientsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchPatients();
  }, [fetchPatients]);

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
          const result = await closeBox();
          setCloseSummary(result.summary);
          setSummaryVisible(true);
        } catch (error) {
          message.error('Error al cerrar la caja');
        }
      },
    });
  };

  const handleSummaryClose = () => {
    setSummaryVisible(false);
    setCloseSummary(null);
    onBoxClosed();
  };

  return (
    <Card 
      title="Acciones Operativas" 
      bordered={false}
      extra={
        isBoxOpen
          ? <Button type="link" danger onClick={handleCloseBox}>Cerrar Caja</Button>
          : <Button type="link" onClick={onRequestOpenBox}>Abrir Caja</Button>
      }
    >
      <div className="actions-container">
        <Button 
          type="primary" 
          size="large" 
          icon={isBoxOpen ? <PlusCircleOutlined /> : <LockOutlined />} 
          className="action-button action-button--income"
          onClick={() => showModal('INCOME')}
          disabled={!isBoxOpen}
        >
          Ingresar
        </Button>
        <Button 
          type="primary" 
          danger 
          size="large" 
          icon={isBoxOpen ? <MinusCircleOutlined /> : <LockOutlined />} 
          className="action-button"
          onClick={() => showModal('EXPENSE')}
          disabled={!isBoxOpen}
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

          {actionType === 'INCOME' && (
            <Form.Item name="patientId" label="Paciente (opcional)">
              <Select
                showSearch
                allowClear
                placeholder="Buscar paciente..."
                loading={patientsLoading}
                suffixIcon={<SearchOutlined />}
                filterOption={(input, option) =>
                  (option?.label ?? '').toLowerCase().includes(input.toLowerCase())
                }
                options={patients.map(p => ({
                  value: p._id,
                  label: `${p.primer_nombre || ''} ${p.apellido_paterno || ''}`.trim()
                }))}
              />
            </Form.Item>
          )}
        </Form>
      </Modal>

      <Modal
        title="Resumen de Corte de Caja"
        open={summaryVisible}
        onCancel={handleSummaryClose}
        footer={[
          <Button key="close" type="primary" onClick={handleSummaryClose}>
            Aceptar
          </Button>
        ]}
        closable={false}
        maskClosable={false}
        centered
      >
        {closeSummary && (
          <Descriptions column={2} bordered size="small">
            <Descriptions.Item label="Monto Inicial">{formatCOP(closeSummary.initialAmount)}</Descriptions.Item>
            <Descriptions.Item label="Efectivo Final">{formatCOP(closeSummary.finalCashAmount)}</Descriptions.Item>
            <Descriptions.Item label="Total Ingresos"><Statistic value={closeSummary.totalIncome} prefix="$" valueStyle={{ color: '#52c41a', fontSize: 14 }} /></Descriptions.Item>
            <Descriptions.Item label="Total Egresos"><Statistic value={closeSummary.totalExpense} prefix="$" valueStyle={{ color: '#ff4d4f', fontSize: 14 }} /></Descriptions.Item>
            <Descriptions.Item label="Ing. Efectivo">{formatCOP(closeSummary.cashIncome)}</Descriptions.Item>
            <Descriptions.Item label="Ing. Digital">{formatCOP(closeSummary.digitalIncome)}</Descriptions.Item>
            <Descriptions.Item label="Egr. Efectivo">{formatCOP(closeSummary.cashExpense)}</Descriptions.Item>
            <Descriptions.Item label="Egr. Digital">{formatCOP(closeSummary.digitalExpense)}</Descriptions.Item>
            <Descriptions.Item label="Movimientos">{closeSummary.movementCount}</Descriptions.Item>
            <Descriptions.Item label="Balance Neto"><Statistic value={closeSummary.net} prefix="$" valueStyle={{ color: closeSummary.net >= 0 ? '#52c41a' : '#ff4d4f', fontSize: 14 }} /></Descriptions.Item>
          </Descriptions>
        )}
      </Modal>
    </Card>
  );
};

export default ActionsPanel;
