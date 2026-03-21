import plusIcon from '../../../assets/images/icons/plus.svg';

const FamilyHistory = ({ formData, handleArrayChange, setFormData }) => {
  return (
    <section className="form-section">
      <h2>Antecedentes Heredo Familiares</h2>
      {formData.antecedentes_heredo_familiares.map((antecedente, index) => (
        <div key={index} className="form-group-grid array-item">
          <div className="form-group">
            <label>Parentesco</label>
            <select
              value={antecedente.parentesco || ""}
              onChange={(e) =>
                handleArrayChange("antecedentes_heredo_familiares", index, "parentesco", e.target.value)
              }
            >
              <option value="">Seleccionar parentesco</option>
              <option value="Padre">Padre</option>
              <option value="Madre">Madre</option>
              <option value="Hermano">Hermano</option>
              <option value="Hermana">Hermana</option>
              <option value="Abuelo">Abuelo</option>
              <option value="Abuela">Abuela</option>
              <option value="Tío">Tío</option>
              <option value="Tía">Tía</option>
              <option value="Primo">Primo</option>
              <option value="Prima">Prima</option>
              <option value="Otros">Otros</option>
            </select>
          </div>
          {/* Input adicional para especificar el tipo de familiar cuando se selecciona "Otros" */}
          {antecedente.parentesco === "Otros" && (
            <div className="form-group">
              <label>Especificar Parentesco</label>
              <input
                type="text"
                value={antecedente.parentesco_especifico || ""}
                onChange={(e) =>
                  handleArrayChange("antecedentes_heredo_familiares", index, "parentesco_especifico", e.target.value)
                }
                placeholder="Especifique el tipo de familiar"
              />
            </div>
          )}
          <div className="form-group">
            <label>Antecedentes</label>
            <input
              type="text"
              value={antecedente.antecedentes || ""}
              onChange={(e) =>
                handleArrayChange("antecedentes_heredo_familiares", index, "antecedentes", e.target.value)
              }
              placeholder="Describa los antecedentes médicos"
            />
          </div>
          {/* Botón para eliminar antecedente */}
          <button
            type="button"
            className="trash-button"
            onClick={() =>
              setFormData((prev) => ({
                ...prev,
                antecedentes_heredo_familiares: prev.antecedentes_heredo_familiares.filter((_, i) => i !== index),
              }))
            }
          >
            🗑️
          </button>
        </div>
      ))}
      {/* Botón para agregar un nuevo antecedente */}
      <button
        type="button"
        onClick={() =>
          setFormData((prev) => ({
            ...prev,
            antecedentes_heredo_familiares: [...prev.antecedentes_heredo_familiares, { parentesco: "", parentesco_especifico: "", antecedentes: "" }],
          }))
        }
        className="action-button"
      >
        <img src={plusIcon} alt="+" width="16" height="16" /> Agregar Antecedente Familiar
      </button>
    </section>
  );
};

export default FamilyHistory;