const NoteTemplate = require('../models/noteTemplate');

// ── List my templates ────────────────────────────────────────
exports.getMyTemplates = async (req, res) => {
  try {
    const userId = req.user._id || req.user.id;
    const templates = await NoteTemplate.find({ creadoPor: userId, active: true })
      .sort({ nombre: 1 })
      .select('nombre tipoProcedimiento descripcion');
    res.json(templates);
  } catch (error) {
    res.status(500).json({ message: 'Error al obtener plantillas', error: error.message });
  }
};

// ── Create template ──────────────────────────────────────────
exports.createTemplate = async (req, res) => {
  try {
    const userId = req.user._id || req.user.id;
    const { nombre, tipoProcedimiento, descripcion, estructura, camposObligatorios, seccionesClinicas } = req.body;
    if (!nombre || !tipoProcedimiento) {
      return res.status(400).json({ message: 'Nombre y tipo de procedimiento son requeridos' });
    }
    const template = await NoteTemplate.create({
      nombre,
      tipoProcedimiento,
      descripcion: descripcion || '',
      estructura: estructura || [],
      camposObligatorios: camposObligatorios || [],
      seccionesClinicas: seccionesClinicas || [],
      creadoPor: userId,
      modificadoPor: userId,
    });
    res.status(201).json(template);
  } catch (error) {
    if (error.code === 11000) {
      return res.status(409).json({ message: 'Ya existe una plantilla con ese nombre' });
    }
    res.status(500).json({ message: 'Error al crear plantilla', error: error.message });
  }
};

// ── Update template ──────────────────────────────────────────
exports.updateTemplate = async (req, res) => {
  try {
    const userId = req.user._id || req.user.id;
    const { id } = req.params;
    if (!/^[a-f\d]{24}$/i.test(id)) {
      return res.status(400).json({ message: 'ID inválido' });
    }
    const template = await NoteTemplate.findOne({ _id: id, creadoPor: userId, active: true });
    if (!template) return res.status(404).json({ message: 'Plantilla no encontrada' });

    const allowed = ['nombre', 'tipoProcedimiento', 'descripcion', 'estructura', 'camposObligatorios', 'seccionesClinicas'];
    for (const key of allowed) {
      if (req.body[key] !== undefined) template[key] = req.body[key];
    }
    template.modificadoPor = userId;
    await template.save();
    res.json(template);
  } catch (error) {
    if (error.code === 11000) {
      return res.status(409).json({ message: 'Ya existe una plantilla con ese nombre' });
    }
    res.status(500).json({ message: 'Error al actualizar plantilla', error: error.message });
  }
};

// ── Delete (soft) template ───────────────────────────────────
exports.deleteTemplate = async (req, res) => {
  try {
    const userId = req.user._id || req.user.id;
    const { id } = req.params;
    if (!/^[a-f\d]{24}$/i.test(id)) {
      return res.status(400).json({ message: 'ID inválido' });
    }
    const template = await NoteTemplate.findOneAndUpdate(
      { _id: id, creadoPor: userId, active: true },
      { $set: { active: false, modificadoPor: userId } },
      { new: true }
    );
    if (!template) return res.status(404).json({ message: 'Plantilla no encontrada' });
    res.json({ message: 'Plantilla eliminada' });
  } catch (error) {
    res.status(500).json({ message: 'Error al eliminar plantilla', error: error.message });
  }
};
