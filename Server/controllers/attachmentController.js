const mongoose = require('mongoose');
const path = require('path');
const fs = require('fs-extra');
const PatientAttachment = require('../models/patientAttachment');
const { getUploadsBase } = require('../utils/uploads');

const uploadsBase = getUploadsBase();

// GET /api/patients/:id/attachments
exports.listAttachments = async (req, res) => {
  try {
    const { id: patientId } = req.params;
    if (!mongoose.Types.ObjectId.isValid(patientId)) {
      return res.status(400).json({ message: 'ID de paciente inválido' });
    }
    const items = await PatientAttachment.find({ patientId })
      .sort({ createdAt: -1 })
      .populate('subidoPor', 'nombre')
      .lean();
    res.json(items);
  } catch (err) {
    console.error('Error listando adjuntos:', err);
    res.status(500).json({ message: 'Error al obtener adjuntos' });
  }
};

// POST /api/patients/:id/attachments  (multipart: file=archivo)
exports.createAttachment = async (req, res) => {
  try {
    const { id: patientId } = req.params;
    if (!mongoose.Types.ObjectId.isValid(patientId)) {
      return res.status(400).json({ message: 'ID de paciente inválido' });
    }
    if (!req.file) {
      return res.status(400).json({ message: 'No se recibió archivo' });
    }

    const { categoria, descripcion } = req.body || {};

    // URL relativa servida por express.static('/uploads', uploadsBase)
    const relativeFromBase = path.relative(uploadsBase, req.file.path).split(path.sep).join('/');
    const url = `/uploads/${relativeFromBase}`;

    const doc = await PatientAttachment.create({
      patientId,
      originalName: req.file.originalname,
      filename: req.file.filename,
      url,
      mimeType: req.file.mimetype,
      size: req.file.size,
      categoria: (categoria || 'otro').toString().slice(0, 50),
      descripcion: (descripcion || '').toString().slice(0, 500),
      subidoPor: req.user?.id || null
    });

    res.status(201).json(doc);
  } catch (err) {
    console.error('Error creando adjunto:', err);
    // Si el documento no se guardó pero el archivo sí, intentar limpiar
    if (req.file?.path) {
      fs.remove(req.file.path).catch(() => {});
    }
    res.status(500).json({ message: 'Error al subir el adjunto' });
  }
};

// DELETE /api/patients/:id/attachments/:attachmentId
exports.deleteAttachment = async (req, res) => {
  try {
    const { id: patientId, attachmentId } = req.params;
    if (!mongoose.Types.ObjectId.isValid(patientId) || !mongoose.Types.ObjectId.isValid(attachmentId)) {
      return res.status(400).json({ message: 'ID inválido' });
    }
    const doc = await PatientAttachment.findOne({ _id: attachmentId, patientId });
    if (!doc) {
      return res.status(404).json({ message: 'Adjunto no encontrado' });
    }

    // Borrar el archivo de disco — ignoramos error si ya no existe.
    const relative = doc.url.replace(/^\/uploads\//, '');
    const fullPath = path.join(uploadsBase, relative);
    // Defensa contra path traversal: el path resuelto debe quedar dentro de uploadsBase.
    const resolved = path.resolve(fullPath);
    if (resolved.startsWith(path.resolve(uploadsBase))) {
      await fs.remove(resolved).catch(() => {});
    }

    await PatientAttachment.deleteOne({ _id: attachmentId });
    res.json({ success: true });
  } catch (err) {
    console.error('Error eliminando adjunto:', err);
    res.status(500).json({ message: 'Error al eliminar el adjunto' });
  }
};
