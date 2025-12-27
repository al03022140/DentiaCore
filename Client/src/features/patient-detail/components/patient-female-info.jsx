import React from 'react';
import PropTypes from 'prop-types';
import SectionHeader from './section-header';
import "../styles/patient-female-info.css";

// Componente para mostrar información específica femenina
const PatientFemaleInfo = ({ informacion_femenina = null, sexo = "" }) => {
  const sectionId = `female-info-${React.useId()}`;

  // Solo mostrar si el paciente es mujer y hay información
  if (sexo !== "Femenino" || !informacion_femenina) {
    return null;
  }

  const {
    ha_estado_embarazada,
    como_fue_parto,
    tipo_parto_detallado,
    complicaciones_parto,
    fecha_ultimo_parto,
    menopausia,
    alteraciones_ciclo_menstrual,
    fecha_ultima_menstruacion,
    toma_anticonceptivos
  } = informacion_femenina;

  const formatDate = (date) => {
    if (!date) return 'No especificado';
    return new Date(date).toLocaleDateString('es-ES');
  };

  const formatBoolean = (value) => {
    return value ? 'Sí' : 'No';
  };

  return (
    <section
      className="patient-detail__section"
      aria-labelledby={sectionId}
    >
      <SectionHeader title="Información Específica Femenina" id={sectionId} />
      
      <article className="patient-detail__subsection">
        <h3>Información Reproductiva</h3>
        <dl className="medical-data-list">
          <div>
            <dt>¿Ha estado embarazada?:</dt>
            <dd>{formatBoolean(ha_estado_embarazada)}</dd>
          </div>

          {ha_estado_embarazada && (
            <>
              <div>
                <dt>Tipo de parto:</dt>
                <dd>{como_fue_parto || 'No especificado'}</dd>
              </div>

              {tipo_parto_detallado && (
                <div>
                  <dt>Detalle del parto:</dt>
                  <dd>{tipo_parto_detallado}</dd>
                </div>
              )}

              <div>
                <dt>Fecha último parto:</dt>
                <dd>{formatDate(fecha_ultimo_parto)}</dd>
              </div>
            </>
          )}

          <div>
            <dt>Menopausia:</dt>
            <dd>{formatBoolean(menopausia)}</dd>
          </div>

          <div>
            <dt>Alteraciones ciclo menstrual:</dt>
            <dd>{formatBoolean(alteraciones_ciclo_menstrual)}</dd>
          </div>

          {!menopausia && (
            <div>
              <dt>Fecha última menstruación:</dt>
              <dd>{formatDate(fecha_ultima_menstruacion)}</dd>
            </div>
          )}

          <div>
            <dt>Toma anticonceptivos:</dt>
            <dd>{formatBoolean(toma_anticonceptivos)}</dd>
          </div>
        </dl>
        {complicaciones_parto && (
          <p><strong>Complicaciones del parto:</strong> <span>{complicaciones_parto}</span></p>
        )}
      </article>
    </section>
  );
};

PatientFemaleInfo.propTypes = {
  informacion_femenina: PropTypes.shape({
    ha_estado_embarazada: PropTypes.bool,
    como_fue_parto: PropTypes.string,
    tipo_parto_detallado: PropTypes.string,
    complicaciones_parto: PropTypes.string,
    fecha_ultimo_parto: PropTypes.oneOfType([PropTypes.string, PropTypes.instanceOf(Date)]),
    menopausia: PropTypes.bool,
    alteraciones_ciclo_menstrual: PropTypes.bool,
    fecha_ultima_menstruacion: PropTypes.oneOfType([PropTypes.string, PropTypes.instanceOf(Date)]),
    toma_anticonceptivos: PropTypes.bool
  }),
  sexo: PropTypes.string
};

export default React.memo(PatientFemaleInfo);