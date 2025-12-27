import React from 'react';
import PropTypes from 'prop-types';
import "../styles/patient-hygiene-habits.css";

// Componente para mostrar hábitos de higiene bucodental completos
const PatientHygieneHabits = ({ habitos_higiene = null }) => {
  const sectionId = `hygiene-habits-${React.useId()}`;

  if (!habitos_higiene) {
    return (
      <section className="patient-detail__section" aria-labelledby={sectionId}>
        <h2 id={sectionId}>Hábitos de Higiene Bucodental</h2>
        <p className="no-items-message">No hay información de hábitos de higiene disponible.</p>
      </section>
    );
  }

  const {
    cepillo_dental,
    frecuencia_cambio_cepillo,
    seda_dental,
    numero_cepillados_dia,
    tipo_cepillo,
    uso_enjuague_bucal,
    consumo_azucar,
    mastica_chicle,
    bruxismo,
    otros,
    fecha_ultima_visita_odontologo,
    perdida_dientes,
    acumulacion_alimento_dientes,
    tumores_agrandamientos_boca,
    llagas_ulceras_aftas_frecuentes,
    enfermedad_periodontal,
    sangrado_encias,
    tratamiento_ortodoncia_previo,
    problemas_tratamientos_previos,
    dolores_cerca_oido,
    motivo_consulta_odontologica
  } = habitos_higiene;

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
      <h2 id={sectionId}>Hábitos de Higiene Bucodental</h2>
      
      {/* Sección de Cepillado */}
      <article className="patient-detail__subsection">
        <h3>Cepillado Dental</h3>
        <dl className="medical-data-list">
          <div>
            <dt>Usa cepillo dental:</dt>
            <dd>{formatBoolean(cepillo_dental)}</dd>
          </div>
          <div>
            <dt>Número de cepillados por día:</dt>
            <dd>{numero_cepillados_dia || 'No especificado'}</dd>
          </div>
          <div>
            <dt>Tipo de cepillo:</dt>
            <dd>{tipo_cepillo || 'No especificado'}</dd>
          </div>
          <div>
            <dt>Frecuencia cambio cepillo:</dt>
            <dd>{frecuencia_cambio_cepillo || 'No especificado'}</dd>
          </div>
        </dl>
      </article>

      {/* Sección de Higiene Complementaria */}
      <article className="patient-detail__subsection">
        <h3>Higiene Complementaria</h3>
        <dl className="medical-data-list">
          <div>
            <dt>Uso de seda dental:</dt>
            <dd>{seda_dental || 'No especificado'}</dd>
          </div>
          <div>
            <dt>Usa enjuague bucal:</dt>
            <dd>{formatBoolean(uso_enjuague_bucal?.usa)}</dd>
          </div>
          {uso_enjuague_bucal?.usa && (
            <>
              <div>
                <dt>Tipo de enjuague:</dt>
                <dd>{uso_enjuague_bucal.tipo || 'No especificado'}</dd>
              </div>
              <div>
                <dt>Frecuencia de enjuague:</dt>
                <dd>{uso_enjuague_bucal.frecuencia || 'No especificado'}</dd>
              </div>
            </>
          )}
        </dl>
      </article>

      {/* Sección de Hábitos Alimentarios */}
      <article className="patient-detail__subsection">
        <h3>Hábitos Alimentarios</h3>
        <dl className="medical-data-list">
          <div>
            <dt>Nivel consumo azúcar:</dt>
            <dd>{consumo_azucar?.nivel || 'No especificado'}</dd>
          </div>
          {consumo_azucar?.tipo && consumo_azucar.tipo.length > 0 && (
            <div>
              <dt>Tipos de azúcar:</dt>
              <dd>{consumo_azucar.tipo.join(', ')}</dd>
            </div>
          )}
          <div>
            <dt>Mastica chicle:</dt>
            <dd>{mastica_chicle?.tipo || 'No especificado'}</dd>
          </div>
          {mastica_chicle?.tipo === 'Sí' && (
            <div>
              <dt>Frecuencia chicle:</dt>
              <dd>{mastica_chicle.frecuencia || 'No especificado'}</dd>
            </div>
          )}
        </dl>
      </article>

      {/* Sección de Bruxismo */}
      <article className="patient-detail__subsection">
        <h3>Bruxismo</h3>
        <dl className="medical-data-list">
          <div>
            <dt>Presenta bruxismo:</dt>
            <dd>{formatBoolean(bruxismo?.presente)}</dd>
          </div>
          {bruxismo?.presente && (
            <div>
              <dt>Usa placa nocturna:</dt>
              <dd>{formatBoolean(bruxismo.uso_placa)}</dd>
            </div>
          )}
        </dl>
      </article>

      {/* Sección de Historial Odontológico */}
      <article className="patient-detail__subsection">
        <h3>Historial Odontológico</h3>
        <dl className="medical-data-list">
          <div>
            <dt>Última visita al odontólogo:</dt>
            <dd>{formatDate(fecha_ultima_visita_odontologo)}</dd>
          </div>
          <div>
            <dt>Pérdida de dientes:</dt>
            <dd>{formatBoolean(perdida_dientes)}</dd>
          </div>
          <div>
            <dt>Acumulación de alimento:</dt>
            <dd>{formatBoolean(acumulacion_alimento_dientes)}</dd>
          </div>
          <div>
            <dt>Tumores/agrandamientos:</dt>
            <dd>{formatBoolean(tumores_agrandamientos_boca)}</dd>
          </div>
          <div>
            <dt>Llagas/úlceras frecuentes:</dt>
            <dd>{formatBoolean(llagas_ulceras_aftas_frecuentes)}</dd>
          </div>
          <div>
            <dt>Enfermedad periodontal:</dt>
            <dd>{formatBoolean(enfermedad_periodontal)}</dd>
          </div>
          <div>
            <dt>Sangrado de encías:</dt>
            <dd>{formatBoolean(sangrado_encias)}</dd>
          </div>
          <div>
            <dt>Tratamiento ortodoncia previo:</dt>
            <dd>{formatBoolean(tratamiento_ortodoncia_previo)}</dd>
          </div>
          <div>
            <dt>Problemas tratamientos previos:</dt>
            <dd>{formatBoolean(problemas_tratamientos_previos?.estado)}</dd>
          </div>
          <div>
            <dt>Dolores cerca del oído:</dt>
            <dd>{formatBoolean(dolores_cerca_oido)}</dd>
          </div>
        </dl>
        {problemas_tratamientos_previos?.estado && problemas_tratamientos_previos?.explicacion && (
          <p><strong>Explicación problemas previos:</strong> <span>{problemas_tratamientos_previos.explicacion}</span></p>
        )}
      </article>

      {/* Motivo de consulta y otros */}
      {(motivo_consulta_odontologica || otros) && (
        <article className="patient-detail__subsection">
          <h3>Información Adicional</h3>
          {motivo_consulta_odontologica && (
            <p><strong>Motivo de consulta odontológica:</strong> <span>{motivo_consulta_odontologica}</span></p>
          )}
          {otros && (
            <p><strong>Otros hábitos:</strong> <span>{otros}</span></p>
          )}
        </article>
      )}
    </section>
  );
};

