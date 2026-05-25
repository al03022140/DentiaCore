const PersonalData = ({ formData, handleChange, handleSituacionLaboralChange, invalidFields = new Set(), shakeKey = 0 }) => {
  const inv = (path) => invalidFields.has(path) ? 'field-invalid' : '';
  return (
    <section className="form-section">
      <h2>Datos Personales</h2>
      <div className="form-group-grid">
        <div className="form-group">
          <label>Primer Nombre *</label>
          <input
            key={`primer-nombre-${shakeKey}`}
            type="text"
            name="primer_nombre"
            value={formData.primer_nombre || ""}
            onChange={handleChange}
            className={inv('primer_nombre')}
          />
        </div>
        <div className="form-group">
          <label>Segundo Nombre</label>
          <input
            type="text"
            name="otros_nombres"
            value={formData.otros_nombres || ""}
            onChange={handleChange}
          />
        </div>
        <div className="form-group">
          <label>Apellido Paterno *</label>
          <input
            key={`apellido-paterno-${shakeKey}`}
            type="text"
            name="apellido_paterno"
            value={formData.apellido_paterno || ""}
            onChange={handleChange}
            className={inv('apellido_paterno')}
          />
        </div>
        <div className="form-group">
          <label>Apellido Materno</label>
          <input
            type="text"
            name="apellido_materno"
            value={formData.apellido_materno || ""}
            onChange={handleChange}
          />
        </div>
        <div className="form-group">
          <label>Fecha de Nacimiento *</label>
          <input
            key={`fecha-nac-${shakeKey}`}
            type="date"
            name="fecha_nacimiento"
            value={formData.fecha_nacimiento || ""}
            onChange={handleChange}
            className={inv('fecha_nacimiento')}
          />
        </div>
        <div className="form-group">
          <label>Sexo *</label>
          <select
            key={`sexo-${shakeKey}`}
            name="sexo"
            value={formData.sexo || ""}
            onChange={handleChange}
            className={inv('sexo')}
          >
            <option value="">Seleccione...</option>
            <option value="Masculino">Masculino</option>
            <option value="Femenino">Femenino</option>
            <option value="Otro">Otro</option>
          </select>
        </div>
        <div className="form-group">
          <label>Estado Civil</label>
          <input
            type="text"
            name="estado_civil"
            value={formData.estado_civil || ""}
            onChange={handleChange}
          />
        </div>
        <div className="form-group">
          <label>Nacionalidad</label>
          <input
            type="text"
            name="nacionalidad"
            value={formData.nacionalidad || ""}
            onChange={handleChange}
          />
        </div>
        <div className="form-group">
          <label>Lugar de Nacimiento</label>
          <input
            type="text"
            name="lugar_nacimiento"
            value={formData.lugar_nacimiento || ""}
            onChange={handleChange}
          />
        </div>
        <div className="form-group">
          <label>Escolaridad</label>
          <input
            type="text"
            name="escolaridad"
            value={formData.escolaridad || ""}
            onChange={handleChange}
          />
        </div>
      </div>
      
      {/* Situación Laboral */}
      <div className="form-group-grid" style={{ marginTop: "2rem" }}>
        <div className="form-group" style={{ gridColumn: "1 / -1" }}>
          <label>Situación Laboral</label>
          <div style={{ display: "flex", gap: "20px", flexWrap: "wrap" }}>
            <label style={{ display: "flex", alignItems: "center", gap: "5px" }}>
              <input
                type="radio"
                name="situacion_laboral"
                value="empleado"
                checked={formData.situacion_laboral?.empleado || false}
                onChange={(e) => handleSituacionLaboralChange(e.target.value, true)}
              />
              Empleado
            </label>
            <label style={{ display: "flex", alignItems: "center", gap: "5px" }}>
              <input
                type="radio"
                name="situacion_laboral"
                value="pensionado"
                checked={formData.situacion_laboral?.pensionado || false}
                onChange={(e) => handleSituacionLaboralChange(e.target.value, true)}
              />
              Pensionado
            </label>
            <label style={{ display: "flex", alignItems: "center", gap: "5px" }}>
              <input
                type="radio"
                name="situacion_laboral"
                value="desempleado"
                checked={formData.situacion_laboral?.desempleado || false}
                onChange={(e) => handleSituacionLaboralChange(e.target.value, true)}
              />
              Desempleado
            </label>
            <label style={{ display: "flex", alignItems: "center", gap: "5px" }}>
              <input
                type="radio"
                name="situacion_laboral"
                value="jubilado"
                checked={formData.situacion_laboral?.jubilado || false}
                onChange={(e) => handleSituacionLaboralChange(e.target.value, true)}
              />
              Jubilado
            </label>
          </div>
        </div>
        
        {/* Campo de Ocupación - Solo visible si está marcado "Empleado" */}
        {formData.situacion_laboral?.empleado && (
          <div className="form-group">
            <label>Ocupación</label>
            <input
              type="text"
              name="ocupacion"
              value={formData.ocupacion || ""}
              onChange={handleChange}
            />
          </div>
        )}
      </div>
    </section>
  );
};

export default PersonalData;