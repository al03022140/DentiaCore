import { useEffect, useState, useCallback } from 'react';
import { List, Avatar, Typography, Tag, Button, Modal, Form, InputNumber, Input, Radio, Tooltip, message } from 'antd';
import {
  UserOutlined,
  DollarCircleOutlined,
  AuditOutlined,
  EditOutlined,
  HistoryOutlined,
  LockOutlined
} from '@ant-design/icons';
import { getLastMovements, updateMovement } from '../../shared/services/cashService';

import { formatMoney } from '../../shared/utils/money';

const { Text } = Typography;

const formatMXN = (amount) => formatMoney(amount, { showDecimals: false });

const formatDateTime = (dateStr) => {
  if (!dateStr) return '';
  return new Date(dateStr).toLocaleString('es-MX', {
    day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit'
  });
};

const describeChanges = (changes) => {
  if (!changes || typeof changes !== 'object') return null;
  const labels = {
    amount: 'Monto',
    paymentMethod: 'Método',
    concept: 'Concepto',
    patientId: 'Paciente'
  };
  const formatVal = (field, val) => {
    if (val === null || val === undefined || val === '') return '—';
    if (field === 'amount') return formatMXN(val);
    if (field === 'paymentMethod') return val === 'CASH' ? 'Efectivo' : 'Digital';
    return String(val);
  };
  return Object.entries(changes).map(([field, { from, to }]) => (
    `${labels[field] || field}: ${formatVal(field, from)} → ${formatVal(field, to)}`
  ));
};

