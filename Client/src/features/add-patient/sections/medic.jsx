import plusIcon from '../../../assets/images/icons/plus.svg';
import TrashIcon from './TrashIcon';
import { useNestedFormState } from '../../../shared/hooks/useNestedFormState';

// Opciones de frecuencia compartidas por Tabaquismo y Alcoholismo.
const FRECUENCIAS = ['Diario', '6 veces a la semana', '5 veces a la semana', '4 veces a la semana', '3 veces a la semana', '2 veces a la semana', '1 vez a la semana', '1 vez cada 2 semanas', '1 vez cada 3 semanas', '1 vez al mes', 'Ocasional'];

// Enfermedades graves adicionales: [key, label] = checkbox simple. Los 3
// marcadores (diabetes/hepatitis/infarto_corazon) tienen sub-campo y se
// renderizan como bloque aparte, en su posicion original del grid.
const ENFERMEDADES = [
  ['angina_pecho', 'Angina de Pecho'],
  ['arteriosclerosis', 'Arteriosclerosis'],
  ['asma', 'Asma'],
  ['convulsiones_epilepsia', 'Convulsiones/Epilepsia'],
  ['dano_valvulas', 'Daño en Válvulas'],
  'diabetes',
  ['enfermedad_paget', 'Enfermedad de Paget'],
  ['enfermedades_rinon', 'Enfermedades del Riñón'],
  ['enfermedades_familiares', 'Enfermedades Familiares'],
  ['enfisema', 'Enfisema'],
  ['fiebre_reumatica', 'Fiebre Reumática'],
  ['gastritis_ulcera', 'Gastritis/Úlcera'],
  'hepatitis',
  ['hipertension', 'Hipertensión'],
  ['hipertiroidismo', 'Hipertiroidismo'],
  'infarto_corazon',
  ['insuficiencia_renal', 'Insuficiencia Renal'],
  ['lupus_eritematoso', 'Lupus Eritematoso'],
  ['marcapasos', 'Marcapasos'],
  ['osteogenesis_imperfecta', 'Osteogénesis Imperfecta'],
  ['osteoporosis', 'Osteoporosis'],
  ['paratiroidismo', 'Paratiroidismo'],
  ['presion_arterial_baja', 'Presión Arterial Baja'],
  ['radiaciones_cara_cuello', 'Radiaciones Cara/Cuello'],
  ['retencion_liquidos', 'Retención de Líquidos'],
  ['rinitis_alergica', 'Rinitis Alérgica'],
  ['sinusitis', 'Sinusitis'],
  ['soplo_cardiaco', 'Soplo Cardíaco'],
  ['tos_persistente_sangre', 'Tos Persistente con Sangre'],
  ['trastornos_coagulacion', 'Trastornos de Coagulación'],
  ['transfusiones_sanguineas', 'Transfusiones Sanguíneas'],
  ['transplantes_organos', 'Transplantes de Órganos'],
  ['tratamiento_inmuno_supresion', 'Tratamiento Inmunosupresor'],
  ['tuberculosis', 'Tuberculosis'],
  ['anemia', 'Anemia'],
  ['sida', 'SIDA'],
  ['hipotiroidismo', 'Hipotiroidismo'],
  ['cancer', 'Cáncer'],
  ['esclerodermia', 'Esclerodermia'],
  ['enfermedades_sangre', 'Enfermedades de la Sangre'],
  ['presion_arterial_alta', 'Presión Arterial Alta'],
];

