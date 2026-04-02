const Identification = ({ formData, handleNestedChange }) => {
  return (
    <section className="form-section">
      <h2>Identificación</h2>
      <div className="form-group-grid">
        <div className="form-group">
          <label>Tipo de Documento *</label>
          <select
            name="documento_tipo"
            value={formData.documento?.tipo || ""}
            onChange={(e) => handleNestedChange("documento", "tipo", e.target.value)}
          >
            <option value="">Seleccione...</option>
            <option value="Licencia">Licencia</option>
            <option value="Pasaporte">Pasaporte</option>
            <option value="INE">INE</option>
            <option value="Otro">Otro</option>
          </select>
        </div>

        <div className="form-group">
          <label>Número de Documento *</label>
          <input
            type="text"
            name="documento_numero"
            value={formData.documento?.numero || ""}
            onChange={(e) => handleNestedChange("documento", "numero", e.target.value)}
          />
        </div>
      </div>
    </section>
  );
};

export default Identification;