import { useState, useEffect, useCallback } from 'react';
import PropTypes from 'prop-types';
import { Skeleton, Empty, Pagination, Tag, Tooltip } from 'antd';
import API from '../../../shared/services/axios-instance';
import { IDENTITY_FIELD_LABELS } from '../../add-patient/identity-fields';
import '../styles/patient-change-history.css';

// Etiquetas legibles para campos administrativos comunes del historial.
const FIELD_LABELS = {
  ...IDENTITY_FIELD_LABELS,
  email: 'Correo electrónico',
  estado_civil: 'Estado civil',
  nacionalidad: 'Nacionalidad',
  lugar_nacimiento: 'Lugar de nacimiento',
  escolaridad: 'Escolaridad',
  ocupacion: 'Ocupación',
  situacion_laboral: 'Situación laboral',
  contacto: 'Datos de contacto',
  contactos_emergencia: 'Contactos de emergencia',
  antecedentes_heredo_familiares: 'Antecedentes heredo-familiares',
  encuesta_medica: 'Encuesta médica',
  informacion_femenina: 'Información femenina',
  habitos_higiene: 'Hábitos de higiene',
  evaluacion_dental_oclusal: 'Evaluación dental y oclusal',
  datosNoCompartir: 'Preferencia de no compartir datos',
};

const fieldLabel = (campo) => FIELD_LABELS[campo] || campo.replace(/_/g, ' ');

const formatFecha = (iso) => {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return String(iso ?? '');
  return d.toLocaleString('es-MX', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
};

const renderValor = (v) => (v === null || v === '' ? <em className="pch-empty">vacío</em> : v);

/**
 * Historial de cambios de la ficha del paciente (NOM-024, trazabilidad).
 * Lee GET /patients/:id/change-history — el backend construye los diffs
 * campo a campo desde la bitácora inmutable (cadena HMAC).
 */
const PatientChangeHistory = ({ patientId }) => {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [page, setPage] = useState(1);

  const fetchHistory = useCallback(async (targetPage) => {
    setLoading(true);
    setError(null);
    try {
      const res = await API.get(`/patients/${patientId}/change-history`, {
        params: { page: targetPage, limit: 25 },
      });
      setData(res.data);
    } catch (err) {
      if (err?.response?.status === 403) {
        setError('No tienes permiso para ver el historial de cambios.');
      } else {
        setError('No se pudo cargar el historial de cambios.');
      }
    } finally {
      setLoading(false);
    }
  }, [patientId]);

  useEffect(() => { fetchHistory(page); }, [fetchHistory, page]);

  if (loading) return <Skeleton active paragraph={{ rows: 4 }} />;
  if (error) return <div className="pch-error">{error}</div>;

  const historial = data?.historial || [];
  if (historial.length === 0) {
    return (
      <Empty
        description="Sin cambios registrados en la ficha"
        image={Empty.PRESENTED_IMAGE_SIMPLE}
      />
    );
  }

  return (
    <div className="patient-change-history">
      <p className="pch-intro">
        Cada modificación de la ficha queda registrada de forma permanente en la
        bitácora del sistema: quién la hizo, cuándo, el valor anterior y —para
        datos de identidad— el motivo del cambio.
      </p>

      <ul className="pch-list">
        {historial.map((entry) => (
          <li key={entry._id} className={`pch-entry pch-entry--${entry.evento}`}>
            <div className="pch-entry-header">
              <span className="pch-fecha">{formatFecha(entry.fecha)}</span>
              <span className="pch-usuario">
                {entry.usuario}
                {entry.rol ? <span className="pch-rol"> · {entry.rol}</span> : null}
              </span>
              {entry.evento === 'alta' && <Tag color="green">Alta del paciente</Tag>}
              {entry.hcFirmadaVigente && (
                <Tooltip title="La corrección se hizo con la historia clínica firmada vigente; la firma conserva su sello original y este cambio quedó auditado.">
                  <Tag color="gold">Identidad corregida post-firma</Tag>
                </Tooltip>
              )}
            </div>

            {entry.motivo && (
              <div className="pch-motivo">
                <strong>Motivo:</strong> {entry.motivo}
              </div>
            )}

            {entry.cambios.length > 0 && (
              <table className="pch-table">
                <thead>
                  <tr>
                    <th>Campo</th>
                    <th>Antes</th>
                    <th>Después</th>
                  </tr>
                </thead>
                <tbody>
                  {entry.cambios.map((c) => (
                    <tr key={c.campo}>
                      <td>
                        {fieldLabel(c.campo)}
                        {c.esIdentidad && <Tag className="pch-tag-identidad">identidad</Tag>}
                      </td>
                      {c.tipo === 'seccion' ? (
                        <td colSpan={2}><em>Sección actualizada</em></td>
                      ) : (
                        <>
                          <td className="pch-antes">{renderValor(c.antes)}</td>
                          <td className="pch-despues">{renderValor(c.despues)}</td>
                        </>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </li>
        ))}
      </ul>

      {data.total > data.limit && (
        <Pagination
          current={data.page}
          pageSize={data.limit}
          total={data.total}
          onChange={(p) => setPage(p)}
          size="small"
          showSizeChanger={false}
        />
      )}
    </div>
  );
};

PatientChangeHistory.propTypes = {
  patientId: PropTypes.string.isRequired,
};

export default PatientChangeHistory;
