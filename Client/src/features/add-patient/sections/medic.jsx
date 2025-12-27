



import React, { useState } from 'react';

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
  // Estado local para mostrar/ocultar secciones de Medicación y Alergias
  const [showMedicacion, setShowMedicacion] = useState(
    Array.isArray(formData.encuesta_medica?.medicacion) && formData.encuesta_medica.medicacion.length > 0
  );
  const [showAlergias, setShowAlergias] = useState(
    Array.isArray(formData.encuesta_medica?.alergias) && formData.encuesta_medica.alergias.length > 0
  );
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
                         setFormData(prev => ({
                           ...prev,
                           encuesta_medica: {
                             ...prev.encuesta_medica,
                             informacion_general: {
                               ...prev.encuesta_medica.informacion_general,
                               ultimo_examen_medico: {
                                 ...prev.encuesta_medica.informacion_general?.ultimo_examen_medico,
                                 estado: e.target.checked
                               }
                             }
                           }
                         }));
                       }}
                     />
                   </div>

                   {formData.encuesta_medica.informacion_general?.ultimo_examen_medico?.estado && (
                     <div className="form-group">
                       <label>Fecha de Último Examen Médico</label>
                       <input
                         type="date"
                         style={{ width: '200px' }}
                         value={formData.encuesta_medica.informacion_general?.ultimo_examen_medico?.fecha || ""}
                         onChange={(e) => {
                           setFormData(prev => ({
                             ...prev,
                             encuesta_medica: {
                               ...prev.encuesta_medica,
                               informacion_general: {
                                 ...prev.encuesta_medica.informacion_general,
                                 ultimo_examen_medico: {
                                   ...prev.encuesta_medica.informacion_general?.ultimo_examen_medico,
                                   fecha: e.target.value
                                 }
                               }
                             }
                           }));
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
                         setFormData(prev => ({
                           ...prev,
                           encuesta_medica: {
                             ...prev.encuesta_medica,
                             informacion_general: {
                               ...prev.encuesta_medica.informacion_general,
                               en_tratamiento_medico: {
                                 ...prev.encuesta_medica.informacion_general?.en_tratamiento_medico,
                                 estado: e.target.checked
                               }
                             }
                           }
                         }));
                       }}
                     />
                   </div>

                   {formData.encuesta_medica.informacion_general?.en_tratamiento_medico?.estado && (
                     <div className="form-group">
                       <label>Explique el tratamiento médico</label>
                       <textarea
                         value={formData.encuesta_medica.informacion_general?.en_tratamiento_medico?.explicacion || ""}
                         onChange={(e) => {
                           setFormData(prev => ({
                             ...prev,
                             encuesta_medica: {
                               ...prev.encuesta_medica,
                               informacion_general: {
                                 ...prev.encuesta_medica.informacion_general,
                                 en_tratamiento_medico: {
                                   ...prev.encuesta_medica.informacion_general?.en_tratamiento_medico,
                                   explicacion: e.target.value
                                 }
                               }
                             }
                           }));
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
                         setFormData(prev => ({
                           ...prev,
                           encuesta_medica: {
                             ...prev.encuesta_medica,
                             informacion_general: {
                               ...prev.encuesta_medica.informacion_general,
                               hospitalizado_anteriormente: {
                                 ...prev.encuesta_medica.informacion_general?.hospitalizado_anteriormente,
                                 estado: e.target.checked
                               }
                             }
                           }
                         }));
                       }}
                     />
                   </div>

                   {formData.encuesta_medica.informacion_general?.hospitalizado_anteriormente?.estado && (
                     <div className="form-group">
                       <label>¿Por qué razón fue hospitalizado?</label>
                       <textarea
                         value={formData.encuesta_medica.informacion_general?.hospitalizado_anteriormente?.razon || ""}
                         onChange={(e) => {
                           setFormData(prev => ({
                             ...prev,
                             encuesta_medica: {
                               ...prev.encuesta_medica,
                               informacion_general: {
                                 ...prev.encuesta_medica.informacion_general,
                                 hospitalizado_anteriormente: {
                                   ...prev.encuesta_medica.informacion_general?.hospitalizado_anteriormente,
                                   razon: e.target.value
                                 }
                               }
                             }
                           }));
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
                         setFormData(prev => ({
                           ...prev,
                           encuesta_medica: {
                             ...prev.encuesta_medica,
                             informacion_general: {
                               ...prev.encuesta_medica.informacion_general,
                               se_cansa_facilmente: e.target.checked
                             }
                           }
                         }));
                       }}
                     />
                   </div>

                   <div className="form-group">
                     <label>¿Ha tenido cambios de peso recientes?</label>
                     <input
                       type="checkbox"
                       checked={formData.encuesta_medica.informacion_general?.cambios_peso_recientes || false}
                       onChange={(e) => {
                         setFormData(prev => ({
                           ...prev,
                           encuesta_medica: {
                             ...prev.encuesta_medica,
                             informacion_general: {
                               ...prev.encuesta_medica.informacion_general,
                               cambios_peso_recientes: e.target.checked
                             }
                           }
                         }));
                       }}
                     />
                   </div>

                   <div className="form-group">
                     <label>¿Tiene dolores o pérdida de oído?</label>
                     <input
                       type="checkbox"
                       checked={formData.encuesta_medica.informacion_general?.dolores_perdida_oido || false}
                       onChange={(e) => {
                         setFormData(prev => ({
                           ...prev,
                           encuesta_medica: {
                             ...prev.encuesta_medica,
                             informacion_general: {
                               ...prev.encuesta_medica.informacion_general,
                               dolores_perdida_oido: e.target.checked
                             }
                           }
                         }));
                       }}
                     />
                   </div>

                   <div className="form-group">
                     <label>¿Tiene sangrado excesivo en cortes?</label>
                     <input
                       type="checkbox"
                       checked={formData.encuesta_medica.informacion_general?.sangrado_excesivo_cortes || false}
                       onChange={(e) => {
                         setFormData(prev => ({
                           ...prev,
                           encuesta_medica: {
                             ...prev.encuesta_medica,
                             informacion_general: {
                               ...prev.encuesta_medica.informacion_general,
                               sangrado_excesivo_cortes: e.target.checked
                             }
                           }
                         }));
                       }}
                     />
                   </div>

                   <div className="form-group">
                     <label>¿Tiene hemorragias espontáneas?</label>
                     <input
                       type="checkbox"
                       checked={formData.encuesta_medica.informacion_general?.hemorragias_espontaneas || false}
                       onChange={(e) => {
                         setFormData(prev => ({
                           ...prev,
                           encuesta_medica: {
                             ...prev.encuesta_medica,
                             informacion_general: {
                               ...prev.encuesta_medica.informacion_general,
                               hemorragias_espontaneas: e.target.checked
                             }
                           }
                         }));
                       }}
                     />
                   </div>

                   <div className="form-group">
                     <label>¿Es seropositivo para VIH?</label>
                     <input
                       type="checkbox"
                       checked={formData.encuesta_medica.informacion_general?.seropositivo_vih || false}
                       onChange={(e) => {
                         setFormData(prev => ({
                           ...prev,
                           encuesta_medica: {
                             ...prev.encuesta_medica,
                             informacion_general: {
                               ...prev.encuesta_medica.informacion_general,
                               seropositivo_vih: e.target.checked
                             }
                           }
                         }));
                       }}
                     />
                   </div>

                   <div className="form-group">
                     <label>¿Tiene dolores de cabeza frecuentes?</label>
                     <input
                       type="checkbox"
                       checked={formData.encuesta_medica.informacion_general?.dolores_cabeza_frecuentes || false}
                       onChange={(e) => {
                         setFormData(prev => ({
                           ...prev,
                           encuesta_medica: {
                             ...prev.encuesta_medica,
                             informacion_general: {
                               ...prev.encuesta_medica.informacion_general,
                               dolores_cabeza_frecuentes: e.target.checked
                             }
                           }
                         }));
                       }}
                     />
                   </div>

                   {/* Campo único de observaciones para todas las preguntas de salud general */}
                   <div className="form-group">
                     <label>Observaciones sobre salud general</label>
                     <textarea
                       value={formData.encuesta_medica.informacion_general?.observaciones_salud_general || ""}
                       onChange={(e) => {
                         setFormData(prev => ({
                           ...prev,
                           encuesta_medica: {
                             ...prev.encuesta_medica,
                             informacion_general: {
                               ...prev.encuesta_medica.informacion_general,
                               observaciones_salud_general: e.target.value
                             }
                           }
                         }));
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
                         setFormData(prev => ({
                           ...prev,
                           encuesta_medica: {
                             ...prev.encuesta_medica,
                             habitos_estilo_vida: {
                               ...prev.encuesta_medica.habitos_estilo_vida,
                               tabaquismo: {
                                 ...prev.encuesta_medica.habitos_estilo_vida?.tabaquismo,
                                 estado: e.target.checked
                               }
                             }
                           }
                         }));
                       }}
                     />
                   </div>
 
                   {formData.encuesta_medica.habitos_estilo_vida?.tabaquismo?.estado && (
                     <div className="form-group">
                       <label>Frecuencia de Tabaquismo</label>
                       <select
                         value={formData.encuesta_medica.habitos_estilo_vida?.tabaquismo?.frecuencia || ""}
                         onChange={(e) => {
                           setFormData(prev => ({
                             ...prev,
                             encuesta_medica: {
                               ...prev.encuesta_medica,
                               habitos_estilo_vida: {
                                 ...prev.encuesta_medica.habitos_estilo_vida,
                                 tabaquismo: {
                                   ...prev.encuesta_medica.habitos_estilo_vida?.tabaquismo,
                                   frecuencia: e.target.value
                                 }
                               }
                             }
                           }));
                         }}
                       >
                         <option value="">Seleccione...</option>
                         <option value="Diario">Diario</option>
                         <option value="6 veces a la semana">6 veces a la semana</option>
                         <option value="5 veces a la semana">5 veces a la semana</option>
                         <option value="4 veces a la semana">4 veces a la semana</option>
                         <option value="3 veces a la semana">3 veces a la semana</option>
                         <option value="2 veces a la semana">2 veces a la semana</option>
                         <option value="1 vez a la semana">1 vez a la semana</option>
                         <option value="1 vez cada 2 semanas">1 vez cada 2 semanas</option>
                         <option value="1 vez cada 3 semanas">1 vez cada 3 semanas</option>
                         <option value="1 vez al mes">1 vez al mes</option>
                         <option value="Ocasional">Ocasional</option>
                       </select>
                     </div>
                   )}
 
                   <div className="form-group">
                     <label>Alcoholismo</label>
                     <input
                       type="checkbox"
                       checked={formData.encuesta_medica.habitos_estilo_vida?.alcoholismo?.estado || false}
                       onChange={(e) => {
                         setFormData(prev => ({
                           ...prev,
                           encuesta_medica: {
                             ...prev.encuesta_medica,
                             habitos_estilo_vida: {
                               ...prev.encuesta_medica.habitos_estilo_vida,
                               alcoholismo: {
                                 ...prev.encuesta_medica.habitos_estilo_vida?.alcoholismo,
                                 estado: e.target.checked
                               }
                             }
                           }
                         }));
                       }}
                     />
                   </div>
 
                   {formData.encuesta_medica.habitos_estilo_vida?.alcoholismo?.estado && (
                     <div className="form-group">
                       <label>Frecuencia de Alcoholismo</label>
                       <select
                         value={formData.encuesta_medica.habitos_estilo_vida?.alcoholismo?.frecuencia || ""}
                         onChange={(e) => {
                           setFormData(prev => ({
                             ...prev,
                             encuesta_medica: {
                               ...prev.encuesta_medica,
                               habitos_estilo_vida: {
                                 ...prev.encuesta_medica.habitos_estilo_vida,
                                 alcoholismo: {
                                   ...prev.encuesta_medica.habitos_estilo_vida?.alcoholismo,
                                   frecuencia: e.target.value
                                 }
                               }
                             }
                           }));
                         }}
                       >
                         <option value="">Seleccione...</option>
                         <option value="Diario">Diario</option>
                         <option value="6 veces a la semana">6 veces a la semana</option>
                         <option value="5 veces a la semana">5 veces a la semana</option>
                         <option value="4 veces a la semana">4 veces a la semana</option>
                         <option value="3 veces a la semana">3 veces a la semana</option>
                         <option value="2 veces a la semana">2 veces a la semana</option>
                         <option value="1 vez a la semana">1 vez a la semana</option>
                         <option value="1 vez cada 2 semanas">1 vez cada 2 semanas</option>
                         <option value="1 vez cada 3 semanas">1 vez cada 3 semanas</option>
                         <option value="1 vez al mes">1 vez al mes</option>
                         <option value="Ocasional">Ocasional</option>
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
                                 setFormData(prev => ({
                                   ...prev,
                                   encuesta_medica: {
                                     ...prev.encuesta_medica,
                                     cirugias_previas: newCirugias
                                   }
                                 }));
                               }}
                               placeholder="Tipo de cirugía"
                             />
                             <button
                               type="button"
                               onClick={() => handleRemoveItem('cirugias_previas', index)}
                               className="trash-button"
                             >
                               🗑️
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
                        
                        {/* Angina de Pecho */}
                        <div className="form-group">
                          <label>
                            <input
                              type="checkbox"
                              checked={formData.encuesta_medica.informacion_general?.enfermedad_grave_adicional?.enfermedades_seleccionadas?.angina_pecho || false}
                              onChange={(e) => handleEnfermedadGraveChange('angina_pecho', e.target.checked)}
                            />
                            Angina de Pecho
                          </label>
                        </div>

                        {/* Arteriosclerosis */}
                        <div className="form-group">
                          <label>
                            <input
                              type="checkbox"
                              checked={formData.encuesta_medica.informacion_general?.enfermedad_grave_adicional?.enfermedades_seleccionadas?.arteriosclerosis || false}
                              onChange={(e) => handleEnfermedadGraveChange('arteriosclerosis', e.target.checked)}
                            />
                            Arteriosclerosis
                          </label>
                        </div>

                        {/* Asma */}
                        <div className="form-group">
                          <label>
                            <input
                              type="checkbox"
                              checked={formData.encuesta_medica.informacion_general?.enfermedad_grave_adicional?.enfermedades_seleccionadas?.asma || false}
                              onChange={(e) => handleEnfermedadGraveChange('asma', e.target.checked)}
                            />
                            Asma
                          </label>
                        </div>

                        {/* Convulsiones/Epilepsia */}
                        <div className="form-group">
                          <label>
                            <input
                              type="checkbox"
                              checked={formData.encuesta_medica.informacion_general?.enfermedad_grave_adicional?.enfermedades_seleccionadas?.convulsiones_epilepsia || false}
                              onChange={(e) => handleEnfermedadGraveChange('convulsiones_epilepsia', e.target.checked)}
                            />
                            Convulsiones/Epilepsia
                          </label>
                        </div>

                        {/* Daño en Válvulas */}
                        <div className="form-group">
                          <label>
                            <input
                              type="checkbox"
                              checked={formData.encuesta_medica.informacion_general?.enfermedad_grave_adicional?.enfermedades_seleccionadas?.dano_valvulas || false}
                              onChange={(e) => handleEnfermedadGraveChange('dano_valvulas', e.target.checked)}
                            />
                            Daño en Válvulas
                          </label>
                        </div>

                        {/* Diabetes */}
                        <div className="form-group">
                          <label>
                            <input
                              type="checkbox"
                              checked={formData.encuesta_medica.informacion_general?.enfermedad_grave_adicional?.enfermedades_seleccionadas?.diabetes?.checked || false}
                              onChange={(e) => {
                                setFormData(prev => ({
                                  ...prev,
                                  encuesta_medica: {
                                    ...prev.encuesta_medica,
                                    informacion_general: {
                                      ...prev.encuesta_medica.informacion_general,
                                      enfermedad_grave_adicional: {
                                        ...prev.encuesta_medica.informacion_general?.enfermedad_grave_adicional,
                                        enfermedades_seleccionadas: {
                                          ...prev.encuesta_medica.informacion_general?.enfermedad_grave_adicional?.enfermedades_seleccionadas,
                                          diabetes: {
                                            ...prev.encuesta_medica.informacion_general?.enfermedad_grave_adicional?.enfermedades_seleccionadas?.diabetes,
                                            checked: e.target.checked
                                          }
                                        }
                                      }
                                    }
                                  }
                                }));
                              }}
                            />
                            Diabetes
                          </label>
                          {formData.encuesta_medica.informacion_general?.enfermedad_grave_adicional?.enfermedades_seleccionadas?.diabetes?.checked && (
                            <select
                              value={formData.encuesta_medica.informacion_general?.enfermedad_grave_adicional?.enfermedades_seleccionadas?.diabetes?.tipo || ""}
                              onChange={(e) => {
                                setFormData(prev => ({
                                  ...prev,
                                  encuesta_medica: {
                                    ...prev.encuesta_medica,
                                    informacion_general: {
                                      ...prev.encuesta_medica.informacion_general,
                                      enfermedad_grave_adicional: {
                                        ...prev.encuesta_medica.informacion_general?.enfermedad_grave_adicional,
                                        enfermedades_seleccionadas: {
                                          ...prev.encuesta_medica.informacion_general?.enfermedad_grave_adicional?.enfermedades_seleccionadas,
                                          diabetes: {
                                            ...prev.encuesta_medica.informacion_general?.enfermedad_grave_adicional?.enfermedades_seleccionadas?.diabetes,
                                            tipo: e.target.value
                                          }
                                        }
                                      }
                                    }
                                  }
                                }));
                              }}
                            >
                              <option value="">Seleccione tipo</option>
                              <option value="Tipo 1">Tipo 1</option>
                              <option value="Tipo 2">Tipo 2</option>
                              <option value="Gestacional">Gestacional</option>
                            </select>
                          )}
                        </div>

                        {/* Enfermedad de Paget */}
                        <div className="form-group">
                          <label>
                            <input
                              type="checkbox"
                              checked={formData.encuesta_medica.informacion_general?.enfermedad_grave_adicional?.enfermedades_seleccionadas?.enfermedad_paget || false}
                              onChange={(e) => handleEnfermedadGraveChange('enfermedad_paget', e.target.checked)}
                            />
                            Enfermedad de Paget
                          </label>
                        </div>

                        {/* Enfermedades del Riñón */}
                        <div className="form-group">
                          <label>
                            <input
                              type="checkbox"
                              checked={formData.encuesta_medica.informacion_general?.enfermedad_grave_adicional?.enfermedades_seleccionadas?.enfermedades_rinon || false}
                              onChange={(e) => handleEnfermedadGraveChange('enfermedades_rinon', e.target.checked)}
                            />
                            Enfermedades del Riñón
                          </label>
                        </div>

                        {/* Enfermedades Familiares */}
                        <div className="form-group">
                          <label>
                            <input
                              type="checkbox"
                              checked={formData.encuesta_medica.informacion_general?.enfermedad_grave_adicional?.enfermedades_seleccionadas?.enfermedades_familiares || false}
                              onChange={(e) => handleEnfermedadGraveChange('enfermedades_familiares', e.target.checked)}
                            />
                            Enfermedades Familiares
                          </label>
                        </div>

                        {/* Enfisema */}
                        <div className="form-group">
                          <label>
                            <input
                              type="checkbox"
                              checked={formData.encuesta_medica.informacion_general?.enfermedad_grave_adicional?.enfermedades_seleccionadas?.enfisema || false}
                              onChange={(e) => handleEnfermedadGraveChange('enfisema', e.target.checked)}
                            />
                            Enfisema
                          </label>
                        </div>

                        {/* Fiebre Reumática */}
                        <div className="form-group">
                          <label>
                            <input
                              type="checkbox"
                              checked={formData.encuesta_medica.informacion_general?.enfermedad_grave_adicional?.enfermedades_seleccionadas?.fiebre_reumatica || false}
                              onChange={(e) => handleEnfermedadGraveChange('fiebre_reumatica', e.target.checked)}
                            />
                            Fiebre Reumática
                          </label>
                        </div>

                        {/* Gastritis/Úlcera */}
                        <div className="form-group">
                          <label>
                            <input
                              type="checkbox"
                              checked={formData.encuesta_medica.informacion_general?.enfermedad_grave_adicional?.enfermedades_seleccionadas?.gastritis_ulcera || false}
                              onChange={(e) => handleEnfermedadGraveChange('gastritis_ulcera', e.target.checked)}
                            />
                            Gastritis/Úlcera
                          </label>
                        </div>

                        {/* Hepatitis */}
                        <div className="form-group">
                          <label>
                            <input
                              type="checkbox"
                              checked={formData.encuesta_medica.informacion_general?.enfermedad_grave_adicional?.enfermedades_seleccionadas?.hepatitis?.checked || false}
                              onChange={(e) => {
                                setFormData(prev => ({
                                  ...prev,
                                  encuesta_medica: {
                                    ...prev.encuesta_medica,
                                    informacion_general: {
                                      ...prev.encuesta_medica.informacion_general,
                                      enfermedad_grave_adicional: {
                                        ...prev.encuesta_medica.informacion_general?.enfermedad_grave_adicional,
                                        enfermedades_seleccionadas: {
                                          ...prev.encuesta_medica.informacion_general?.enfermedad_grave_adicional?.enfermedades_seleccionadas,
                                          hepatitis: {
                                            ...prev.encuesta_medica.informacion_general?.enfermedad_grave_adicional?.enfermedades_seleccionadas?.hepatitis,
                                            checked: e.target.checked
                                          }
                                        }
                                      }
                                    }
                                  }
                                }));
                              }}
                            />
                            Hepatitis
                          </label>
                          {formData.encuesta_medica.informacion_general?.enfermedad_grave_adicional?.enfermedades_seleccionadas?.hepatitis?.checked && (
                            <select
                              value={formData.encuesta_medica.informacion_general?.enfermedad_grave_adicional?.enfermedades_seleccionadas?.hepatitis?.tipo || ""}
                              onChange={(e) => {
                                setFormData(prev => ({
                                  ...prev,
                                  encuesta_medica: {
                                    ...prev.encuesta_medica,
                                    informacion_general: {
                                      ...prev.encuesta_medica.informacion_general,
                                      enfermedad_grave_adicional: {
                                        ...prev.encuesta_medica.informacion_general?.enfermedad_grave_adicional,
                                        enfermedades_seleccionadas: {
                                          ...prev.encuesta_medica.informacion_general?.enfermedad_grave_adicional?.enfermedades_seleccionadas,
                                          hepatitis: {
                                            ...prev.encuesta_medica.informacion_general?.enfermedad_grave_adicional?.enfermedades_seleccionadas?.hepatitis,
                                            tipo: e.target.value
                                          }
                                        }
                                      }
                                    }
                                  }
                                }));
                              }}
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

                        {/* Hipertensión */}
                        <div className="form-group">
                          <label>
                            <input
                              type="checkbox"
                              checked={formData.encuesta_medica.informacion_general?.enfermedad_grave_adicional?.enfermedades_seleccionadas?.hipertension || false}
                              onChange={(e) => handleEnfermedadGraveChange('hipertension', e.target.checked)}
                            />
                            Hipertensión
                          </label>
                        </div>

                        {/* Hipertiroidismo */}
                        <div className="form-group">
                          <label>
                            <input
                              type="checkbox"
                              checked={formData.encuesta_medica.informacion_general?.enfermedad_grave_adicional?.enfermedades_seleccionadas?.hipertiroidismo || false}
                              onChange={(e) => handleEnfermedadGraveChange('hipertiroidismo', e.target.checked)}
                            />
                            Hipertiroidismo
                          </label>
                        </div>

                        {/* Infarto de Corazón */}
                        <div className="form-group">
                          <label>
                            <input
                              type="checkbox"
                              checked={formData.encuesta_medica.informacion_general?.enfermedad_grave_adicional?.enfermedades_seleccionadas?.infarto_corazon?.checked || false}
                              onChange={(e) => {
                                setFormData(prev => ({
                                  ...prev,
                                  encuesta_medica: {
                                    ...prev.encuesta_medica,
                                    informacion_general: {
                                      ...prev.encuesta_medica.informacion_general,
                                      enfermedad_grave_adicional: {
                                        ...prev.encuesta_medica.informacion_general?.enfermedad_grave_adicional,
                                        enfermedades_seleccionadas: {
                                          ...prev.encuesta_medica.informacion_general?.enfermedad_grave_adicional?.enfermedades_seleccionadas,
                                          infarto_corazon: {
                                            ...prev.encuesta_medica.informacion_general?.enfermedad_grave_adicional?.enfermedades_seleccionadas?.infarto_corazon,
                                            checked: e.target.checked
                                          }
                                        }
                                      }
                                    }
                                  }
                                }));
                              }}
                            />
                            Infarto de Corazón
                          </label>
                          {formData.encuesta_medica.informacion_general?.enfermedad_grave_adicional?.enfermedades_seleccionadas?.infarto_corazon?.checked && (
                            <input
                              type="date"
                              value={formData.encuesta_medica.informacion_general?.enfermedad_grave_adicional?.enfermedades_seleccionadas?.infarto_corazon?.fecha || ""}
                              onChange={(e) => {
                                setFormData(prev => ({
                                  ...prev,
                                  encuesta_medica: {
                                    ...prev.encuesta_medica,
                                    informacion_general: {
                                      ...prev.encuesta_medica.informacion_general,
                                      enfermedad_grave_adicional: {
                                        ...prev.encuesta_medica.informacion_general?.enfermedad_grave_adicional,
                                        enfermedades_seleccionadas: {
                                          ...prev.encuesta_medica.informacion_general?.enfermedad_grave_adicional?.enfermedades_seleccionadas,
                                          infarto_corazon: {
                                            ...prev.encuesta_medica.informacion_general?.enfermedad_grave_adicional?.enfermedades_seleccionadas?.infarto_corazon,
                                            fecha: e.target.value
                                          }
                                        }
                                      }
                                    }
                                  }
                                }));
                              }}
                              placeholder="Fecha del infarto"
                            />
                          )}
                        </div>

                        {/* Insuficiencia Renal */}
                        <div className="form-group">
                          <label>
                            <input
                              type="checkbox"
                              checked={formData.encuesta_medica.informacion_general?.enfermedad_grave_adicional?.enfermedades_seleccionadas?.insuficiencia_renal || false}
                              onChange={(e) => handleEnfermedadGraveChange('insuficiencia_renal', e.target.checked)}
                            />
                            Insuficiencia Renal
                          </label>
                        </div>

                        {/* Lupus Eritematoso */}
                        <div className="form-group">
                          <label>
                            <input
                              type="checkbox"
                              checked={formData.encuesta_medica.informacion_general?.enfermedad_grave_adicional?.enfermedades_seleccionadas?.lupus_eritematoso || false}
                              onChange={(e) => handleEnfermedadGraveChange('lupus_eritematoso', e.target.checked)}
                            />
                            Lupus Eritematoso
                          </label>
                        </div>

                        {/* Marcapasos */}
                        <div className="form-group">
                          <label>
                            <input
                              type="checkbox"
                              checked={formData.encuesta_medica.informacion_general?.enfermedad_grave_adicional?.enfermedades_seleccionadas?.marcapasos || false}
                              onChange={(e) => handleEnfermedadGraveChange('marcapasos', e.target.checked)}
                            />
                            Marcapasos
                          </label>
                        </div>

                        {/* Osteogénesis Imperfecta */}
                        <div className="form-group">
                          <label>
                            <input
                              type="checkbox"
                              checked={formData.encuesta_medica.informacion_general?.enfermedad_grave_adicional?.enfermedades_seleccionadas?.osteogenesis_imperfecta || false}
                              onChange={(e) => handleEnfermedadGraveChange('osteogenesis_imperfecta', e.target.checked)}
                            />
                            Osteogénesis Imperfecta
                          </label>
                        </div>

                        {/* Osteoporosis */}
                        <div className="form-group">
                          <label>
                            <input
                              type="checkbox"
                              checked={formData.encuesta_medica.informacion_general?.enfermedad_grave_adicional?.enfermedades_seleccionadas?.osteoporosis || false}
                              onChange={(e) => handleEnfermedadGraveChange('osteoporosis', e.target.checked)}
                            />
                            Osteoporosis
                          </label>
                        </div>

                        {/* Paratiroidismo */}
                        <div className="form-group">
                          <label>
                            <input
                              type="checkbox"
                              checked={formData.encuesta_medica.informacion_general?.enfermedad_grave_adicional?.enfermedades_seleccionadas?.paratiroidismo || false}
                              onChange={(e) => handleEnfermedadGraveChange('paratiroidismo', e.target.checked)}
                            />
                            Paratiroidismo
                          </label>
                        </div>

                        {/* Presión Arterial Baja */}
                        <div className="form-group">
                          <label>
                            <input
                              type="checkbox"
                              checked={formData.encuesta_medica.informacion_general?.enfermedad_grave_adicional?.enfermedades_seleccionadas?.presion_arterial_baja || false}
                              onChange={(e) => handleEnfermedadGraveChange('presion_arterial_baja', e.target.checked)}
                            />
                            Presión Arterial Baja
                          </label>
                        </div>

                        {/* Radiaciones Cara/Cuello */}
                        <div className="form-group">
                          <label>
                            <input
                              type="checkbox"
                              checked={formData.encuesta_medica.informacion_general?.enfermedad_grave_adicional?.enfermedades_seleccionadas?.radiaciones_cara_cuello || false}
                              onChange={(e) => handleEnfermedadGraveChange('radiaciones_cara_cuello', e.target.checked)}
                            />
                            Radiaciones Cara/Cuello
                          </label>
                        </div>

                        {/* Retención de Líquidos */}
                        <div className="form-group">
                          <label>
                            <input
                              type="checkbox"
                              checked={formData.encuesta_medica.informacion_general?.enfermedad_grave_adicional?.enfermedades_seleccionadas?.retencion_liquidos || false}
                              onChange={(e) => handleEnfermedadGraveChange('retencion_liquidos', e.target.checked)}
                            />
                            Retención de Líquidos
                          </label>
                        </div>

                        {/* Rinitis Alérgica */}
                        <div className="form-group">
                          <label>
                            <input
                              type="checkbox"
                              checked={formData.encuesta_medica.informacion_general?.enfermedad_grave_adicional?.enfermedades_seleccionadas?.rinitis_alergica || false}
                              onChange={(e) => handleEnfermedadGraveChange('rinitis_alergica', e.target.checked)}
                            />
                            Rinitis Alérgica
                          </label>
                        </div>

                        {/* Sinusitis */}
                        <div className="form-group">
                          <label>
                            <input
                              type="checkbox"
                              checked={formData.encuesta_medica.informacion_general?.enfermedad_grave_adicional?.enfermedades_seleccionadas?.sinusitis || false}
                              onChange={(e) => handleEnfermedadGraveChange('sinusitis', e.target.checked)}
                            />
                            Sinusitis
                          </label>
                        </div>

                        {/* Soplo Cardíaco */}
                        <div className="form-group">
                          <label>
                            <input
                              type="checkbox"
                              checked={formData.encuesta_medica.informacion_general?.enfermedad_grave_adicional?.enfermedades_seleccionadas?.soplo_cardiaco || false}
                              onChange={(e) => handleEnfermedadGraveChange('soplo_cardiaco', e.target.checked)}
                            />
                            Soplo Cardíaco
                          </label>
                        </div>

                        {/* Tos Persistente con Sangre */}
                        <div className="form-group">
                          <label>
                            <input
                              type="checkbox"
                              checked={formData.encuesta_medica.informacion_general?.enfermedad_grave_adicional?.enfermedades_seleccionadas?.tos_persistente_sangre || false}
                              onChange={(e) => handleEnfermedadGraveChange('tos_persistente_sangre', e.target.checked)}
                            />
                            Tos Persistente con Sangre
                          </label>
                        </div>

                        {/* Trastornos de Coagulación */}
                        <div className="form-group">
                          <label>
                            <input
                              type="checkbox"
                              checked={formData.encuesta_medica.informacion_general?.enfermedad_grave_adicional?.enfermedades_seleccionadas?.trastornos_coagulacion || false}
                              onChange={(e) => handleEnfermedadGraveChange('trastornos_coagulacion', e.target.checked)}
                            />
                            Trastornos de Coagulación
                          </label>
                        </div>

                        {/* Transfusiones Sanguíneas */}
                        <div className="form-group">
                          <label>
                            <input
                              type="checkbox"
                              checked={formData.encuesta_medica.informacion_general?.enfermedad_grave_adicional?.enfermedades_seleccionadas?.transfusiones_sanguineas || false}
                              onChange={(e) => handleEnfermedadGraveChange('transfusiones_sanguineas', e.target.checked)}
                            />
                            Transfusiones Sanguíneas
                          </label>
                        </div>

                        {/* Transplantes de Órganos */}
                        <div className="form-group">
                          <label>
                            <input
                              type="checkbox"
                              checked={formData.encuesta_medica.informacion_general?.enfermedad_grave_adicional?.enfermedades_seleccionadas?.transplantes_organos || false}
                              onChange={(e) => handleEnfermedadGraveChange('transplantes_organos', e.target.checked)}
                            />
                            Transplantes de Órganos
                          </label>
                        </div>

                        {/* Tratamiento Inmunosupresor */}
                        <div className="form-group">
                          <label>
                            <input
                              type="checkbox"
                              checked={formData.encuesta_medica.informacion_general?.enfermedad_grave_adicional?.enfermedades_seleccionadas?.tratamiento_inmuno_supresion || false}
                              onChange={(e) => handleEnfermedadGraveChange('tratamiento_inmuno_supresion', e.target.checked)}
                            />
                            Tratamiento Inmunosupresor
                          </label>
                        </div>

                        {/* Tuberculosis */}
                        <div className="form-group">
                          <label>
                            <input
                              type="checkbox"
                              checked={formData.encuesta_medica.informacion_general?.enfermedad_grave_adicional?.enfermedades_seleccionadas?.tuberculosis || false}
                              onChange={(e) => handleEnfermedadGraveChange('tuberculosis', e.target.checked)}
                            />
                            Tuberculosis
                          </label>
                        </div>

                        {/* Anemia */}
                        <div className="form-group">
                          <label>
                            <input
                              type="checkbox"
                              checked={formData.encuesta_medica.informacion_general?.enfermedad_grave_adicional?.enfermedades_seleccionadas?.anemia || false}
                              onChange={(e) => handleEnfermedadGraveChange('anemia', e.target.checked)}
                            />
                            Anemia
                          </label>
                        </div>

                        {/* SIDA */}
                        <div className="form-group">
                          <label>
                            <input
                              type="checkbox"
                              checked={formData.encuesta_medica.informacion_general?.enfermedad_grave_adicional?.enfermedades_seleccionadas?.sida || false}
                              onChange={(e) => handleEnfermedadGraveChange('sida', e.target.checked)}
                            />
                            SIDA
                          </label>
                        </div>

                        {/* Arteroesclerosis */}
                        <div className="form-group">
                          <label>
                            <input
                              type="checkbox"
                              checked={formData.encuesta_medica.informacion_general?.enfermedad_grave_adicional?.enfermedades_seleccionadas?.arteroesclerosis || false}
                              onChange={(e) => handleEnfermedadGraveChange('arteroesclerosis', e.target.checked)}
                            />
                            Arteroesclerosis
                          </label>
                        </div>

                        {/* Hipotiroidismo */}
                        <div className="form-group">
                          <label>
                            <input
                              type="checkbox"
                              checked={formData.encuesta_medica.informacion_general?.enfermedad_grave_adicional?.enfermedades_seleccionadas?.hipotiroidismo || false}
                              onChange={(e) => handleEnfermedadGraveChange('hipotiroidismo', e.target.checked)}
                            />
                            Hipotiroidismo
                          </label>
                        </div>

                        {/* Cáncer */}
                        <div className="form-group">
                          <label>
                            <input
                              type="checkbox"
                              checked={formData.encuesta_medica.informacion_general?.enfermedad_grave_adicional?.enfermedades_seleccionadas?.cancer || false}
                              onChange={(e) => handleEnfermedadGraveChange('cancer', e.target.checked)}
                            />
                            Cáncer
                          </label>
                        </div>

                        {/* Esclerodermia */}
                        <div className="form-group">
                          <label>
                            <input
                              type="checkbox"
                              checked={formData.encuesta_medica.informacion_general?.enfermedad_grave_adicional?.enfermedades_seleccionadas?.esclerodermia || false}
                              onChange={(e) => handleEnfermedadGraveChange('esclerodermia', e.target.checked)}
                            />
                            Esclerodermia
                          </label>
                        </div>

                        {/* Enfermedades de la Sangre */}
                        <div className="form-group">
                          <label>
                            <input
                              type="checkbox"
                              checked={formData.encuesta_medica.informacion_general?.enfermedad_grave_adicional?.enfermedades_seleccionadas?.enfermedades_sangre || false}
                              onChange={(e) => handleEnfermedadGraveChange('enfermedades_sangre', e.target.checked)}
                            />
                            Enfermedades de la Sangre
                          </label>
                        </div>

                        {/* Presión Arterial Alta */}
                        <div className="form-group">
                          <label>
                            <input
                              type="checkbox"
                              checked={formData.encuesta_medica.informacion_general?.enfermedad_grave_adicional?.enfermedades_seleccionadas?.presion_arterial_alta || false}
                              onChange={(e) => handleEnfermedadGraveChange('presion_arterial_alta', e.target.checked)}
                            />
                            Presión Arterial Alta
                          </label>
                        </div>

                      </div>
                    </div>
                  )}

                    </div>

                  

                  <div className="right-section">
                  {/* SECCIÓN: MEDICACIÓN */}
                  <div className="medicacion-col">
                    <h3>Medicación</h3>
                    {showMedicacion && (
                      <>
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
                            {Array.isArray(formData.encuesta_medica.medicacion) && formData.encuesta_medica.medicacion.length > 0 && (
                              <button className="trash-button" type="button" onClick={() => handleRemoveItem("medicacion", index)}>🗑️</button>
                            )}
                          </div>
                        ))}
                      </>
                    )}
                    <button
                      className="action-button"
                      type="button"
                      onClick={() => {
                        if (!showMedicacion) setShowMedicacion(true);
                        handleAddItem("medicacion", { nombre: "", dosis: "", frecuencia: "" });
                      }}
                    >
                      ➕ Agregar Medicación
                    </button>
                  </div>

                  {/* SECCIÓN: ALERGIAS */}
                  <div className="alergias-col">
                    <h3>Alergias</h3>
                    {showAlergias && (
                      <>
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
                            {Array.isArray(formData.encuesta_medica.alergias) && formData.encuesta_medica.alergias.length > 0 && (
                              <button className="trash-button" type="button" onClick={() => handleRemoveItem("alergias", index)}>🗑️</button>
                            )}
                          </div>
                        ))}
                      </>
                    )}
                    <button
                      className="action-button"
                      type="button"
                      onClick={() => {
                        if (!showAlergias) setShowAlergias(true);
                        handleAddItem("alergias", { sustancia: "", reaccion: "" });
                      }}
                    >
                      ➕ Agregar Alergia
                    </button>
                  </div>
        </div>
      </div>
    </section>
  );
};

export default Medic;