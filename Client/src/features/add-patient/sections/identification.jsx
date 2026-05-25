const Identification = ({ formData, handleNestedChange, invalidFields = new Set(), shakeKey = 0 }) => {
  const inv = (path) => invalidFields.has(path) ? 'field-invalid' : '';
  return (
    <section className="form-section">
      <h2>Identificación</h2>
      <div className="form-group-grid">
        <div className="form-group">
          <label>Tipo de Documento *</label>
          <select
            key={`doc-tipo-${shakeKey}`}
            name="documento_tipo"
            value={formData.documento?.tipo || ""}
            onChange={(e) => handleNestedChange("documento", "tipo", e.target.value)}
            className={inv('documento.tipo')}
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
            key={`doc-numero-${shakeKey}`}
            type="text"
            name="documento_numero"
            value={formData.documento?.numero || ""}
            onChange={(e) => handleNestedChange("documento", "numero", e.target.value)}
            className={inv('documento.numero')}
          />
        </div>
      </div>
    </section>
  );
};

export default Identification;