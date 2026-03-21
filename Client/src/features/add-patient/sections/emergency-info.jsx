import plusIcon from '../../../assets/images/icons/plus.svg';

const EmergencyInfo = ({ formData, handleArrayChange, setFormData }) => {
  return (
    <section className="form-section">
      <h2>Contacto de Emergencia</h2>
      {formData.contactos_emergencia.map((contacto, index) => (
        <div key={index} className="form-group-grid array-item" style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          <div className="form-group">
            <label>Nombre</label>
            <input
              type="text"
              value={contacto.nombre || ""}
              onChange={(e) =>
                handleArrayChange("contactos_emergencia", index, "nombre", e.target.value)
              }
            />
          </div>
          <div className="form-group">
            <label>Parentesco</label>
            <input
              type="text"
              value={contacto.parentesco || ""}
              onChange={(e) =>
                handleArrayChange("contactos_emergencia", index, "parentesco", e.target.value)
              }
            />
          </div>
          <div className="form-group">
            <label>Teléfono</label>
            <input
              type="text"
              value={contacto.telefono || ""}
              onChange={(e) =>
                handleArrayChange("contactos_emergencia", index, "telefono", e.target.value)
              }
            />
          </div>
          {/* Botón para eliminar contacto */}
          <button
            type="button"
            className="trash-button"
            onClick={() =>
              setFormData((prev) => ({
                ...prev,
                contactos_emergencia: prev.contactos_emergencia.filter((_, i) => i !== index),
              }))
            }
          >
            🗑️
          </button>
        </div>
      ))}
      {/* Botón para agregar un nuevo contacto */}
      <button
        type="button"
        onClick={() =>
          setFormData((prev) => ({
            ...prev,
            contactos_emergencia: [...prev.contactos_emergencia, { nombre: "", parentesco: "", telefono: "" }],
          }))
        }
        className="action-button"
      >
        <img src={plusIcon} alt="+" width="16" height="16" /> Agregar Contacto
      </button>
    </section>
  );
};

export default EmergencyInfo;