PatientHygieneHabits.propTypes = {
  habitos_higiene: PropTypes.shape({
    cepillo_dental: PropTypes.bool,
    frecuencia_cambio_cepillo: PropTypes.string,
    seda_dental: PropTypes.string,
    numero_cepillados_dia: PropTypes.string,
    tipo_cepillo: PropTypes.string,
    uso_enjuague_bucal: PropTypes.shape({
      usa: PropTypes.bool,
      tipo: PropTypes.string,
      frecuencia: PropTypes.string
    }),
    consumo_azucar: PropTypes.shape({
      nivel: PropTypes.string,
      tipo: PropTypes.arrayOf(PropTypes.string)
    }),
    mastica_chicle: PropTypes.shape({
      tipo: PropTypes.string,
      frecuencia: PropTypes.string
    }),
    bruxismo: PropTypes.shape({
      presente: PropTypes.bool,
      uso_placa: PropTypes.bool
    }),
    otros: PropTypes.string,
    fecha_ultima_visita_odontologo: PropTypes.oneOfType([PropTypes.string, PropTypes.instanceOf(Date)]),
    perdida_dientes: PropTypes.bool,
    acumulacion_alimento_dientes: PropTypes.bool,
    tumores_agrandamientos_boca: PropTypes.bool,
    llagas_ulceras_aftas_frecuentes: PropTypes.bool,
    enfermedad_periodontal: PropTypes.bool,
    sangrado_encias: PropTypes.bool,
    tratamiento_ortodoncia_previo: PropTypes.bool,
    problemas_tratamientos_previos: PropTypes.shape({
      estado: PropTypes.bool,
      explicacion: PropTypes.string
    }),
    dolores_cerca_oido: PropTypes.bool,
    motivo_consulta_odontologica: PropTypes.string
  })
};

export default React.memo(PatientHygieneHabits);