import React, { useEffect, useState } from 'react';
import { getMyTemplates, createTemplate, updateTemplate, deleteTemplate } from '../../../shared/services/settingsService';

const NoteTemplateEditor = () => {
  const [templates, setTemplates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState(null);

  // Form state for new/edit
  const [editingId, setEditingId] = useState(null);
  const [nombre, setNombre] = useState('');
  const [tipoProcedimiento, setTipoProcedimiento] = useState('');
  const [descripcion, setDescripcion] = useState('');
  const [saving, setSaving] = useState(false);

  const loadTemplates = async () => {
    try {
      const data = await getMyTemplates();
      setTemplates(data);
    } catch {
      setMsg({ type: 'error', text: 'Error al cargar plantillas' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadTemplates(); }, []);

  const resetForm = () => {
    setEditingId(null);
    setNombre('');
    setTipoProcedimiento('');
    setDescripcion('');
  };

  const handleSave = async (e) => {
    e.preventDefault();
    setSaving(true);
    setMsg(null);
    try {
      if (editingId) {
        await updateTemplate(editingId, { nombre, tipoProcedimiento, descripcion });
        setMsg({ type: 'success', text: 'Plantilla actualizada' });
      } else {
        await createTemplate({ nombre, tipoProcedimiento, descripcion });
        setMsg({ type: 'success', text: 'Plantilla creada' });
      }
      resetForm();
      await loadTemplates();
    } catch (err) {
      setMsg({ type: 'error', text: err.response?.data?.message || 'Error al guardar plantilla' });
    } finally {
      setSaving(false);
    }
  };

  const handleEdit = (t) => {
    setEditingId(t._id);
    setNombre(t.nombre);
    setTipoProcedimiento(t.tipoProcedimiento);
    setDescripcion(t.descripcion || '');
  };

  const handleDelete = async (id) => {
    setMsg(null);
    try {
      await deleteTemplate(id);
      if (editingId === id) resetForm();
      await loadTemplates();
      setMsg({ type: 'success', text: 'Plantilla eliminada' });
    } catch (err) {
      setMsg({ type: 'error', text: err.response?.data?.message || 'Error al eliminar' });
    }
  };

  if (loading) return <p>Cargando plantillas…</p>;

  return (
    <div>
      {msg && <div className={`settings-message ${msg.type}`}>{msg.text}</div>}

      {/* Template list */}
      {templates.length > 0 && (
        <div className="template-list">
          {templates.map((t) => (
            <div key={t._id} className="template-item">
              <div className="template-item-name">
                {t.nombre}
                <span style={{ fontWeight: 'normal', color: 'var(--color-text-muted)', marginLeft: '0.5rem' }}>
                  — {t.tipoProcedimiento}
                </span>
              </div>
              <div className="template-item-actions">
                <button type="button" className="settings-btn-secondary" onClick={() => handleEdit(t)}>Editar</button>
                <button type="button" className="settings-btn-danger" onClick={() => handleDelete(t._id)}>Eliminar</button>
              </div>
            </div>
          ))}
        </div>
      )}

      {templates.length === 0 && (
        <p style={{ color: 'var(--color-text-muted)', marginBottom: 'var(--spacing-lg)' }}>
          No tienes plantillas. Crea una para agilizar tus notas de evolución.
        </p>
      )}

      {/* Create/Edit form */}
      <h4 style={{ marginBottom: 'var(--spacing-md)' }}>
        {editingId ? 'Editar plantilla' : 'Nueva plantilla'}
      </h4>
      <form onSubmit={handleSave}>
        <div className="settings-form-group">
          <label>Nombre</label>
          <input
            value={nombre}
            onChange={(e) => setNombre(e.target.value)}
            required
            maxLength={120}
            placeholder="Ej: Limpieza dental profunda"
          />
        </div>
        <div className="settings-form-group">
          <label>Tipo de procedimiento</label>
          <input
            value={tipoProcedimiento}
            onChange={(e) => setTipoProcedimiento(e.target.value)}
            required
            placeholder="Ej: Profilaxis, Endodoncia, Ortodoncia"
          />
        </div>
        <div className="settings-form-group">
          <label>Descripción (opcional)</label>
          <textarea
            rows={3}
            value={descripcion}
            onChange={(e) => setDescripcion(e.target.value)}
            maxLength={500}
            placeholder="Notas o contenido predeterminado de la plantilla"
          />
        </div>
        <div className="settings-actions">
          <button type="submit" className="settings-btn-primary" disabled={saving}>
            {saving ? 'Guardando…' : editingId ? 'Actualizar' : 'Crear plantilla'}
          </button>
          {editingId && (
            <button type="button" className="settings-btn-secondary" onClick={resetForm}>Cancelar</button>
          )}
        </div>
      </form>
    </div>
  );
};

export default NoteTemplateEditor;