const Medic = ({ 
  formData, 
  setFormData, 
  handleTripleNestedChange, 
  handleDoubleNestedChange, 
  handleRemoveItem, 
  handleAddItem, 
  handleEnfermedadGraveChange,
  handleArrayChange 
}) => {
  // Setter inmutable por ruta: reemplaza el patrón repetido de setFormData
  // anidado (ver useNestedFormState).
  const setField = useNestedFormState(setFormData);
  const sel = formData.encuesta_medica.informacion_general?.enfermedad_grave_adicional?.enfermedades_seleccionadas;

  return (
    <section className="form-section">
      <h2>Encuesta Médica</h2>
      <div className="encuesta-medica-container" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div className="left-section">

                  {/* INFORMACIÓN MÉDICA GENERAL */}
                   <div className="form-group">
                     <label>¿Cómo considera su salud?</label>
                     <select
                       value={formData.encuesta_medica.informacion_general?.considera_su_salud || ""}
                       onChange={(e) => handleTripleNestedChange("encuesta_medica", "informacion_general", "considera_su_salud", e.target.value)}
                     >
                       <option value="">Seleccione...</option>
                       <option value="Mala">Mala</option>
                       <option value="Regular">Regular</option>
                       <option value="Buena">Buena</option>
                       <option value="Excelente">Excelente</option>
                     </select>
                   </div>
 
                   <div className="form-group">
                     <label>Examenes médicos</label>
                     <input
                       type="checkbox"
                       checked={formData.encuesta_medica.informacion_general?.ultimo_examen_medico?.estado || false}
                       onChange={(e) => {
                         setField(['encuesta_medica', 'informacion_general', 'ultimo_examen_medico', 'estado'], e.target.checked);
                       }}
                     />
                   </div>

                   {formData.encuesta_medica.informacion_general?.ultimo_examen_medico?.estado && (
                     <div className="form-group">
                       <label>Fecha de Último Examen Médico</label>
                       <input
                         type="date"
                         style={{ width: '200px' }}
                         max={new Date().toISOString().slice(0, 10)}
                         value={formData.encuesta_medica.informacion_general?.ultimo_examen_medico?.fecha || ""}
                         onChange={(e) => {
                           setField(['encuesta_medica', 'informacion_general', 'ultimo_examen_medico', 'fecha'], e.target.value);
                         }}
                       />
                     </div>
                   )}

                   {/* En Tratamiento Médico */}
                   <div className="form-group">
                     <label>¿Está en tratamiento médico?</label>
                     <input
                       type="checkbox"
                       checked={formData.encuesta_medica.informacion_general?.en_tratamiento_medico?.estado || false}
                       onChange={(e) => {
                         setField(['encuesta_medica', 'informacion_general', 'en_tratamiento_medico', 'estado'], e.target.checked);
                       }}
                     />
                   </div>

                   {formData.encuesta_medica.informacion_general?.en_tratamiento_medico?.estado && (
                     <div className="form-group">
                       <label>Explique el tratamiento médico</label>
                       <textarea
                         value={formData.encuesta_medica.informacion_general?.en_tratamiento_medico?.explicacion || ""}
                         onChange={(e) => {
                           setField(['encuesta_medica', 'informacion_general', 'en_tratamiento_medico', 'explicacion'], e.target.value);
                         }}
                         rows="3"
                         style={{ width: '100%', resize: 'vertical' }}
                       />
                     </div>
                   )}

                   {/* Hospitalizado Anteriormente */}
                   <div className="form-group">
                     <label>¿Ha estado hospitalizado anteriormente?</label>
                     <input
                       type="checkbox"
                       checked={formData.encuesta_medica.informacion_general?.hospitalizado_anteriormente?.estado || false}
                       onChange={(e) => {
                         setField(['encuesta_medica', 'informacion_general', 'hospitalizado_anteriormente', 'estado'], e.target.checked);
                       }}
                     />
                   </div>

                   {formData.encuesta_medica.informacion_general?.hospitalizado_anteriormente?.estado && (
                     <div className="form-group">
                       <label>¿Por qué razón fue hospitalizado?</label>
                       <textarea
                         value={formData.encuesta_medica.informacion_general?.hospitalizado_anteriormente?.razon || ""}
                         onChange={(e) => {
                           setField(['encuesta_medica', 'informacion_general', 'hospitalizado_anteriormente', 'razon'], e.target.value);
                         }}
                         rows="3"
                         style={{ width: '100%', resize: 'vertical' }}
                       />
                     </div>
                   )}

                   {/* NUEVAS PREGUNTAS DE SALUD GENERAL */}
                   <div className="form-group">
                     <label>¿Se cansa fácilmente?</label>
                     <input
                       type="checkbox"
                       checked={formData.encuesta_medica.informacion_general?.se_cansa_facilmente || false}
                       onChange={(e) => {
                         setField(['encuesta_medica', 'informacion_general', 'se_cansa_facilmente'], e.target.checked);
                       }}
                     />
                   </div>

                   <div className="form-group">
                     <label>¿Ha tenido cambios de peso recientes?</label>
                     <input
                       type="checkbox"
                       checked={formData.encuesta_medica.informacion_general?.cambios_peso_recientes || false}
                       onChange={(e) => {
                         setField(['encuesta_medica', 'informacion_general', 'cambios_peso_recientes'], e.target.checked);
                       }}
                     />
                   </div>

                   <div className="form-group">
                     <label>¿Tiene dolores o pérdida de oído?</label>
                     <input
                       type="checkbox"
                       checked={formData.encuesta_medica.informacion_general?.dolores_perdida_oido || false}
                       onChange={(e) => {
                         setField(['encuesta_medica', 'informacion_general', 'dolores_perdida_oido'], e.target.checked);
                       }}
                     />
                   </div>

                   <div className="form-group">
                     <label>¿Tiene sangrado excesivo en cortes?</label>
                     <input
                       type="checkbox"
                       checked={formData.encuesta_medica.informacion_general?.sangrado_excesivo_cortes || false}
                       onChange={(e) => {
                         setField(['encuesta_medica', 'informacion_general', 'sangrado_excesivo_cortes'], e.target.checked);
                       }}
                     />
                   </div>

                   <div className="form-group">
                     <label>¿Tiene hemorragias espontáneas?</label>
                     <input
                       type="checkbox"
                       checked={formData.encuesta_medica.informacion_general?.hemorragias_espontaneas || false}
                       onChange={(e) => {
                         setField(['encuesta_medica', 'informacion_general', 'hemorragias_espontaneas'], e.target.checked);
                       }}
                     />
                   </div>

                   <div className="form-group">
                     <label>¿Es seropositivo para VIH?</label>
                     <input
                       type="checkbox"
                       checked={formData.encuesta_medica.informacion_general?.seropositivo_vih || false}
                       onChange={(e) => {
                         setField(['encuesta_medica', 'informacion_general', 'seropositivo_vih'], e.target.checked);
                       }}
                     />
                   </div>

                   <div className="form-group">
                     <label>¿Tiene dolores de cabeza frecuentes?</label>
                     <input
                       type="checkbox"
                       checked={formData.encuesta_medica.informacion_general?.dolores_cabeza_frecuentes || false}
                       onChange={(e) => {
                         setField(['encuesta_medica', 'informacion_general', 'dolores_cabeza_frecuentes'], e.target.checked);
                       }}
                     />
                   </div>

                   {/* Campo único de observaciones para todas las preguntas de salud general */}
                   <div className="form-group">
                     <label>Observaciones sobre salud general</label>
                     <textarea
                       value={formData.encuesta_medica.informacion_general?.observaciones_salud_general || ""}
                       onChange={(e) => {
                         setField(['encuesta_medica', 'informacion_general', 'observaciones_salud_general'], e.target.value);
                       }}
                       rows="4"
                       style={{ width: '100%', resize: 'vertical' }}
                       placeholder="Escriba aquí cualquier observación relevante sobre las preguntas de salud general marcadas como 'Sí'..."
                     />
                   </div>

                  {/* HÁBITOS DE ESTILO DE VIDA */}
                   <div className="form-group">
                     <label>Tabaquismo</label>
                     <input
                       type="checkbox"
                       checked={formData.encuesta_medica.habitos_estilo_vida?.tabaquismo?.estado || false}
                       onChange={(e) => {
                         setField(['encuesta_medica', 'habitos_estilo_vida', 'tabaquismo', 'estado'], e.target.checked);
                       }}
                     />
                   </div>
 
                   {formData.encuesta_medica.habitos_estilo_vida?.tabaquismo?.estado && (
                     <div className="form-group">
                       <label>Frecuencia de Tabaquismo</label>
                       <select
                         value={formData.encuesta_medica.habitos_estilo_vida?.tabaquismo?.frecuencia || ""}
                         onChange={(e) => {
                           setField(['encuesta_medica', 'habitos_estilo_vida', 'tabaquismo', 'frecuencia'], e.target.value);
                         }}
                       >
                         <option value="">Seleccione...</option>
                         {FRECUENCIAS.map((f) => <option key={f} value={f}>{f}</option>)}
                       </select>
                     </div>
                   )}
 
                   <div className="form-group">
                     <label>Alcoholismo</label>
                     <input
                       type="checkbox"
                       checked={formData.encuesta_medica.habitos_estilo_vida?.alcoholismo?.estado || false}
                       onChange={(e) => {
                         setField(['encuesta_medica', 'habitos_estilo_vida', 'alcoholismo', 'estado'], e.target.checked);
                       }}
                     />
                   </div>
 
                   {formData.encuesta_medica.habitos_estilo_vida?.alcoholismo?.estado && (
                     <div className="form-group">
                       <label>Frecuencia de Alcoholismo</label>
                       <select
                         value={formData.encuesta_medica.habitos_estilo_vida?.alcoholismo?.frecuencia || ""}
                         onChange={(e) => {
                           setField(['encuesta_medica', 'habitos_estilo_vida', 'alcoholismo', 'frecuencia'], e.target.value);
                         }}
                       >
                         <option value="">Seleccione...</option>
                         {FRECUENCIAS.map((f) => <option key={f} value={f}>{f}</option>)}
                       </select>
                     </div>
                   )}
                  


                    {/* Cirugías Previas */}
                    <div className="form-group">
                      <label>Cirugías Previas</label>
                      <div className="array-input-section">
                        {formData.encuesta_medica.cirugias_previas.map((cirugia, index) => (
                          <div key={index} className="array-item">
                            <input
                               type="text"
                               value={cirugia}
                               onChange={(e) => {
                                 const newCirugias = [...formData.encuesta_medica.cirugias_previas];
                                 newCirugias[index] = e.target.value;
                                 setField(['encuesta_medica', 'cirugias_previas'], newCirugias);
                               }}
                               placeholder="Tipo de cirugía"
                             />
                             <button
                               type="button"
                               onClick={() => handleRemoveItem('cirugias_previas', index)}
                               className="trash-button"
                               aria-label="Eliminar cirugía"
                             >
                               <TrashIcon />
                             </button>
                          </div>
                        ))}
                        <button
                           type="button"
                           onClick={() => handleAddItem('cirugias_previas', '')}
                           className="action-button"
                         >
                           Agregar Cirugía
                         </button>
                      </div>
                    </div>

                    {/* Ansiedad Dental */}
                    <div className="form-group">
                      <label>Nivel de Ansiedad Dental</label>
                      <select
                        value={formData.encuesta_medica.ansiedad_dental.nivel || ""}
                        onChange={(e) => handleDoubleNestedChange("encuesta_medica","ansiedad_dental", "nivel", e.target.value)}
                      >
                        <option value="">Seleccione...</option>
                        <option value="Bajo">Bajo</option>
                        <option value="Moderado">Moderado</option>
                        <option value="Alto">Alto</option>
                      </select>
                    </div>

                    {/* Experiencia Negativa */}
                    <div className="form-group">
                      <label>Experiencia Negativa Previa</label>
                      <input
                        className="checkbox-left-section"
                        type="checkbox"
                        checked={formData.encuesta_medica.ansiedad_dental?.experiencia_negativa_previa || false}
                        onChange={(e) =>
                          handleDoubleNestedChange(
                            "encuesta_medica",
                            "ansiedad_dental",
                            "experiencia_negativa_previa",
                            e.target.checked
                          )
                        }
                      />
                    </div>

                                    {/* ENFERMEDAD GRAVE ADICIONAL - Al final de la encuesta médica */}
                  <div className="form-group">
                    <label>¿Padece alguna enfermedad grave adicional?</label>
                    <select
                      value={formData.encuesta_medica.informacion_general?.enfermedad_grave_adicional?.opcion_principal || ""}
                      onChange={(e) => handleEnfermedadGraveChange('opcion_principal', e.target.value)}
                    >
                      <option value="">Seleccione una opción</option>
                      <option value="otras_enfermedades">Sí</option>
                      <option value="no">No</option>
                    </select>
                  </div>

                  {/* Mostrar opciones múltiples solo si selecciona "Sí" */}
                  {formData.encuesta_medica.informacion_general?.enfermedad_grave_adicional?.opcion_principal === "otras_enfermedades" && (
                    <div className="enfermedades-multiples-section">
                      <h3>Seleccione las enfermedades que padece:</h3>
                      <div className="enfermedades-grid">
                        {ENFERMEDADES.map((item) => {
                          if (item === 'diabetes') {
                            return (
                              <div className="form-group" key="diabetes">
                                <label>
                                  <input
                                    type="checkbox"
                                    checked={sel?.diabetes?.checked || false}
                                    onChange={(e) => setField(['encuesta_medica', 'informacion_general', 'enfermedad_grave_adicional', 'enfermedades_seleccionadas', 'diabetes', 'checked'], e.target.checked)}
                                  />
                                  Diabetes
                                </label>
                                {sel?.diabetes?.checked && (
                                  <select
                                    value={sel?.diabetes?.tipo || ""}
                                    onChange={(e) => setField(['encuesta_medica', 'informacion_general', 'enfermedad_grave_adicional', 'enfermedades_seleccionadas', 'diabetes', 'tipo'], e.target.value)}
                                  >
                                    <option value="">Seleccione tipo</option>
                                    <option value="Tipo 1">Tipo 1</option>
                                    <option value="Tipo 2">Tipo 2</option>
                                    <option value="Gestacional">Gestacional</option>
                                  </select>
                                )}
                              </div>
                            );
                          }
                          if (item === 'hepatitis') {
                            return (
                              <div className="form-group" key="hepatitis">
                                <label>
                                  <input
                                    type="checkbox"
                                    checked={sel?.hepatitis?.checked || false}
                                    onChange={(e) => setField(['encuesta_medica', 'informacion_general', 'enfermedad_grave_adicional', 'enfermedades_seleccionadas', 'hepatitis', 'checked'], e.target.checked)}
                                  />
                                  Hepatitis
                                </label>
                                {sel?.hepatitis?.checked && (
                                  <select
                                    value={sel?.hepatitis?.tipo || ""}
                                    onChange={(e) => setField(['encuesta_medica', 'informacion_general', 'enfermedad_grave_adicional', 'enfermedades_seleccionadas', 'hepatitis', 'tipo'], e.target.value)}
                                  >
                                    <option value="">Seleccione tipo</option>
                                    <option value="A">Hepatitis A</option>
                                    <option value="B">Hepatitis B</option>
                                    <option value="C">Hepatitis C</option>
                                    <option value="D">Hepatitis D</option>
                                    <option value="E">Hepatitis E</option>
                                  </select>
                                )}
                              </div>
                            );
                          }
                          if (item === 'infarto_corazon') {
                            return (
                              <div className="form-group" key="infarto_corazon">
                                <label>
                                  <input
                                    type="checkbox"
                                    checked={sel?.infarto_corazon?.checked || false}
                                    onChange={(e) => setField(['encuesta_medica', 'informacion_general', 'enfermedad_grave_adicional', 'enfermedades_seleccionadas', 'infarto_corazon', 'checked'], e.target.checked)}
                                  />
                                  Infarto de Corazón
                                </label>
                                {sel?.infarto_corazon?.checked && (
                                  <input
                                    type="date"
                                    value={sel?.infarto_corazon?.fecha || ""}
                                    onChange={(e) => setField(['encuesta_medica', 'informacion_general', 'enfermedad_grave_adicional', 'enfermedades_seleccionadas', 'infarto_corazon', 'fecha'], e.target.value)}
                                    placeholder="Fecha del infarto"
                                  />
                                )}
                              </div>
                            );
                          }
                          const [key, label] = item;
                          return (
                            <div className="form-group" key={key}>
                              <label>
                                <input
                                  type="checkbox"
                                  checked={sel?.[key] || false}
                                  onChange={(e) => handleEnfermedadGraveChange(key, e.target.checked)}
                                />
                                {label}
                              </label>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                    </div>

                  

                  <div className="right-section">
                  {/* SECCIÓN: MEDICACIÓN */}
                  <div className="medicacion-col">
                    <h3>Medicación</h3>
                    {(Array.isArray(formData.encuesta_medica.medicacion) ? formData.encuesta_medica.medicacion : []).map((med, index) => (
                      <div key={index} className="form-group-grid array-item">
                        <input
                          className="medicacion-input"
                          type="text"
                          placeholder="Nombre del medicamento"
                          value={med.nombre || ""}
                          onChange={(e) => handleArrayChange("medicacion", index, "nombre", e.target.value, "encuesta_medica")}
                        />
                        <input
                          className="medicacion-input"
                          type="text"
                          placeholder="Dosis"
                          value={med.dosis || ""}
                          onChange={(e) => handleArrayChange("medicacion", index, "dosis", e.target.value, "encuesta_medica")}
                        />
                        <input
                          className="medicacion-input"
                          type="text"
                          placeholder="Frecuencia"
                          value={med.frecuencia || ""}
                          onChange={(e) => handleArrayChange("medicacion", index, "frecuencia", e.target.value, "encuesta_medica")}
                        />
                        <button className="trash-button" type="button" aria-label="Eliminar medicación" onClick={() => handleRemoveItem("medicacion", index)}><TrashIcon /></button>
                      </div>
                    ))}
                    <button
                      className="action-button"
                      type="button"
                      onClick={() => handleAddItem("medicacion", { nombre: "", dosis: "", frecuencia: "" })}
                    >
                      <img src={plusIcon} alt="+" width="16" height="16" className="theme-icon" /> Agregar Medicación
                    </button>
                  </div>

                  {/* SECCIÓN: ALERGIAS */}
                  <div className="alergias-col">
                    <h3>Alergias</h3>
                    {(Array.isArray(formData.encuesta_medica.alergias) ? formData.encuesta_medica.alergias : []).map((alergia, index) => (
                      <div key={index} className="form-group-grid array-item">
                        <input
                          className="alergia-input"
                          type="text"
                          placeholder="Sustancia"
                          value={alergia.sustancia || ""}
                          onChange={(e) => handleArrayChange("alergias", index, "sustancia", e.target.value,"encuesta_medica")}
                        />
                        <input
                          className="alergia-input"
                          type="text"
                          placeholder="Reacción"
                          value={alergia.reaccion || ""}
                          onChange={(e) => handleArrayChange("alergias", index, "reaccion", e.target.value,"encuesta_medica")}
                        />
                        <button className="trash-button" type="button" aria-label="Eliminar alergia" onClick={() => handleRemoveItem("alergias", index)}><TrashIcon /></button>
                      </div>
                    ))}
                    <button
                      className="action-button"
                      type="button"
                      onClick={() => handleAddItem("alergias", { sustancia: "", reaccion: "" })}
                    >
                      <img src={plusIcon} alt="+" width="16" height="16" className="theme-icon" /> Agregar Alergia
                    </button>
                  </div>
        </div>
      </div>
    </section>
  );
};

export default Medic;