const MovementsList = ({ refreshTrigger, onMovementUpdated }) => {
  const [movements, setMovements] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(null); // movement object o null
  const [saving, setSaving] = useState(false);
  const [form] = Form.useForm();

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const data = await getLastMovements();
      setMovements(Array.isArray(data) ? data : []);
    } catch (error) {
      console.error('Error fetching movements:', error);
      setMovements([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load, refreshTrigger]);

  const openEditModal = (movement) => {
    if (movement.linkedChargeId) return; // bloqueado: pago de cobro
    setEditing(movement);
    form.resetFields();
    form.setFieldsValue({
      amount: movement.amount,
      paymentMethod: movement.paymentMethod,
      concept: movement.concept,
      reason: ''
    });
  };

  const closeEditModal = () => {
    if (saving) return;
    setEditing(null);
    form.resetFields();
  };

  const handleSubmit = async () => {
    if (!editing) return;
    try {
      const values = await form.validateFields();
      setSaving(true);
      const payload = {
        amount: values.amount,
        paymentMethod: values.paymentMethod,
        concept: values.concept?.trim(),
        reason: values.reason.trim()
      };
      await updateMovement(editing._id, payload);
      message.success('Movimiento actualizado');
      setEditing(null);
      form.resetFields();
      await load();
      onMovementUpdated?.();
    } catch (err) {
      if (err?.errorFields) return; // validation
      message.error(err.response?.data?.message || 'No se pudo editar el movimiento');
    } finally {
      setSaving(false);
    }
  };

  const renderEditHistory = (edits) => {
    if (!edits?.length) return null;
    return (
      <div className="movement-edit-history">
        <div className="movement-edit-history__title">
          <HistoryOutlined /> Historial de ediciones
        </div>
        {edits.map((e, idx) => (
          <div key={idx} className="movement-edit-history__entry">
            <div className="movement-edit-history__head">
              <span>{formatDateTime(e.editedAt)}</span>
              <span>{e.editedBy?.nombre || 'Usuario desconocido'}</span>
            </div>
            <div className="movement-edit-history__reason">"{e.reason}"</div>
            <ul className="movement-edit-history__changes">
              {(describeChanges(e.changes) || []).map((line, i) => (
                <li key={i}>{line}</li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    );
  };

  return (
    <>
      <div className="cash-card__header">
        <h2 className="cash-card__title">Últimos Movimientos</h2>
      </div>

      <div className="movements-list-container">
        <List
          loading={loading}
          itemLayout="horizontal"
          dataSource={movements}
          renderItem={(item) => {
            const hasEdits = Array.isArray(item.edits) && item.edits.length > 0;
            const isLinked = !!item.linkedChargeId;
            return (
              <List.Item
                actions={[
                  isLinked ? (
                    <Tooltip key="locked" title="Pago de cobro · edítalo desde el expediente del paciente">
                      <Button type="text" size="small" icon={<LockOutlined />} disabled />
                    </Tooltip>
                  ) : (
                    <Tooltip key="edit" title="Editar movimiento">
                      <Button
                        type="text"
                        size="small"
                        icon={<EditOutlined />}
                        onClick={() => openEditModal(item)}
                        aria-label="Editar"
                      />
                    </Tooltip>
                  )
                ]}
              >
                <List.Item.Meta
                  avatar={
                    <Avatar
                      icon={item.type === 'INCOME' ? <UserOutlined /> : <DollarCircleOutlined />}
                      className={item.type === 'INCOME' ? 'movement-avatar--income' : 'movement-avatar--expense'}
                    />
                  }
                  title={
                    <div className="movement-item-title">
                      <span className="movement-concept">
                        <Text strong>{item.concept}</Text>
                        {hasEdits && (
                          <Tooltip
                            title={renderEditHistory(item.edits)}
                            overlayClassName="movement-edit-history-tooltip"
                            placement="bottom"
                          >
                            <span className="movement-edit-badge">
                              <HistoryOutlined /> editado
                            </span>
                          </Tooltip>
                        )}
                      </span>
                      <span className={item.type === 'INCOME' ? 'movement-amount-income' : 'movement-amount-expense'}>
                        {item.type === 'INCOME' ? '+' : '−'}
                        {formatMXN(item.amount)}
                      </span>
                    </div>
                  }
                  description={
                    <>
                      <div className="movement-meta">
                        <Text type="secondary" className="movement-patient-name">
                          {item.patientId
                            ? `${item.patientId.primer_nombre || ''} ${item.patientId.apellido_paterno || ''}`.trim() || 'Paciente'
                            : 'General'}
                        </Text>
                        <Tag color={item.paymentMethod === 'CASH' ? 'gold' : 'blue'}>
                          {item.paymentMethod === 'CASH' ? 'Efectivo' : 'Digital'}
                        </Tag>
                      </div>
                      {item.creadoPor && (
                        <div className="movement-audit">
                          <AuditOutlined /> {formatDateTime(item.date)} · {item.creadoPor.nombre}
                        </div>
                      )}
                    </>
                  }
                />
              </List.Item>
            );
          }}
        />
      </div>

      <Modal
        title="Editar movimiento"
        open={!!editing}
        onOk={handleSubmit}
        onCancel={closeEditModal}
        confirmLoading={saving}
        okText="Guardar cambios"
        cancelText="Cancelar"
        destroyOnClose
      >
        {editing && (
          <Form form={form} layout="vertical">
            <div className="edit-movement__notice">
              <Text type="secondary">
                Tipo: <strong>{editing.type === 'INCOME' ? 'Ingreso' : 'Retiro / Gasto'}</strong> ·
                Registrado por <strong>{editing.creadoPor?.nombre || 'desconocido'}</strong> el {formatDateTime(editing.date)}
              </Text>
            </div>

            <Form.Item
              name="amount"
              label="Monto"
              rules={[
                { required: true, message: 'Ingrese el monto' },
                { type: 'number', min: 0.01, message: 'Debe ser mayor a 0' }
              ]}
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

            <Form.Item name="paymentMethod" label="Método de Pago" rules={[{ required: true }]}>
              <Radio.Group buttonStyle="solid">
                <Radio.Button value="CASH">Efectivo</Radio.Button>
                <Radio.Button value="DIGITAL">Digital / Banco</Radio.Button>
              </Radio.Group>
            </Form.Item>

            <Form.Item
              name="concept"
              label="Concepto"
              rules={[{ required: true, message: 'Concepto obligatorio' }]}
            >
              <Input />
            </Form.Item>

            <Form.Item
              name="reason"
              label="Motivo del cambio"
              tooltip="Quedará registrado en el historial del movimiento"
              rules={[
                { required: true, message: 'El motivo es obligatorio' },
                { min: 3, message: 'Mínimo 3 caracteres' }
              ]}
            >
              <Input.TextArea rows={2} placeholder="Ej. Se cobró $5.000 de más por error" maxLength={200} showCount />
            </Form.Item>

            {Array.isArray(editing.edits) && editing.edits.length > 0 && (
              <div className="edit-movement__history">
                <div className="edit-movement__history-title">
                  <HistoryOutlined /> Ediciones previas
                </div>
                {editing.edits.map((e, idx) => (
                  <div key={idx} className="edit-movement__history-entry">
                    <div className="edit-movement__history-head">
                      {formatDateTime(e.editedAt)} · {e.editedBy?.nombre || 'desconocido'}
                    </div>
                    <div className="edit-movement__history-reason">"{e.reason}"</div>
                    <ul>
                      {(describeChanges(e.changes) || []).map((line, i) => (
                        <li key={i}>{line}</li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            )}
          </Form>
        )}
      </Modal>
    </>
  );
};

export default MovementsList;
