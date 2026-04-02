import SectionHeader from './section-header';
import '../styles/patient-dental-evaluation.css';

const PatientDentalEvaluation = ({ patientData }) => {
  const evaluacion = patientData?.evaluacion_dental_oclusal;

  const hasLineaSonrisaData = Boolean(
    evaluacion?.linea_sonrisa?.longitud_labio ||
    evaluacion?.linea_sonrisa?.muestra_reborde_al_sonreir
  );
  const hasClasificacionKennedyData = Boolean(evaluacion?.clasificacion_kennedy);
  const hasEnciaInsertadaData = Boolean(evaluacion?.encia_insertada);
  const hasAperturaBucalData = Boolean(evaluacion?.apertura_bucal);

  const hasAtmData = Boolean(
    evaluacion?.evaluacion_atm?.molestias_atm ||
    evaluacion?.evaluacion_atm?.ruidos?.derecha ||
    evaluacion?.evaluacion_atm?.ruidos?.izquierda ||
    evaluacion?.evaluacion_atm?.dolor?.derecha ||
    evaluacion?.evaluacion_atm?.dolor?.izquierda ||
    evaluacion?.evaluacion_atm?.movilidad_mandibular?.protrusiva ||
    evaluacion?.evaluacion_atm?.movilidad_mandibular?.lateralidad?.lateral_derecho ||
    evaluacion?.evaluacion_atm?.movilidad_mandibular?.lateralidad?.lateral_izquierdo
  );

  const hasOclusalData = Boolean(
    evaluacion?.evaluacion_oclusal?.clasificacion_angle ||
    evaluacion?.evaluacion_oclusal?.contacto_dentario_oclusion_centrica ||
    evaluacion?.evaluacion_oclusal?.proteccion_canina ||
    evaluacion?.evaluacion_oclusal?.proteccion_anterior ||
    evaluacion?.evaluacion_oclusal?.funcion_grupo ||
    evaluacion?.evaluacion_oclusal?.proteccion_mutua ||
    evaluacion?.evaluacion_oclusal?.sobremordida ||
    evaluacion?.evaluacion_oclusal?.mordida_cruzada ||
    evaluacion?.evaluacion_oclusal?.traslape_horizontal_mm ||
    evaluacion?.evaluacion_oclusal?.traslape_vertical_mm ||
    evaluacion?.evaluacion_oclusal?.mordida_abierta?.presente
  );

  const hasMainEvaluationData = Boolean(
    hasLineaSonrisaData ||
    hasClasificacionKennedyData ||
    hasEnciaInsertadaData ||
    hasAperturaBucalData ||
    hasAtmData ||
    hasOclusalData
  );

  return (
    <section className="patient-detail__section" aria-labelledby="dental-evaluation-section">
      <SectionHeader title="Evaluación Dental y Oclusal" id="dental-evaluation-section" />

      {!hasMainEvaluationData && (
        <p className="patient-detail__empty-message">No hay datos de evaluación dental y oclusal.</p>
      )}
      
      {/* Línea de sonrisa */}
      {hasLineaSonrisaData && (
        <article className="patient-detail__subsection" aria-labelledby="linea-sonrisa">
          <h3 id="linea-sonrisa">Línea de sonrisa</h3>
          {evaluacion.linea_sonrisa.longitud_labio && (
            <p>
              <strong>Longitud del labio:</strong>{" "}
              <span>{evaluacion.linea_sonrisa.longitud_labio}</span>
            </p>
          )}
          {evaluacion.linea_sonrisa.muestra_reborde_al_sonreir && (
            <p>
              <strong>Al sonreír muestra el reborde:</strong>{" "}
              <span>Sí</span>
            </p>
          )}
        </article>
      )}
      
      {/* Clasificación de Kennedy */}
      {hasClasificacionKennedyData && (
        <article className="patient-detail__subsection" aria-labelledby="clasificacion-kennedy">
          <h3 id="clasificacion-kennedy">Clasificación de Kennedy</h3>
          <p>
            <strong>Presente:</strong>{" "}
            <span>Sí</span>
          </p>
        </article>
      )}
      
      {/* Encía insertada */}
      {hasEnciaInsertadaData && (
        <article className="patient-detail__subsection" aria-labelledby="encia-insertada">
          <h3 id="encia-insertada">Encía insertada</h3>
          <p>
            <strong>Encía insertada:</strong>{" "}
            <span>{evaluacion.encia_insertada}</span>
          </p>
        </article>
      )}
      
      {/* Apertura bucal */}
      {hasAperturaBucalData && (
        <article className="patient-detail__subsection" aria-labelledby="apertura-bucal">
          <h3 id="apertura-bucal">Apertura Bucal</h3>
          <p>
            <strong>Apertura Bucal:</strong>{" "}
            <span>{evaluacion.apertura_bucal}</span>
          </p>
        </article>
      )}
      
      {/* Evaluación ATM */}
      <article className="patient-detail__subsection" aria-labelledby="evaluacion-atm">
        <h3 id="evaluacion-atm">Evaluación de la Articulación Temporomandibular (ATM)</h3>
        {hasAtmData ? (
          <>
            {evaluacion?.evaluacion_atm?.molestias_atm && (
              <p>
                <strong>Molestias en la ATM:</strong>{" "}
                <span>Sí</span>
              </p>
            )}

            {(evaluacion?.evaluacion_atm?.ruidos?.derecha || evaluacion?.evaluacion_atm?.ruidos?.izquierda) && (
              <div>
                <p><strong>Ruidos:</strong></p>
                {evaluacion?.evaluacion_atm?.ruidos?.derecha && (
                  <p><strong>Derecha:</strong>{" "}<span>{evaluacion.evaluacion_atm.ruidos.derecha}</span></p>
                )}
                {evaluacion?.evaluacion_atm?.ruidos?.izquierda && (
                  <p><strong>Izquierda:</strong>{" "}<span>{evaluacion.evaluacion_atm.ruidos.izquierda}</span></p>
                )}
              </div>
            )}

            {(evaluacion?.evaluacion_atm?.dolor?.derecha || evaluacion?.evaluacion_atm?.dolor?.izquierda) && (
              <div>
                <p><strong>Dolor:</strong></p>
                {evaluacion?.evaluacion_atm?.dolor?.derecha && (
                  <p><strong>Derecha:</strong>{" "}<span>Sí</span></p>
                )}
                {evaluacion?.evaluacion_atm?.dolor?.izquierda && (
                  <p><strong>Izquierda:</strong>{" "}<span>Sí</span></p>
                )}
              </div>
            )}

            {evaluacion?.evaluacion_atm?.movilidad_mandibular?.protrusiva && (
              <p>
                <strong>Protrusiva:</strong>{" "}
                <span>Sí</span>
              </p>
            )}

            {(evaluacion?.evaluacion_atm?.movilidad_mandibular?.lateralidad?.lateral_derecho ||
              evaluacion?.evaluacion_atm?.movilidad_mandibular?.lateralidad?.lateral_izquierdo) && (
              <div>
                <p><strong>Lateralidad:</strong></p>
                {evaluacion?.evaluacion_atm?.movilidad_mandibular?.lateralidad?.lateral_derecho && (
                  <p><strong>Lateral derecho:</strong>{" "}<span>{evaluacion.evaluacion_atm.movilidad_mandibular.lateralidad.lateral_derecho}</span></p>
                )}
                {evaluacion?.evaluacion_atm?.movilidad_mandibular?.lateralidad?.lateral_izquierdo && (
                  <p><strong>Lateral izquierdo:</strong>{" "}<span>{evaluacion.evaluacion_atm.movilidad_mandibular.lateralidad.lateral_izquierdo}</span></p>
                )}
              </div>
            )}
          </>
        ) : (
          <p className="patient-detail__empty-message">No hay datos de evaluación ATM.</p>
        )}
      </article>
      
      {/* Evaluación oclusal */}
      <article className="patient-detail__subsection" aria-labelledby="evaluacion-oclusal">
        <h3 id="evaluacion-oclusal">Evaluación oclusal</h3>
        {hasOclusalData ? (
          <>
            {evaluacion?.evaluacion_oclusal?.clasificacion_angle && (
              <p>
                <strong>Clasificación de Angle:</strong>{" "}
                <span>{evaluacion.evaluacion_oclusal.clasificacion_angle}</span>
              </p>
            )}

            {evaluacion?.evaluacion_oclusal?.contacto_dentario_oclusion_centrica && (
              <p>
                <strong>Contacto dentario en Oclusión céntrica:</strong>{" "}
                <span>Sí</span>
              </p>
            )}

            {evaluacion?.evaluacion_oclusal?.proteccion_canina && (
              <p>
                <strong>Protección canina:</strong>{" "}
                <span>{evaluacion.evaluacion_oclusal.proteccion_canina}</span>
              </p>
            )}

            {evaluacion?.evaluacion_oclusal?.proteccion_anterior && (
              <p>
                <strong>Protección anterior:</strong>{" "}
                <span>Sí</span>
              </p>
            )}

            {evaluacion?.evaluacion_oclusal?.funcion_grupo && (
              <p>
                <strong>Función de grupo:</strong>{" "}
                <span>{evaluacion.evaluacion_oclusal.funcion_grupo}</span>
              </p>
            )}

            {evaluacion?.evaluacion_oclusal?.proteccion_mutua && (
              <p>
                <strong>Protección mutua:</strong>{" "}
                <span>{evaluacion.evaluacion_oclusal.proteccion_mutua}</span>
              </p>
            )}

            {evaluacion?.evaluacion_oclusal?.sobremordida && (
              <p>
                <strong>Sobremordida:</strong>{" "}
                <span>Sí</span>
              </p>
            )}

            {evaluacion?.evaluacion_oclusal?.mordida_cruzada && (
              <p>
                <strong>Mordida Cruzada:</strong>{" "}
                <span>Sí</span>
              </p>
            )}

            {evaluacion?.evaluacion_oclusal?.traslape_horizontal_mm && (
              <p>
                <strong>Traslape horizontal:</strong>{" "}
                <span>{evaluacion.evaluacion_oclusal.traslape_horizontal_mm} mm</span>
              </p>
            )}

            {evaluacion?.evaluacion_oclusal?.traslape_vertical_mm && (
              <p>
                <strong>Traslape vertical:</strong>{" "}
                <span>{evaluacion.evaluacion_oclusal.traslape_vertical_mm} mm</span>
              </p>
            )}

            {evaluacion?.evaluacion_oclusal?.mordida_abierta?.presente && (
              <div>
                <p><strong>Mordida abierta:</strong> <span>Presente: Sí</span></p>
                {evaluacion?.evaluacion_oclusal?.mordida_abierta?.medidas && (
                  <div>
                    {evaluacion?.evaluacion_oclusal?.mordida_abierta?.medidas?.anterior_mm && (
                      <p><strong>Ant.:</strong> <span>{evaluacion.evaluacion_oclusal.mordida_abierta.medidas.anterior_mm} mm</span></p>
                    )}
                    {evaluacion?.evaluacion_oclusal?.mordida_abierta?.medidas?.posterior_mm && (
                      <p><strong>Post.:</strong> <span>{evaluacion.evaluacion_oclusal.mordida_abierta.medidas.posterior_mm} mm</span></p>
                    )}
                    {evaluacion?.evaluacion_oclusal?.mordida_abierta?.medidas?.derecha_mm && (
                      <p><strong>Der.:</strong> <span>{evaluacion.evaluacion_oclusal.mordida_abierta.medidas.derecha_mm} mm</span></p>
                    )}
                    {evaluacion?.evaluacion_oclusal?.mordida_abierta?.medidas?.izquierda_mm && (
                      <p><strong>Izq.:</strong> <span>{evaluacion.evaluacion_oclusal.mordida_abierta.medidas.izquierda_mm} mm</span></p>
                    )}
                  </div>
                )}
              </div>
            )}
          </>
        ) : (
          <p className="patient-detail__empty-message">No hay datos de evaluación oclusal.</p>
        )}
      </article>
    </section>
  );
};

export default PatientDentalEvaluation;