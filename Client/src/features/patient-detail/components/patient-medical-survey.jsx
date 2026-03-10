import React from 'react';
import PropTypes from 'prop-types';
import SectionHeader from './section-header';
import '../styles/patient-medical-survey.css';

// Subcomponente para Medicación
const MedicationList = React.memo(({ medicacion }) => {
  if (!medicacion || medicacion.length === 0) {
    return (
      <ul aria-label="Sin medicación">
        <li className="no-items-message">No hay medicación registrada.</li>
      </ul>
    );
  }
  
  return (
    <ul>
      {medicacion.map((med, index) => (
        <li key={`medication-${index}-${med.nombre?.substring(0, 8)}-${med.dosis?.substring(0, 3)}`}>
          <div className="medication-details">
            <p>
              <strong>Nombre:</strong>{" "}
              <span>{med.nombre || 'No especificado'}</span>
            </p>
            <p>
              <strong>Dosis:</strong>{" "}
              <span>{med.dosis || 'No especificada'}</span>
            </p>
            <p>
              <strong>Frecuencia:</strong>{" "}
              <span>{med.frecuencia || 'No especificada'}</span>
            </p>
          </div>
        </li>
      ))}
    </ul>
  );
});

MedicationList.propTypes = {
  medicacion: PropTypes.arrayOf(
    PropTypes.shape({
      nombre: PropTypes.string,
      dosis: PropTypes.string,
      frecuencia: PropTypes.string
    })
  )
};

// Subcomponente para Alergias
const AllergiesList = React.memo(({ alergias }) => {
  if (!alergias || alergias.length === 0) {
    return (
      <ul aria-label="Sin alergias">
        <li className="no-items-message">No hay alergias registradas.</li>
      </ul>
    );
  }
  
  return (
    <ul>
      {alergias.map((alergia, index) => (
        <li key={`allergy-${index}-${alergia.sustancia?.substring(0, 8)}`}>
          <p><strong>Sustancia:</strong> <span>{alergia.sustancia || 'N/A'}</span></p>
          <p><strong>Reacción:</strong> <span>{alergia.reaccion || 'N/A'}</span></p>
        </li>
      ))}
    </ul>
  );
});

AllergiesList.propTypes = {
  alergias: PropTypes.arrayOf(
    PropTypes.shape({
      sustancia: PropTypes.string,
      reaccion: PropTypes.string
    })
  )
};

