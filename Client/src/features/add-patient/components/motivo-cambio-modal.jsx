import { useState, useEffect } from 'react';
import PropTypes from 'prop-types';
import { Modal, Input } from 'antd';
import { IDENTITY_FIELD_LABELS } from '../identity-fields';

const MIN_MOTIVO_LEN = 5;

/**
 * Modal que pide el motivo cuando se editan datos de identidad del paciente
 * (política NOM-004/024: el cambio es válido sin revocar la HC, pero queda
 * en la bitácora con quién, cuándo, valor anterior y este motivo).
 */
const MotivoCambioModal = ({ open, camposCambiados = [], onConfirm, onCancel, loading = false }) => {
  const [motivo, setMotivo] = useState('');
  const [touched, setTouched] = useState(false);

  // Limpiar el texto cada vez que el modal se abre para un nuevo intento.
  useEffect(() => {
    if (open) { setMotivo(''); setTouched(false); }
  }, [open]);

  const motivoValido = motivo.trim().length >= MIN_MOTIVO_LEN;

  const handleOk = () => {
    setTouched(true);
    if (!motivoValido) return;
    onConfirm(motivo.trim());
  };

  return (
    <Modal
      open={open}
      title="Motivo del cambio de datos de identidad"
      okText="Guardar con motivo"
      cancelText="Cancelar"
      onOk={handleOk}
      onCancel={onCancel}
      confirmLoading={loading}
      okButtonProps={{ disabled: !motivoValido }}
      destroyOnClose
    >
      <p>
        Estás cambiando datos de identidad del paciente
        {camposCambiados.length > 0 && (
          <>
            {': '}
            <strong>
              {camposCambiados.map((c) => IDENTITY_FIELD_LABELS[c] || c).join(', ')}
            </strong>
          </>
        )}
        .
      </p>
      <p>
        Por normativa (NOM-004/NOM-024), el cambio quedará registrado en la
        bitácora con el valor anterior, tu usuario y el motivo que indiques.
        No es necesario revocar la historia clínica.
      </p>
      <Input.TextArea
        value={motivo}
        onChange={(e) => setMotivo(e.target.value)}
        onBlur={() => setTouched(true)}
        placeholder="Ej.: Corrección de apellido mal capturado en el alta"
        autoSize={{ minRows: 2, maxRows: 4 }}
        maxLength={300}
        showCount
        autoFocus
      />
      {touched && !motivoValido && (
        <p style={{ color: '#d4380d', marginTop: 8 }}>
          El motivo debe tener al menos {MIN_MOTIVO_LEN} caracteres.
        </p>
      )}
    </Modal>
  );
};

MotivoCambioModal.propTypes = {
  open: PropTypes.bool.isRequired,
  camposCambiados: PropTypes.arrayOf(PropTypes.string),
  onConfirm: PropTypes.func.isRequired,
  onCancel: PropTypes.func.isRequired,
  loading: PropTypes.bool,
};

export default MotivoCambioModal;
