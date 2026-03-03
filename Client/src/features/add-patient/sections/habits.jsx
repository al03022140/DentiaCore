const Habits = ({ 
  formData, 
  handleNestedChange, 
  handleDoubleNestedChange, 
  handleToggleAzucar 
}) => {
  return (
    <section className="form-section">
      <h2>Hábitos de Higiene Bucodental</h2>
      <div className="habitos-higiene-grid">
                    {/* Checkbox para usar cepillo dental */}
                    <div className="form-group">
                      <label>¿Usa Cepillo Dental?</label>
                      <input
                        type="checkbox"
                        checked={formData.habitos_higiene.cepillo_dental  || false}
                        onChange={(e) =>
                          handleNestedChange("habitos_higiene", "cepillo_dental", e.target.checked)
                        }
                      />
                    </div>

                    {/* Campos adicionales que solo aparecen si se activa el checkbox */}
                    {formData.habitos_higiene.cepillo_dental && (
                      <>
                        <div className="form-group">
                          <label>Frecuencia de Cambio de Cepillo</label>
                          <select
                            value={formData.habitos_higiene.frecuencia_cambio_cepillo || ""}
                            onChange={(e) =>
                              handleNestedChange("habitos_higiene", "frecuencia_cambio_cepillo", e.target.value)
                            }
                          >
                            <option value="">Seleccione...</option>
                            <option value="Cada semana">Cada semana</option>
                            <option value="Cada 2 semanas">Cada 2 semanas</option>
                            <option value="Cada 3 semanas">Cada 3 semanas</option>
                            <option value="Cada 4 semanas">Cada 4 semanas</option>
                            <option value="Cada mes">Cada mes</option>
                            <option value="Cada 2 meses">Cada 2 meses</option>
                            <option value="Cada 3 meses o más">Cada 3 meses o más</option>
                          </select>
                        </div>

                        <div className="form-group">
                          <label>Número de Cepillados/Día</label>
                          <select
                            value={formData.habitos_higiene.numero_cepillados_dia || ""}
                            onChange={(e) =>
                              handleNestedChange("habitos_higiene", "numero_cepillados_dia", e.target.value)
                            }
                          >
                            <option value="">Seleccione...</option>
                            <option value="0">0</option>
                            <option value="1">1</option>
                            <option value="2">2</option>
                            <option value="3">3</option>
                            <option value="4">4</option>
                            <option value="5 o más">5 o más</option>
                          </select>
                        </div>

                        <div className="form-group">
                          <label>Tipo de Cepillo</label>
                          <select
                            value={formData.habitos_higiene.tipo_cepillo || ""}
                            onChange={(e) =>
                              handleNestedChange("habitos_higiene", "tipo_cepillo", e.target.value)
                            }
                          >
                            <option value="">Seleccione...</option>
                            <option value="Suave">Suave</option>
                            <option value="Medio">Medio</option>
                            <option value="Duro">Duro</option>
                            <option value="Eléctrico">Eléctrico</option>
                          </select>
                        </div>
                      </>
                    )}

                    {/* Uso de Seda Dental */}
                    <div className="form-group">
                      <label>Uso de Seda Dental</label>
                      <select
                        value={formData.habitos_higiene.seda_dental || ""}
                        onChange={(e) =>
                          handleNestedChange("habitos_higiene", "seda_dental", e.target.value)
                        }
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
                        <option value="No usa">No usa</option>
                      </select>
                    </div>

                    {/* Uso de Enjuague Bucal */}
                    <div className="form-group">
                      <label>¿Usa Enjuague Bucal?</label>
                      <input
                        type="checkbox"
                        checked={formData.habitos_higiene.uso_enjuague_bucal.usa || false}
                        onChange={(e) =>
                          handleDoubleNestedChange("habitos_higiene", "uso_enjuague_bucal", "usa", e.target.checked)
                        }
                      />
                    </div>
                    {formData.habitos_higiene.uso_enjuague_bucal.usa && (
                      <>
                        <div className="form-group">
                          <label>Tipo de Enjuague Bucal</label>
                          <select
                            value={formData.habitos_higiene.uso_enjuague_bucal.tipo || ""}
                            onChange={(e) =>
                              handleDoubleNestedChange("habitos_higiene", "uso_enjuague_bucal", "tipo", e.target.value)
                            }
                          >
                            <option value="">Seleccione...</option>
                            <option value="Con flúor">Con flúor</option>
                            <option value="Sin flúor">Sin flúor</option>
                            <option value="Con alcohol">Con alcohol</option>
                            <option value="Sin alcohol">Sin alcohol</option>
                          </select>
                        </div>
                        <div className="form-group">
                          <label>Frecuencia de Uso</label>
                          <select
                            value={formData.habitos_higiene.uso_enjuague_bucal.frecuencia || ""}
                            onChange={(e) =>
                              handleDoubleNestedChange("habitos_higiene", "uso_enjuague_bucal", "frecuencia", e.target.value)
                            }
                          >
                            <option value="">Seleccione...</option>
                            <option value="Diario">Diario</option>
                            <option value="6 veces a la semana">6 veces a la semana</option>
                            <option value="5 veces a la semana">5 veces a la semana</option>
                            <option value="4 veces a la semana">4 veces a la semana</option>
                            <option value="3 veces a la semana">3 veces a la semana</option>
                            <option value="2 veces a la semana">2 veces a la semana</option>
                            <option value="1 vez a la semana">1 vez a la semana</option>
                            <option value="No usa">No usa</option>
                          </select>
                        </div>
                      </>
                    )}

                    {/* Consumo de Azúcar */}
                    <div className="form-group">
                      <label>Nivel de Consumo de Azúcar</label>
                      <select
                        value={formData.habitos_higiene.consumo_azucar.nivel || ""}
                        onChange={(e) =>
                          handleDoubleNestedChange("habitos_higiene", "consumo_azucar", "nivel", e.target.value)
                        }
                      >
                        <option value="">Seleccione...</option>
                        <option value="No">No</option>
                        <option value="Bajo">Bajo</option>
                        <option value="Medio">Medio</option>
                        <option value="Alto">Alto</option>
                      </select>
                    </div>
                    <div className="form-group">
                      <label>Tipos de Azúcar Consumida</label>
                      <div style={{ display: "flex", gap: "1rem" }}>
                        <label>
                          <input
                            type="checkbox"
                            checked={formData.habitos_higiene.consumo_azucar.tipo.includes("Gaseosas")}
                            onChange={() => handleToggleAzucar("Gaseosas")}
                          />
                          Gaseosas
                        </label>
                        <label>
                          <input
                            type="checkbox"
                            checked={formData.habitos_higiene.consumo_azucar.tipo.includes("Dulces")}
                            onChange={() => handleToggleAzucar("Dulces")}
                          />
                          Dulces
                        </label>
                      </div>
                    </div>

                    {/* Mastica Chicle */}
                    <div className="form-group">
                      <label>¿Mastica Chicle?</label>
                      <select
                        value={formData.habitos_higiene.mastica_chicle.tipo || ""}
                        onChange={(e) =>
                          handleDoubleNestedChange("habitos_higiene", "mastica_chicle", "tipo", e.target.value)
                        }
                      >
                        <option value="">Seleccione...</option>
                        <option value="Sí">Sí</option>
                        <option value="No">No</option>
                      </select>
                    </div>
                    {formData.habitos_higiene.mastica_chicle.tipo === "Sí" && (
                      <div className="form-group">
                        <label>Frecuencia al Masticar Chicle</label>
                        <select
                          value={formData.habitos_higiene.mastica_chicle.frecuencia || ""}
                          onChange={(e) =>
                            handleDoubleNestedChange("habitos_higiene", "mastica_chicle", "frecuencia", e.target.value)
                          }
                        >
                          <option value="">Seleccione...</option>
                          <option value="1 vez cada mes">1 vez cada mes</option>
                          <option value="1 vez cada 3 semanas">1 vez cada 3 semanas</option>
                          <option value="1 vez cada 2 semanas">1 vez cada 2 semanas</option>
                          <option value="1 vez a la semana">1 vez a la semana</option>
                          <option value="2 veces a la semana">2 veces a la semana</option>
                          <option value="3 veces a la semana">3 veces a la semana</option>
                          <option value="4 veces a la semana">4 veces a la semana</option>
                          <option value="5 veces a la semana">5 veces a la semana</option>
                          <option value="6 o más veces a la semana">6 o más veces a la semana</option>
                        </select>
                      </div>
                    )}

                    {/* Bruxismo */}
                    <div className="form-group">
                      <label>¿Padece Bruxismo?</label>
                      <input
                        type="checkbox"
                        checked={formData.habitos_higiene.bruxismo.presente || false}
                        onChange={(e) =>
                          handleDoubleNestedChange("habitos_higiene", "bruxismo", "presente", e.target.checked)
                        }
                      />
                    </div>
                    {formData.habitos_higiene.bruxismo.presente && (
                      <div className="form-group">
                        <label>¿Usa guarda?</label>
                        <input
                          type="checkbox"
                          checked={formData.habitos_higiene.bruxismo.uso_placa || false}
                          onChange={(e) =>
                            handleDoubleNestedChange("habitos_higiene", "bruxismo", "uso_placa", e.target.checked)
                          }
                        />
                      </div>
                    )}

                    {/* Otros Hábitos */}
                    <div className="form-group">
                      <label>Otros Hábitos</label>
                      <input
                        type="text"
                        value={formData.habitos_higiene.otros || ""}
                        onChange={(e) =>
                          handleNestedChange("habitos_higiene", "otros", e.target.value)
                        }
                      />
                    </div>

                    {/* NUEVOS CAMPOS DE HISTORIAL ODONTOLÓGICO */}
                    
                    {/* Fecha última visita al odontólogo */}
                    <div className="form-group">
                      <label>Fecha Última Visita al Odontólogo</label>
                      <input
                        type="date"
                        value={formData.habitos_higiene.fecha_ultima_visita_odontologo || ""}
                        onChange={(e) =>
                          handleNestedChange("habitos_higiene", "fecha_ultima_visita_odontologo", e.target.value)
                        }
                      />
                    </div>

                    {/* Pérdida de dientes */}
                    <div className="form-group">
                      <label>¿Pérdida de Dientes?</label>
                      <input
                        type="checkbox"
                        checked={formData.habitos_higiene.perdida_dientes || false}
                        onChange={(e) =>
                          handleNestedChange("habitos_higiene", "perdida_dientes", e.target.checked)
                        }
                      />
                    </div>

                    {/* Acumulación de alimento entre dientes */}
                    <div className="form-group">
                      <label>¿Acumulación de Alimento entre Dientes?</label>
                      <input
                        type="checkbox"
                        checked={formData.habitos_higiene.acumulacion_alimento_dientes || false}
                        onChange={(e) =>
                          handleNestedChange("habitos_higiene", "acumulacion_alimento_dientes", e.target.checked)
                        }
                      />
                    </div>

                    {/* Tumores o agrandamientos en la boca */}
                    <div className="form-group">
                      <label>¿Tumores o Agrandamientos en la Boca?</label>
                      <input
                        type="checkbox"
                        checked={formData.habitos_higiene.tumores_agrandamientos_boca || false}
                        onChange={(e) =>
                          handleNestedChange("habitos_higiene", "tumores_agrandamientos_boca", e.target.checked)
                        }
                      />
                    </div>

                    {/* Llagas, úlceras o aftas frecuentes */}
                    <div className="form-group">
                      <label>¿Llagas, Úlceras o Aftas Frecuentes?</label>
                      <input
                        type="checkbox"
                        checked={formData.habitos_higiene.llagas_ulceras_aftas_frecuentes || false}
                        onChange={(e) =>
                          handleNestedChange("habitos_higiene", "llagas_ulceras_aftas_frecuentes", e.target.checked)
                        }
                      />
                    </div>

                    {/* Enfermedad periodontal */}
                    <div className="form-group">
                      <label>¿Enfermedad Periodontal?</label>
                      <input
                        type="checkbox"
                        checked={formData.habitos_higiene.enfermedad_periodontal || false}
                        onChange={(e) =>
                          handleNestedChange("habitos_higiene", "enfermedad_periodontal", e.target.checked)
                        }
                      />
                    </div>

                    {/* Sangrado de encías */}
                    <div className="form-group">
                      <label>¿Sangrado de Encías?</label>
                      <input
                        type="checkbox"
                        checked={formData.habitos_higiene.sangrado_encias || false}
                        onChange={(e) =>
                          handleNestedChange("habitos_higiene", "sangrado_encias", e.target.checked)
                        }
                      />
                    </div>

                    {/* Tratamiento de ortodoncia previo */}
                    <div className="form-group">
                      <label>¿Tratamiento de Ortodoncia Previo?</label>
                      <input
                        type="checkbox"
                        checked={formData.habitos_higiene.tratamiento_ortodoncia_previo || false}
                        onChange={(e) =>
                          handleNestedChange("habitos_higiene", "tratamiento_ortodoncia_previo", e.target.checked)
                        }
                      />
                    </div>

                    {/* Problemas con tratamientos previos */}
                    <div className="form-group">
                      <label>¿Problemas con Tratamientos Previos?</label>
                      <input
                        type="checkbox"
                        checked={formData.habitos_higiene.problemas_tratamientos_previos.estado || false}
                        onChange={(e) =>
                          handleDoubleNestedChange("habitos_higiene", "problemas_tratamientos_previos", "estado", e.target.checked)
                        }
                      />
                    </div>
                    {formData.habitos_higiene.problemas_tratamientos_previos.estado && (
                      <div className="form-group">
                        <label>Explicación de los Problemas</label>
                        <textarea
                          value={formData.habitos_higiene.problemas_tratamientos_previos.explicacion || ""}
                          onChange={(e) =>
                            handleDoubleNestedChange("habitos_higiene", "problemas_tratamientos_previos", "explicacion", e.target.value)
                          }
                          rows="3"
                        />
                      </div>
                    )}

                    {/* Dolores cerca del oído */}
                    <div className="form-group">
                      <label>¿Dolores Cerca del Oído?</label>
                      <input
                        type="checkbox"
                        checked={formData.habitos_higiene.dolores_cerca_oido || false}
                        onChange={(e) =>
                          handleNestedChange("habitos_higiene", "dolores_cerca_oido", e.target.checked)
                        }
                      />
                    </div>

                    {/* Motivo de consulta odontológica */}
                    <div className="form-group">
                      <label>Motivo de Consulta Odontológica</label>
                      <textarea
                        value={formData.habitos_higiene.motivo_consulta_odontologica || ""}
                        onChange={(e) =>
                          handleNestedChange("habitos_higiene", "motivo_consulta_odontologica", e.target.value)
                        }
                        rows="3"
                        placeholder="Describa el motivo principal de su consulta..."
                      />
                    </div>

      </div> {/* Fin de habitos-higiene-grid */}
    </section>
  );
};

export default Habits;