// Componente principal para mostrar la sección de Encuesta Médica
const PatientMedicalSurvey = ({ encuesta = null }) => {
  // Generamos un ID único para la sección principal
  const sectionId = `medical-survey-${React.useId()}`;
  
  // Generamos IDs únicos para cada subsección, una sola vez
  const historialId = `historial-${React.useId()}`;
  const medicacionId = `medicacion-${React.useId()}`;
  const cirugiasId = `cirugias-${React.useId()}`;
  const alergiasId = `alergias-${React.useId()}`;
  const ansiedadId = `ansiedad-${React.useId()}`;

  const infoGeneralId = `info-general-${React.useId()}`;
  const habitosEstiloVidaId = `habitos-estilo-vida-${React.useId()}`;
  const enfermedadesGravesId = `enfermedades-graves-${React.useId()}`;

  // Si no hay datos de la encuesta, mostrar un mensaje
  if (!encuesta) {
    return (
      <section className="patient-detail__section" aria-labelledby={sectionId}>
        <SectionHeader title="Encuesta Médica" id={sectionId} />
        <p className="no-items-message">No hay información de la encuesta médica disponible.</p>
      </section>
    );
  }

  const { 
    historial_medico_adicional, 
    medicacion, 
    cirugias_previas, 
    alergias, 
    ansiedad_dental,
    informacion_general,
    habitos_estilo_vida 
  } = encuesta;

  return (
    <section className="patient-detail__section" aria-labelledby={sectionId}>
      <SectionHeader title="Encuesta Médica" id={sectionId} />

      {/* Historial Médico Adicional */}
      <article aria-labelledby={historialId} className="patient-detail__subsection">
        <h3 id={historialId}>Historial Médico Adicional</h3>
        {historial_medico_adicional ? (
          <dl className="medical-history-list">
            <div>
              <dt>Hipertensión:</dt>
              <dd>{historial_medico_adicional.hipertension ? "Sí" : "No"}</dd>
            </div>
            <div>
              <dt>Trastornos de Coagulación:</dt>
              <dd>{historial_medico_adicional.trastornos_coagulacion ? "Sí" : "No"}</dd>
            </div>
            <div>
              <dt>Trastornos Neurológicos:</dt>
              <dd>{historial_medico_adicional.trastornos_neurologicos ? "Sí" : "No"}</dd>
            </div>
            <div>
              <dt>Enfermedades Autoinmunes:</dt>
              <dd>{historial_medico_adicional.enfermedades_autoinmunes ? "Sí" : "No"}</dd>
            </div>
            <div>
              <dt>Enfermedades Respiratorias:</dt>
              <dd>{historial_medico_adicional.enfermedades_respiratorias ? "Sí" : "No"}</dd>
            </div>
            <div>
              <dt>Problemas Renales:</dt>
              <dd>{historial_medico_adicional.problemas_renales ? "Sí" : "No"}</dd>
            </div>
            <div>
              <dt>Problemas Hepáticos:</dt>
              <dd>{historial_medico_adicional.problemas_hepaticos ? "Sí" : "No"}</dd>
            </div>
            <div>
              <dt>Cáncer:</dt>
              <dd>{historial_medico_adicional.cancer ? "Sí" : "No"}</dd>
            </div>
            <div>
              <dt>Tratamiento Oncológico:</dt>
              <dd>{historial_medico_adicional.tratamiento_oncologico ? "Sí" : "No"}</dd>
            </div>
          </dl>
        ) : (
          <ul aria-label="Sin historial médico">
            <li className="no-items-message">No hay datos de historial médico adicional.</li>
          </ul>
        )}
      </article>

      {/* Medicación */}
      <article aria-labelledby={medicacionId} className="patient-detail__subsection">
        <h3 id={medicacionId}>Medicación</h3>
        <MedicationList medicacion={medicacion} />
      </article>

      {/* Cirugías Previas */}
      <article aria-labelledby={cirugiasId} className="patient-detail__subsection">
        <h3 id={cirugiasId}>Cirugías Previas</h3>
        {cirugias_previas && cirugias_previas.length > 0 ? (
          <ul>
            {cirugias_previas.map((cirugia, index) => (
              <li key={`surgery-${index}-${cirugia.substring(0, 10)}`}>{cirugia}</li>
            ))}
          </ul>
        ) : (
          <ul aria-label="Sin cirugías previas">
            <li className="no-items-message">No hay cirugías previas registradas.</li>
          </ul>
        )}
      </article>

      {/* Alergias */}
      <article aria-labelledby={alergiasId} className="patient-detail__subsection">
        <h3 id={alergiasId}>Alergias</h3>
        <AllergiesList alergias={alergias} />
      </article>

      {/* Ansiedad Dental */}
      <article aria-labelledby={ansiedadId} className="patient-detail__subsection">
        <h3 id={ansiedadId}>Ansiedad Dental</h3>
        {ansiedad_dental ? (
          <dl className="medical-data-list">
            <div>
              <dt>Nivel:</dt>
              <dd>{ansiedad_dental.nivel || "No especificado"}</dd>
            </div>
            <div>
              <dt>Experiencia Negativa Previa:</dt>
              <dd>{ansiedad_dental.experiencia_negativa_previa ? "Sí" : "No"}</dd>
            </div>
          </dl>
        ) : (
          <ul aria-label="Sin datos de ansiedad dental">
            <li className="no-items-message">No hay datos de ansiedad dental.</li>
          </ul>
        )}
      </article>



      {/* Información Médica General */}
      <article aria-labelledby={infoGeneralId} className="patient-detail__subsection">
        <h3 id={infoGeneralId}>Información Médica General</h3>
        {informacion_general ? (
          <dl className="medical-data-list">
            <div>
              <dt>Evaluación personal del estado de salud:</dt>
              <dd>{informacion_general.considera_su_salud || "No hay información"}</dd>
            </div>
            <div>
              <dt>Último examen médico:</dt>
              <dd>
                {informacion_general.ultimo_examen_medico ? (
                  <>
                    {informacion_general.ultimo_examen_medico.estado ? "Sí" : "No"}
                    {informacion_general.ultimo_examen_medico.estado && informacion_general.ultimo_examen_medico.fecha && (
                      <span> - Fecha: {new Date(informacion_general.ultimo_examen_medico.fecha).toLocaleDateString('es-ES')}</span>
                    )}
                  </>
                ) : "No hay información"}
              </dd>
            </div>
            <div>
              <dt>En tratamiento médico actual:</dt>
              <dd>
                {informacion_general.en_tratamiento_medico ? (
                  <>
                    {informacion_general.en_tratamiento_medico.estado ? "Sí" : "No"}
                    {informacion_general.en_tratamiento_medico.estado && informacion_general.en_tratamiento_medico.explicacion && (
                      <span> - {informacion_general.en_tratamiento_medico.explicacion}</span>
                    )}
                  </>
                ) : "No hay información"}
              </dd>
            </div>
            <div>
              <dt>Hospitalizado anteriormente:</dt>
              <dd>
                {informacion_general.hospitalizado_anteriormente ? (
                  <>
                    {informacion_general.hospitalizado_anteriormente.estado ? "Sí" : "No"}
                    {informacion_general.hospitalizado_anteriormente.estado && informacion_general.hospitalizado_anteriormente.razon && (
                      <span> - Razón: {informacion_general.hospitalizado_anteriormente.razon}</span>
                    )}
                  </>
                ) : "No hay información"}
              </dd>
            </div>
            
            {/* Nuevas preguntas de salud general */}
            <div>
              <dt>Se cansa fácilmente:</dt>
              <dd>{informacion_general.se_cansa_facilmente ? "Sí" : "No"}</dd>
            </div>
            <div>
              <dt>Cambios de peso recientes:</dt>
              <dd>{informacion_general.cambios_peso_recientes ? "Sí" : "No"}</dd>
            </div>
            <div>
              <dt>Dolores o pérdida de oído:</dt>
              <dd>{informacion_general.dolores_perdida_oido ? "Sí" : "No"}</dd>
            </div>
            <div>
              <dt>Sangrado excesivo en cortes:</dt>
              <dd>{informacion_general.sangrado_excesivo_cortes ? "Sí" : "No"}</dd>
            </div>
            <div>
              <dt>Hemorragias espontáneas:</dt>
              <dd>{informacion_general.hemorragias_espontaneas ? "Sí" : "No"}</dd>
            </div>
            <div>
              <dt>Seropositivo VIH:</dt>
              <dd>{informacion_general.seropositivo_vih ? "Sí" : "No"}</dd>
            </div>
            <div>
              <dt>Dolores de cabeza frecuentes:</dt>
              <dd>{informacion_general.dolores_cabeza_frecuentes ? "Sí" : "No"}</dd>
            </div>
            {/* Observaciones generales de salud */}
            {informacion_general.observaciones_salud_general && (
              <div>
                <dt>Observaciones sobre salud general:</dt>
                <dd>{informacion_general.observaciones_salud_general}</dd>
              </div>
            )}
          </dl>
        ) : (
          <ul aria-label="Sin información médica general">
            <li className="no-items-message">No hay información médica general.</li>
          </ul>
        )}
      </article>

      {/* Hábitos de Estilo de Vida */}
      <article aria-labelledby={habitosEstiloVidaId} className="patient-detail__subsection">
        <h3 id={habitosEstiloVidaId}>Hábitos de Estilo de Vida</h3>
        {habitos_estilo_vida ? (
          <dl className="medical-data-list">
            {habitos_estilo_vida.tabaquismo && (
              <div>
                <dt>Tabaquismo:</dt>
                <dd>
                  {habitos_estilo_vida.tabaquismo.estado ? "Sí" : "No"}
                  {habitos_estilo_vida.tabaquismo.estado && habitos_estilo_vida.tabaquismo.frecuencia && (
                    <span> - Frecuencia: {habitos_estilo_vida.tabaquismo.frecuencia}</span>
                  )}
                </dd>
              </div>
            )}
            {habitos_estilo_vida.alcoholismo && (
              <div>
                <dt>Alcoholismo:</dt>
                <dd>
                  {habitos_estilo_vida.alcoholismo.estado ? "Sí" : "No"}
                  {habitos_estilo_vida.alcoholismo.estado && habitos_estilo_vida.alcoholismo.frecuencia && (
                    <span> - Frecuencia: {habitos_estilo_vida.alcoholismo.frecuencia}</span>
                  )}
                </dd>
              </div>
            )}
          </dl>
        ) : (
          <ul aria-label="Sin hábitos de estilo de vida">
            <li className="no-items-message">No hay información de hábitos de estilo de vida.</li>
          </ul>
        )}
      </article>

      {/* Enfermedades Graves Adicionales */}
      <article aria-labelledby={enfermedadesGravesId} className="patient-detail__subsection">
        <h3 id={enfermedadesGravesId}>Enfermedades Graves Adicionales</h3>
        {informacion_general?.enfermedad_grave_adicional ? (
          <div className="diseases-container">
            {informacion_general.enfermedad_grave_adicional.opcion_principal === 'no' ? (
              <p className="diseases-no-info">- No</p>
            ) : (
              <div>
                {(() => {
                  const enfermedades = informacion_general.enfermedad_grave_adicional.enfermedades_seleccionadas;
                  const enfermedadesActivas = [];
                  
                  // Mapeo de campos a nombres legibles
                  const nombreEnfermedades = {
                    trastornos_neurologicos: 'Trastornos Neurológicos',
                    enfermedades_autoinmunes: 'Enfermedades Autoinmunes',
                    enfermedades_respiratorias: 'Enfermedades Respiratorias',
                    problemas_renales: 'Problemas Renales',
                    problemas_hepaticos: 'Problemas Hepáticos',
                    tratamiento_oncologico: 'Tratamiento Oncológico',
                    tuberculosis: 'Tuberculosis',
                    asma: 'Asma',
                    rinitis_alergica: 'Rinitis Alérgica',
                    convulsiones_epilepsia: 'Convulsiones/Epilepsia',
                    enfisema: 'Enfisema',
                    tos_persistente_sangre: 'Tos Persistente con Sangre',
                    fiebre_reumatica: 'Fiebre Reumática',
                    soplo_cardiaco: 'Soplo Cardíaco',
                    angina_pecho: 'Angina de Pecho',
                    presion_arterial_baja: 'Presión Arterial Baja',
                    gastritis_ulcera: 'Gastritis/Úlcera',
                    enfermedades_rinon: 'Enfermedades del Riñón',
                    transplantes_organos: 'Transplante de Órganos',
                    marcapasos: 'Marcapasos',
                    dano_valvulas: 'Daño en Válvulas',
                    retencion_liquidos: 'Retención de Líquidos',
                    arteriosclerosis: 'Arteriosclerosis',
                    hipertiroidismo: 'Hipertiroidismo',
                    paratiroidismo: 'Paratiroidismo',
                    transfusiones_sanguineas: 'Transfusiones Sanguíneas',
                    radiaciones_cara_cuello: 'Radiaciones en Cara/Cuello',
                    osteogenesis_imperfecta: 'Osteogénesis Imperfecta',
                    enfermedad_paget: 'Enfermedad de Paget',
                    osteoporosis: 'Osteoporosis',
                    lupus_eritematoso: 'Lupus Eritematoso',
                    tratamiento_inmuno_supresion: 'Tratamiento de Inmunosupresión',
                    insuficiencia_renal: 'Insuficiencia Renal',
                    enfermedades_familiares: 'Enfermedades Familiares',
                    hipertension: 'Hipertensión',
                    sinusitis: 'Sinusitis',
                    trastornos_coagulacion: 'Trastornos de Coagulación',
                    anemia: 'Anemia',
                    sida: 'SIDA',
                    arteriosclerosis: 'Arteriosclerosis',
                    hipotiroidismo: 'Hipotiroidismo',
                    cancer: 'Cáncer',
                    esclerodermia: 'Esclerodermia',
                    enfermedades_sangre: 'Enfermedades de la Sangre',
                    presion_arterial_alta: 'Presión Arterial Alta'
                  };
                  
                  // Revisar enfermedades booleanas
                  Object.keys(nombreEnfermedades).forEach(key => {
                    if (enfermedades[key] === true) {
                      enfermedadesActivas.push(`- ${nombreEnfermedades[key]}`);
                    }
                  });
                  
                  // Revisar enfermedades con objetos (infarto, diabetes, hepatitis)
                  if (enfermedades.infarto_corazon?.checked) {
                    let texto = '- Infarto del Corazón';
                    if (enfermedades.infarto_corazon.fecha) {
                      texto += ` (Fecha: ${enfermedades.infarto_corazon.fecha})`;
                    }
                    enfermedadesActivas.push(texto);
                  }
                  
                  if (enfermedades.diabetes?.checked) {
                    let texto = '- Diabetes';
                    if (enfermedades.diabetes.tipo) {
                      const tipoTexto = {
                        'tipo_1': 'Tipo 1',
                        'tipo_2': 'Tipo 2',
                        'gestacional': 'Gestacional'
                      };
                      texto += ` (${tipoTexto[enfermedades.diabetes.tipo] || enfermedades.diabetes.tipo})`;
                    }
                    enfermedadesActivas.push(texto);
                  }
                  
                  if (enfermedades.hepatitis?.checked) {
                    let texto = '- Hepatitis';
                    if (enfermedades.hepatitis.tipo) {
                      texto += ` ${enfermedades.hepatitis.tipo.toUpperCase()}`;
                    }
                    enfermedadesActivas.push(texto);
                  }
                  
                  return enfermedadesActivas.length > 0 ? (
                    <div className="diseases-list">
                      {enfermedadesActivas.map((enfermedad, index) => (
                        <p key={`disease-${index}`}>{enfermedad}</p>
                      ))}
                    </div>
                  ) : (
                    <p className="diseases-no-info">- No</p>
                  );
                })()
                }
              </div>
            )}
          </div>
        ) : (
          <p className="diseases-no-info">- No</p>
        )}
      </article>
    </section>
  );
};

PatientMedicalSurvey.propTypes = {
  encuesta: PropTypes.shape({
    historial_medico_adicional: PropTypes.object,
    medicacion: PropTypes.array,
    cirugias_previas: PropTypes.arrayOf(PropTypes.string),
    alergias: PropTypes.arrayOf(PropTypes.shape({
      sustancia: PropTypes.string,
      reaccion: PropTypes.string
    })),
    ansiedad_dental: PropTypes.shape({
      nivel: PropTypes.string,
      experiencia_negativa_previa: PropTypes.bool
    }),
    embarazo: PropTypes.shape({
      estado: PropTypes.bool,
      semanas_gestacion: PropTypes.oneOfType([PropTypes.string, PropTypes.number])
    })
  })
};

export default React.memo(PatientMedicalSurvey);