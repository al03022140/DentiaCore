const DentalEvaluation = ({ formData, handleNestedChange, handleDoubleNestedChange, handleTripleNestedChange }) => {
  return (
    <section className="form-section">
      <h2>Evaluación Dental y Oclusal</h2>
      <div className="form-group-grid">
        {/* Línea de sonrisa - Longitud del labio */}
        <div className="form-group">
          <label>Longitud del labio:</label>
          <select 
            value={formData.evaluacion_dental_oclusal?.linea_sonrisa?.longitud_labio || ""}
            onChange={(e) => handleDoubleNestedChange('evaluacion_dental_oclusal', 'linea_sonrisa', 'longitud_labio', e.target.value)}
          >
            <option value="">Seleccionar...</option>
            <option value="Alta (Gingival)">Alta (Gingival)</option>
            <option value="Media">Media</option>
            <option value="Baja (Dental)">Baja (Dental)</option>
          </select>
        </div>
        
        {/* Al sonreír muestra el reborde */}
        <div className="form-group">
          <label>¿Al sonreír muestra el reborde?</label>
          <input 
            type="checkbox"
            checked={formData.evaluacion_dental_oclusal?.linea_sonrisa?.muestra_reborde_al_sonreir || false}
            onChange={(e) => handleDoubleNestedChange('evaluacion_dental_oclusal', 'linea_sonrisa', 'muestra_reborde_al_sonreir', e.target.checked)}
          />
        </div>

        {/* Clasificación de Kennedy */}
        <div className="form-group">
          <label>¿Clasificación de Kennedy?</label>
          <input 
            type="checkbox"
            checked={formData.evaluacion_dental_oclusal?.clasificacion_kennedy || false}
            onChange={(e) => handleNestedChange('evaluacion_dental_oclusal', 'clasificacion_kennedy', e.target.checked)}
          />
        </div>
        
        {/* Encía insertada */}
        <div className="form-group">
          <label>Encía insertada (En base al periodontograma):</label>
          <select 
            value={formData.evaluacion_dental_oclusal?.encia_insertada || ""}
            onChange={(e) => handleNestedChange('evaluacion_dental_oclusal', 'encia_insertada', e.target.value)}
          >
            <option value="">Seleccionar...</option>
            <option value="Suficiente">Suficiente</option>
            <option value="Insuficiente">Insuficiente</option>
          </select>
        </div>
        
        {/* Apertura bucal */}
        <div className="form-group">
          <label>Apertura Bucal:</label>
          <select 
            value={formData.evaluacion_dental_oclusal?.apertura_bucal || ""}
            onChange={(e) => handleNestedChange('evaluacion_dental_oclusal', 'apertura_bucal', e.target.value)}
          >
            <option value="">Seleccionar...</option>
            <option value="Amplia">Amplia</option>
            <option value="Normal">Normal</option>
            <option value="Reducida/Limitada">Reducida/Limitada</option>
          </select>
        </div>
      
      </div>
      
      {/* Evaluación ATM */}
      <div className="form-section">
        <h3>Evaluación de la Articulación Temporomandibular (ATM)</h3>
        <div className="form-group-grid">
          <div className="form-group">
            <label>¿Molestias en la ATM?</label>
            <input 
              type="checkbox"
              checked={formData.evaluacion_dental_oclusal?.evaluacion_atm?.molestias_atm || false}
              onChange={(e) => handleDoubleNestedChange('evaluacion_dental_oclusal', 'evaluacion_atm', 'molestias_atm', e.target.checked)}
            />
          </div>
        
          {/* Ruidos */}
          <div className="form-group">
            <label>Ruidos - Derecha:</label>
            <select 
              value={formData.evaluacion_dental_oclusal?.evaluacion_atm?.ruidos?.derecha || ""}
              onChange={(e) => handleTripleNestedChange('evaluacion_dental_oclusal', 'evaluacion_atm', 'ruidos', 'derecha', e.target.value)}
            >
              <option value="">Seleccionar...</option>
              <option value="Cómica">Cómica</option>
              <option value="Crepitante">Crepitante</option>
              <option value="Chasquido">Chasquido</option>
            </select>
          </div>
          
          <div className="form-group">
            <label>Ruidos - Izquierda:</label>
            <select 
              value={formData.evaluacion_dental_oclusal?.evaluacion_atm?.ruidos?.izquierda || ""}
              onChange={(e) => handleTripleNestedChange('evaluacion_dental_oclusal', 'evaluacion_atm', 'ruidos', 'izquierda', e.target.value)}
            >
              <option value="">Seleccionar...</option>
              <option value="Cómica">Cómica</option>
              <option value="Crepitante">Crepitante</option>
              <option value="Chasquido">Chasquido</option>
            </select>
          </div>
        
          {/* Dolor */}
          <div className="form-group">
            <label>¿Dolor - Derecha?</label>
            <input 
              type="checkbox"
              checked={formData.evaluacion_dental_oclusal?.evaluacion_atm?.dolor?.derecha || false}
              onChange={(e) => handleTripleNestedChange('evaluacion_dental_oclusal', 'evaluacion_atm', 'dolor', 'derecha', e.target.checked)}
            />
          </div>
          
          <div className="form-group">
            <label>¿Dolor - Izquierda?</label>
            <input 
              type="checkbox"
              checked={formData.evaluacion_dental_oclusal?.evaluacion_atm?.dolor?.izquierda || false}
              onChange={(e) => handleTripleNestedChange('evaluacion_dental_oclusal', 'evaluacion_atm', 'dolor', 'izquierda', e.target.checked)}
            />
          </div>
        
          {/* Movilidad mandibular */}
          <div className="form-group">
            <label>¿Protrusiva?</label>
            <input 
              type="checkbox"
              checked={formData.evaluacion_dental_oclusal?.evaluacion_atm?.movilidad_mandibular?.protrusiva || false}
              onChange={(e) => handleTripleNestedChange('evaluacion_dental_oclusal', 'evaluacion_atm', 'movilidad_mandibular', 'protrusiva', e.target.checked)}
            />
          </div>
          
          <div className="form-group">
            <label>Lateral derecho:</label>
            <select 
              value={formData.evaluacion_dental_oclusal?.evaluacion_atm?.movilidad_mandibular?.lateralidad?.lateral_derecho || ""}
              onChange={(e) => {
                const newValue = e.target.value;
                handleTripleNestedChange('evaluacion_dental_oclusal', 'evaluacion_atm', 'movilidad_mandibular', 'lateralidad', {
                  ...formData.evaluacion_dental_oclusal?.evaluacion_atm?.movilidad_mandibular?.lateralidad,
                  lateral_derecho: newValue
                });
              }}
            >
              <option value="">Seleccionar...</option>
              <option value="normal">Normal</option>
              <option value="excesivo">Excesivo</option>
              <option value="limitado">Limitado</option>
            </select>
          </div>
          
          <div className="form-group">
            <label>Lateral izquierdo:</label>
            <select 
              value={formData.evaluacion_dental_oclusal?.evaluacion_atm?.movilidad_mandibular?.lateralidad?.lateral_izquierdo || ""}
              onChange={(e) => {
                const newValue = e.target.value;
                handleTripleNestedChange('evaluacion_dental_oclusal', 'evaluacion_atm', 'movilidad_mandibular', 'lateralidad', {
                  ...formData.evaluacion_dental_oclusal?.evaluacion_atm?.movilidad_mandibular?.lateralidad,
                  lateral_izquierdo: newValue
                });
              }}
            >
              <option value="">Seleccionar...</option>
              <option value="normal">Normal</option>
              <option value="excesivo">Excesivo</option>
              <option value="limitado">Limitado</option>
            </select>
          </div>
        </div>
      </div>
      
      {/* Evaluación oclusal */}
      <div className="form-section">
        <h3>Evaluación oclusal</h3>
        <div className="form-group-grid">
        
          <div className="form-group">
            <label>Clasificación de Angle:</label>
            <input 
              type="text"
              value={formData.evaluacion_dental_oclusal?.evaluacion_oclusal?.clasificacion_angle || ""}
              onChange={(e) => handleDoubleNestedChange('evaluacion_dental_oclusal', 'evaluacion_oclusal', 'clasificacion_angle', e.target.value)}
              placeholder="Ingrese clasificación..."
            />
          </div>
        
          <div className="form-group">
            <label>¿Contacto dentario en Oclusión céntrica?</label>
            <input 
              type="checkbox"
              checked={formData.evaluacion_dental_oclusal?.evaluacion_oclusal?.contacto_dentario_oclusion_centrica || false}
              onChange={(e) => handleDoubleNestedChange('evaluacion_dental_oclusal', 'evaluacion_oclusal', 'contacto_dentario_oclusion_centrica', e.target.checked)}
            />
          </div>
          
          <div className="form-group">
            <label>Protección canina:</label>
            <select 
              value={formData.evaluacion_dental_oclusal?.evaluacion_oclusal?.proteccion_canina || ""}
              onChange={(e) => handleDoubleNestedChange('evaluacion_dental_oclusal', 'evaluacion_oclusal', 'proteccion_canina', e.target.value)}
            >
              <option value="">Seleccionar...</option>
              <option value="Derecha">Derecha</option>
              <option value="Izquierda">Izquierda</option>
              <option value="No hay">No hay</option>
            </select>
          </div>
          
          <div className="form-group">
            <label>¿Protección anterior?</label>
            <input 
              type="checkbox"
              checked={formData.evaluacion_dental_oclusal?.evaluacion_oclusal?.proteccion_anterior || false}
              onChange={(e) => handleDoubleNestedChange('evaluacion_dental_oclusal', 'evaluacion_oclusal', 'proteccion_anterior', e.target.checked)}
            />
          </div>
          
          <div className="form-group">
            <label>Función de grupo:</label>
            <select 
              value={formData.evaluacion_dental_oclusal?.evaluacion_oclusal?.funcion_grupo || ""}
              onChange={(e) => handleDoubleNestedChange('evaluacion_dental_oclusal', 'evaluacion_oclusal', 'funcion_grupo', e.target.value)}
            >
              <option value="">Seleccionar...</option>
              <option value="Derecha">Derecha</option>
              <option value="Izquierda">Izquierda</option>
              <option value="No hay">No hay</option>
            </select>
          </div>
          
          <div className="form-group">
            <label>Protección mutua:</label>
            <select 
              value={formData.evaluacion_dental_oclusal?.evaluacion_oclusal?.proteccion_mutua || ""}
              onChange={(e) => handleDoubleNestedChange('evaluacion_dental_oclusal', 'evaluacion_oclusal', 'proteccion_mutua', e.target.value)}
            >
              <option value="">Seleccionar...</option>
              <option value="Derecha">Derecha</option>
              <option value="Izquierda">Izquierda</option>
              <option value="No hay">No hay</option>
            </select>
          </div>
          
          <div className="form-group">
            <label>¿Sobremordida?</label>
            <input 
              type="checkbox"
              checked={formData.evaluacion_dental_oclusal?.evaluacion_oclusal?.sobremordida || false}
              onChange={(e) => handleDoubleNestedChange('evaluacion_dental_oclusal', 'evaluacion_oclusal', 'sobremordida', e.target.checked)}
            />
          </div>
          
          <div className="form-group">
            <label>¿Mordida Cruzada?</label>
            <input 
              type="checkbox"
              checked={formData.evaluacion_dental_oclusal?.evaluacion_oclusal?.mordida_cruzada || false}
              onChange={(e) => handleDoubleNestedChange('evaluacion_dental_oclusal', 'evaluacion_oclusal', 'mordida_cruzada', e.target.checked)}
            />
          </div>
          
          <div className="form-group">
            <label>Traslape horizontal (mm):</label>
            <input 
              type="text"
              value={formData.evaluacion_dental_oclusal?.evaluacion_oclusal?.traslape_horizontal_mm || ""}
              onChange={(e) => handleDoubleNestedChange('evaluacion_dental_oclusal', 'evaluacion_oclusal', 'traslape_horizontal_mm', e.target.value)}
              placeholder="mm"
            />
          </div>
          
          <div className="form-group">
            <label>Traslape vertical (mm):</label>
            <input 
              type="text"
              value={formData.evaluacion_dental_oclusal?.evaluacion_oclusal?.traslape_vertical_mm || ""}
              onChange={(e) => handleDoubleNestedChange('evaluacion_dental_oclusal', 'evaluacion_oclusal', 'traslape_vertical_mm', e.target.value)}
              placeholder="mm"
            />
          </div>
          
          {/* Mordida abierta */}
          <div className="form-group">
            <label>¿Mordida abierta?</label>
            <input 
              type="checkbox"
              checked={formData.evaluacion_dental_oclusal?.evaluacion_oclusal?.mordida_abierta?.presente || false}
              onChange={(e) => handleTripleNestedChange('evaluacion_dental_oclusal', 'evaluacion_oclusal', 'mordida_abierta', 'presente', e.target.checked)}
            />
          </div>
          
          {formData.evaluacion_dental_oclusal?.evaluacion_oclusal?.mordida_abierta?.presente && (
            <>
              <div className="form-group">
                <label>Ant. (mm):</label>
                <input 
                  type="text"
                  value={formData.evaluacion_dental_oclusal?.evaluacion_oclusal?.mordida_abierta?.medidas?.anterior_mm || ""}
                  onChange={(e) => {
                    const newMedidas = {
                      ...formData.evaluacion_dental_oclusal?.evaluacion_oclusal?.mordida_abierta?.medidas,
                      anterior_mm: e.target.value
                    };
                    handleTripleNestedChange('evaluacion_dental_oclusal', 'evaluacion_oclusal', 'mordida_abierta', 'medidas', newMedidas);
                  }}
                  placeholder="mm"
                />
              </div>
              
              <div className="form-group">
                <label>Post. (mm):</label>
                <input 
                  type="text"
                  value={formData.evaluacion_dental_oclusal?.evaluacion_oclusal?.mordida_abierta?.medidas?.posterior_mm || ""}
                  onChange={(e) => {
                    const newMedidas = {
                      ...formData.evaluacion_dental_oclusal?.evaluacion_oclusal?.mordida_abierta?.medidas,
                      posterior_mm: e.target.value
                    };
                    handleTripleNestedChange('evaluacion_dental_oclusal', 'evaluacion_oclusal', 'mordida_abierta', 'medidas', newMedidas);
                  }}
                  placeholder="mm"
                />
              </div>
              
              <div className="form-group">
                <label>Der. (mm):</label>
                <input 
                  type="text"
                  value={formData.evaluacion_dental_oclusal?.evaluacion_oclusal?.mordida_abierta?.medidas?.derecha_mm || ""}
                  onChange={(e) => {
                    const newMedidas = {
                      ...formData.evaluacion_dental_oclusal?.evaluacion_oclusal?.mordida_abierta?.medidas,
                      derecha_mm: e.target.value
                    };
                    handleTripleNestedChange('evaluacion_dental_oclusal', 'evaluacion_oclusal', 'mordida_abierta', 'medidas', newMedidas);
                  }}
                  placeholder="mm"
                />
              </div>
              
              <div className="form-group">
                <label>Izq. (mm):</label>
                <input 
                  type="text"
                  value={formData.evaluacion_dental_oclusal?.evaluacion_oclusal?.mordida_abierta?.medidas?.izquierda_mm || ""}
                  onChange={(e) => {
                    const newMedidas = {
                      ...formData.evaluacion_dental_oclusal?.evaluacion_oclusal?.mordida_abierta?.medidas,
                      izquierda_mm: e.target.value
                    };
                    handleTripleNestedChange('evaluacion_dental_oclusal', 'evaluacion_oclusal', 'mordida_abierta', 'medidas', newMedidas);
                  }}
                  placeholder="mm"
                />
              </div>
            </>
          )}
        </div>
      </div>
    </section>
  );
};

export default DentalEvaluation;