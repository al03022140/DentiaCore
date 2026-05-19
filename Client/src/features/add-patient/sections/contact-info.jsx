const ContactInfo = ({ formData, handleNestedChange, handleChange }) => {
  return (
    <section className="form-section">
      <h2>Información de Contacto</h2>
      <div className="form-group-grid">
        <div className="form-group">
          <label>Email</label>
          <input
            type="email"
            name="email"
            value={formData.email || ""}
            onChange={handleChange}
          />
        </div>
        <div className="form-group">
          <label>Teléfono *</label>
          <input
            type="text"
            value={formData.contacto?.telefono || ""}
            onChange={(e) => handleNestedChange("contacto", "telefono", e.target.value)}
          />
        </div>
        <div className="form-group">
          <label>Dirección *</label>
          <input
            type="text"
            value={formData.contacto?.direccion || ""}
            onChange={(e) => handleNestedChange("contacto", "direccion", e.target.value)}
          />
        </div>
        <div className="form-group">
          <label>Código Postal</label>
          <input
            type="text"
            value={formData.contacto?.codigo_postal || ""}
            onChange={(e) => handleNestedChange("contacto", "codigo_postal", e.target.value)}
          />
        </div>
        <div className="form-group">
          <label>Colonia</label>
          <input
            type="text"
            value={formData.contacto?.colonia || ""}
            onChange={(e) => handleNestedChange("contacto", "colonia", e.target.value)}
          />
        </div>
        <div className="form-group">
          <label>Ciudad *</label>
          <input
            type="text"
            value={formData.contacto?.ciudad || ""}
            onChange={(e) => handleNestedChange("contacto", "ciudad", e.target.value)}
          />
        </div>
        <div className="form-group">
          <label>Entidad Federativa *</label>
          <input
            type="text"
            value={formData.contacto?.entidad_federativa || ""}
            onChange={(e) => handleNestedChange("contacto", "entidad_federativa", e.target.value)}
          />
        </div>
        <div className="form-group">
          <label>Número Interior</label>
          <input
            type="text"
            value={formData.contacto?.numero_interior || ""}
            onChange={(e) => handleNestedChange("contacto", "numero_interior", e.target.value)}
          />
        </div>
        <div className="form-group">
          <label>Número Exterior</label>
          <input
            type="text"
            value={formData.contacto?.numero_exterior || ""}
            onChange={(e) => handleNestedChange("contacto", "numero_exterior", e.target.value)}
          />
        </div>
      </div>
    </section>
  );
};

export default ContactInfo;
