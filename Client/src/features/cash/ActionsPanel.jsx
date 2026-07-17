import { useState, useCallback, useRef } from 'react';
import { Button, Modal, Form, Input, InputNumber, Radio, Select, message, Descriptions } from 'antd';
import { PlusCircleOutlined, MinusCircleOutlined, ExclamationCircleFilled, SearchOutlined, LockOutlined } from '@ant-design/icons';
import { addMovement, closeBox } from '../../shared/services/cashService';
import { getAllPatients } from '../../shared/services/patient-service';
import { formatMoneyCompact as formatMXN } from '../../shared/utils/money';

const { confirm } = Modal;

const ActionsPanel = ({ isBoxOpen, onMovementAdded, onBoxClosed, onRequestOpenBox }) => {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [actionType, setActionType] = useState('INCOME'); // INCOME or EXPENSE
  const [loading, setLoading] = useState(false);
  const [form] = Form.useForm();
  const [patients, setPatients] = useState([]);
  const [patientsLoading, setPatientsLoading] = useState(false);
  const [summaryVisible, setSummaryVisible] = useState(false);
  const [closeSummary, setCloseSummary] = useState(null);
  // Guard síncrono contra doble submit: el await de validateFields cede el
  // hilo ANTES de que confirmLoading deshabilite el botón OK, así que un
  // doble click rápido colaría dos POST (movimiento duplicado en el ledger).
  const submittingRef = useRef(false);

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

  const showModal = (type) => {
    setActionType(type);
    setIsModalOpen(true);
    form.resetFields();
    form.setFieldsValue({ paymentMethod: 'CASH' });
    if (type === 'INCOME') fetchPatients();
  };

  const handleOk = async () => {
    if (submittingRef.current) return;
    submittingRef.current = true;
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
      // Reject de validateFields (campos incompletos): el Form ya muestra los
      // errores inline — no confundir con un error de servidor.
      if (error?.errorFields) return;
      console.error(error);
      message.error(error.response?.data?.message || 'Error al registrar movimiento');
    } finally {
      submittingRef.current = false;
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
          // BUG-B8: mostrar el error real (ej. "No hay caja abierta para cerrar")
          message.error(error?.response?.data?.message || 'Error al cerrar la caja');
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
    <>
      <div className="cash-card__header">
        <h2 className="cash-card__title">Acciones Operativas</h2>
        <div className="cash-card__extra">
          {isBoxOpen
            ? <Button type="link" danger onClick={handleCloseBox}>Cerrar Caja</Button>
            : <Button type="link" className="cash-open-glow" onClick={onRequestOpenBox}>Abrir Caja</Button>}
        </div>
      </div>

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
        okButtonProps={{ danger: actionType === 'EXPENSE' }}
      >
        <Form form={form} layout="vertical">
          <Form.Item
            name="amount"
            label="Monto"
            rules={[{ required: true, message: 'Ingrese el monto' }, { type: 'number', min: 0.01, message: 'El monto debe ser mayor a 0' }]}
          >
            <InputNumber
              style={{ width: '100%' }}
              prefix="$"
              min={0.01}
              max={100000000}
              step={0.01}
              precision={2}
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
            <Descriptions.Item label="Monto Inicial">{formatMXN(closeSummary.initialAmount)}</Descriptions.Item>
            <Descriptions.Item label="Efectivo Final">{formatMXN(closeSummary.finalCashAmount)}</Descriptions.Item>
            <Descriptions.Item label="Total Ingresos"><span style={{ color: 'var(--color-success)', fontWeight: 600 }}>{formatMXN(closeSummary.totalIncome)}</span></Descriptions.Item>
            <Descriptions.Item label="Total Egresos"><span style={{ color: 'var(--color-danger)', fontWeight: 600 }}>{formatMXN(closeSummary.totalExpense)}</span></Descriptions.Item>
            <Descriptions.Item label="Ing. Efectivo">{formatMXN(closeSummary.cashIncome)}</Descriptions.Item>
            <Descriptions.Item label="Ing. Digital">{formatMXN(closeSummary.digitalIncome)}</Descriptions.Item>
            <Descriptions.Item label="Egr. Efectivo">{formatMXN(closeSummary.cashExpense)}</Descriptions.Item>
            <Descriptions.Item label="Egr. Digital">{formatMXN(closeSummary.digitalExpense)}</Descriptions.Item>
            <Descriptions.Item label="Movimientos">{closeSummary.movementCount}</Descriptions.Item>
            <Descriptions.Item label="Balance Neto"><span style={{ color: closeSummary.net >= 0 ? 'var(--color-success)' : 'var(--color-danger)', fontWeight: 600 }}>{formatMXN(closeSummary.net)}</span></Descriptions.Item>
          </Descriptions>
        )}
      </Modal>
    </>
  );
};

export default ActionsPanel;
