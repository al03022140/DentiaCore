const mongoose = require('mongoose');
const path = require('path');
const fs = require('fs-extra');
const PatientAttachment = require('../models/patientAttachment');
const { getUploadsBase } = require('../utils/uploads');
const { validateMimeByMagicBytes } = require('../utils/fileMagicBytes');

const uploadsBase = getUploadsBase();

// Cap de adjuntos por paciente. Evita que un paciente acumule miles de
// archivos (cada uno hasta 15MB) saturando disco y backups.
const MAX_ATTACHMENTS_PER_PATIENT = 100;

// GET /api/patients/:id/attachments
exports.listAttachments = async (req, res) => {
  try {
    const { id: patientId } = req.params;
    if (!mongoose.Types.ObjectId.isValid(patientId)) {
      return res.status(400).json({ message: 'ID de paciente inválido' });
    }
    // Filtrar soft-deleted: cascade desde deletePatient los marca con
    // deletedAt. Antes seguían apareciendo en la UI del expediente.
    const items = await PatientAttachment.find({ patientId, deletedAt: null })
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

    // Cap de cantidad por paciente. Limpiar el upload si rechazamos.
    const activeCount = await PatientAttachment.countDocuments({ patientId, deletedAt: null });
    if (activeCount >= MAX_ATTACHMENTS_PER_PATIENT) {
      if (req.file?.path) fs.remove(req.file.path).catch(() => {});
      return res.status(409).json({
        message: `Este paciente ya alcanzó el límite de ${MAX_ATTACHMENTS_PER_PATIENT} adjuntos. Elimine alguno antes de agregar otro.`
      });
    }

    // Magic bytes sniff: bloquea archivos con MIME spoofeado (ej. .exe
    // renombrado a .pdf con Content-Type falsificado). Multer ya validó
    // contra ALLOWED_MIME_TYPES pero confía en lo que dice el cliente.
    const mimeCheck = await validateMimeByMagicBytes(req.file.path, req.file.mimetype);
    if (!mimeCheck.ok) {
      await fs.remove(req.file.path).catch(() => {});
      return res.status(415).json({
        message: `El contenido del archivo no coincide con el tipo declarado (${mimeCheck.declared}). Posible MIME spoofing.`
      });
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
// Soft-delete (NOM-004): los adjuntos clínicos —consentimientos firmados,
// radiografías, estudios— son parte del expediente y deben conservarse durante
// el periodo legal de retención. Antes esto hacía `fs.remove` + `deleteOne`:
// destruía físicamente documentos firmados sin dejar forma de reconstruir qué
// se borró. Ahora se marca deletedAt/deletedBy/deleteReason —igual que la
// cascada de deletePatient— y NO se toca el archivo en disco. `listAttachments`
// ya filtra `deletedAt: null`, así que desaparece del expediente igual que antes.
exports.deleteAttachment = async (req, res) => {
  try {
    const { id: patientId, attachmentId } = req.params;
    if (!mongoose.Types.ObjectId.isValid(patientId) || !mongoose.Types.ObjectId.isValid(attachmentId)) {
      return res.status(400).json({ message: 'ID inválido' });
    }
    const doc = await PatientAttachment.findOne({ _id: attachmentId, patientId, deletedAt: null });
    if (!doc) {
      return res.status(404).json({ message: 'Adjunto no encontrado' });
    }

    // ponytail: el archivo en disco se conserva a propósito (retención NOM-004).
    // Upgrade path: purgado por lote cuando venza la ventana de retención legal.
    doc.deletedAt = new Date();
    doc.deletedBy = req.user?.id || null;
    doc.deleteReason = (req.body?.motivo || 'Eliminado desde el expediente').toString().slice(0, 500);
    await doc.save({ validateModifiedOnly: true });

    // El middleware auditLogger ya emite el evento `soft_delete` (NOM-024) al
    // responder 2xx; aquí solo le anexamos QUÉ documento fue, sin escritura extra.
    req._auditDetallesExtra = {
      attachmentId,
      originalName: doc.originalName,
      categoria: doc.categoria,
    };

    res.json({ success: true });
  } catch (err) {
    console.error('Error eliminando adjunto:', err);
    res.status(500).json({ message: 'Error al eliminar el adjunto' });
  }
};
