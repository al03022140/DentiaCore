const WomenSection = ({ 
  formData, 
  setFormData, 
  handleDoubleNestedChange 
}) => {
  // Solo renderizar si el sexo es Femenino
  if (formData.sexo !== "Femenino") {
    return null;
  }

  return (
    <section className="form-section">
      <h2>Información Específica para Mujeres</h2>
      <div className="form-group-grid">
                      
                      {/* Ha estado embarazada */}
                      <div className="form-group">
                        <label>¿Ha estado embarazada?</label>
                        <input
                          type="checkbox"
                          checked={formData.informacion_femenina?.ha_estado_embarazada || false}
                          onChange={(e) => {
                            setFormData(prev => ({
                              ...prev,
                              informacion_femenina: {
                                ...prev.informacion_femenina,
                                ha_estado_embarazada: e.target.checked
                              }
                            }));
                          }}
                        />
                      </div>

                      {/* Campos condicionales si ha estado embarazada */}
                      {formData.informacion_femenina?.ha_estado_embarazada && (
                        <>
                          <div className="form-group">
                            <label>Semanas de Gestación</label>
                            <input
                              type="number"
                              className="no-spinner"
                              value={formData.encuesta_medica.embarazo.semanas_gestacion || ""}
                              onChange={(e) =>
                                handleDoubleNestedChange(
                                  "encuesta_medica",
                                  "embarazo",
                                  "semanas_gestacion",
                                  e.target.value
                                )
                              }
                            />
                          </div>

                          <div className="form-group">
                            <label>¿Cómo fue el parto?</label>
                            <select
                              value={formData.informacion_femenina?.como_fue_parto || ""}
                              onChange={(e) => {
                                setFormData(prev => ({
                                  ...prev,
                                  informacion_femenina: {
                                    ...prev.informacion_femenina,
                                    como_fue_parto: e.target.value,
                                    tipo_parto_detallado: "", // Reset detailed type when main type changes
                                    complicaciones_parto: "" // Reset complications description
                                  }
                                }));
                              }}
                            >
                              <option value="">Seleccione una opción...</option>
                              <option value="normal">Normal</option>
                              <option value="cesarea">Cesárea</option>
                              <option value="complicaciones">Con complicaciones</option>
                            </select>
                          </div>

                          {/* Selector detallado de tipo de parto con complicaciones */}
                          {formData.informacion_femenina?.como_fue_parto === 'complicaciones' && (
                            <div className="form-group">
                              <label>Tipo específico de parto</label>
                              <select
                                value={formData.informacion_femenina?.tipo_parto_detallado || ""}
                                onChange={(e) => {
                                  setFormData(prev => ({
                                    ...prev,
                                    informacion_femenina: {
                                      ...prev.informacion_femenina,
                                      tipo_parto_detallado: e.target.value,
                                      complicaciones_parto: "" // Reset custom description when changing type
                                    }
                                  }));
                                }}
                              >
                                <option value="">Seleccione el tipo específico...</option>
                                
                                {/* Opciones sin complicaciones mayores */}
                                <optgroup label="Partos Asistidos">
                                  <option value="forceps">Asistido con fórceps</option>
                                  <option value="ventosa">Asistido con ventosa</option>
                                  <option value="cesarea_programada">Cesárea programada sin complicaciones</option>
                                  <option value="cesarea_electiva">Cesárea electiva</option>
                                  <option value="parto_prolongado">Trabajo de parto prolongado pero sin complicaciones mayores</option>
                                  <option value="parto_instrumentado">Parto instrumentado sin complicaciones</option>
                                </optgroup>

                                {/* Opciones con complicaciones */}
                                <optgroup label="🔴 Opciones con complicaciones">
                                  <option value="cesarea_urgencia">Cesárea de urgencia</option>
                                  <option value="parto_distocico">Parto distócico</option>
                                  <option value="complicaciones_hemorragicas">Complicaciones hemorrágicas</option>
                                  <option value="presentacion_anomala">Presentación anómala</option>
                                  <option value="parto_prematuro">Parto prematuro</option>
                                  <option value="desprendimiento_placenta">Desprendimiento prematuro de placenta</option>
                                  <option value="sufrimiento_fetal">Sufrimiento fetal</option>
                                  <option value="retencion_placenta">Retención de placenta</option>
                                  <option value="otro">Otro</option>
                                </optgroup>
                              </select>
                            </div>
                          )}

                          {/* Campo de descripción personalizada cuando se selecciona "Otro" */}
                          {formData.informacion_femenina?.tipo_parto_detallado === 'otro' && (
                            <div className="form-group">
                              <label>Describa el tipo de parto</label>
                              <textarea
                                value={formData.informacion_femenina?.complicaciones_parto || ''}
                                onChange={(e) => {
                                  setFormData(prev => ({
                                    ...prev,
                                    informacion_femenina: {
                                      ...prev.informacion_femenina,
                                      complicaciones_parto: e.target.value
                                    }
                                  }));
                                }}
                                placeholder="Describa los detalles del parto..."
                                rows="3"
                              />
                            </div>
                          )}

                          <div className="form-group">
                            <label>Fecha del último parto</label>
                            <input
                              type="date"
                              value={formData.informacion_femenina?.fecha_ultimo_parto || ""}
                              onChange={(e) => {
                                setFormData(prev => ({
                                  ...prev,
                                  informacion_femenina: {
                                    ...prev.informacion_femenina,
                                    fecha_ultimo_parto: e.target.value
                                  }
                                }));
                              }}
                            />
                          </div>
                        </>
                      )}

                      {/* Menopausia */}
                      <div className="form-group">
                        <label>¿Está en menopausia?</label>
                        <input
                          type="checkbox"
                          checked={formData.informacion_femenina?.menopausia || false}
                          onChange={(e) => {
                            setFormData(prev => ({
                              ...prev,
                              informacion_femenina: {
                                ...prev.informacion_femenina,
                                menopausia: e.target.checked
                              }
                            }));
                          }}
                        />
                      </div>

                      {/* Alteraciones del ciclo menstrual */}
                      <div className="form-group">
                        <label>¿Tiene alteraciones del ciclo menstrual?</label>
                        <input
                          type="checkbox"
                          checked={formData.informacion_femenina?.alteraciones_ciclo_menstrual || false}
                          onChange={(e) => {
                            setFormData(prev => ({
                              ...prev,
                              informacion_femenina: {
                                ...prev.informacion_femenina,
                                alteraciones_ciclo_menstrual: e.target.checked
                              }
                            }));
                          }}
                        />
                      </div>

                      {/* Fecha de última menstruación - Solo si no está en menopausia */}
                      {!formData.informacion_femenina?.menopausia && (
                        <div className="form-group">
                          <label>Fecha de última menstruación</label>
                          <input
                            type="date"
                            value={formData.informacion_femenina?.fecha_ultima_menstruacion || ""}
                            onChange={(e) => {
                              setFormData(prev => ({
                                ...prev,
                                informacion_femenina: {
                                  ...prev.informacion_femenina,
                                  fecha_ultima_menstruacion: e.target.value
                                }
                              }));
                            }}
                          />
                        </div>
                      )}

                      {/* Toma anticonceptivos */}
                      <div className="form-group">
                        <label>¿Toma anticonceptivos?</label>
                        <input
                          type="checkbox"
                          checked={formData.informacion_femenina?.toma_anticonceptivos || false}
                          onChange={(e) => {
                            setFormData(prev => ({
                              ...prev,
                              informacion_femenina: {
                                ...prev.informacion_femenina,
                                toma_anticonceptivos: e.target.checked
                              }
                            }));
                          }}
                        />
                      </div>

      </div>
    </section>
  );
};

export default WomenSection;