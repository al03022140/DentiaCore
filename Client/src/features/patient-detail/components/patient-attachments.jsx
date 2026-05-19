import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Modal, Input, Select, Progress, message, Popconfirm } from 'antd';
import {
  listAttachments,
  uploadAttachment,
  deleteAttachment,
  buildAttachmentUrl
} from '../../../shared/services/attachmentService';
import '../styles/patient-attachments.css';

const CATEGORIES = [
  { value: 'radiografia', label: 'Radiografía' },
  { value: 'receta', label: 'Receta' },
  { value: 'identificacion', label: 'Identificación' },
  { value: 'consentimiento', label: 'Consentimiento' },
  { value: 'estudio', label: 'Estudio / Laboratorio' },
  { value: 'otro', label: 'Otro' }
];

const ACCEPT = '.pdf,.jpg,.jpeg,.png,.webp,.gif,application/pdf,image/*';
const MAX_BYTES = 15 * 1024 * 1024;

const formatBytes = (bytes) => {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / Math.pow(1024, i)).toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
};

const formatDate = (iso) => {
  if (!iso) return '';
  try {
    return new Date(iso).toLocaleString('es-MX', {
      year: 'numeric', month: 'short', day: 'numeric',
      hour: '2-digit', minute: '2-digit'
    });
  } catch {
    return '';
  }
};

const isImage = (mime) => typeof mime === 'string' && mime.startsWith('image/');
const isPdf = (mime) => mime === 'application/pdf';

const PatientAttachments = ({ patientId }) => {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [categoria, setCategoria] = useState('otro');
  const [descripcion, setDescripcion] = useState('');
  const [previewItem, setPreviewItem] = useState(null);
  const [isDragging, setIsDragging] = useState(false);

  const fileInputRef = useRef(null);

  const load = useCallback(async () => {
    if (!patientId) return;
    setLoading(true);
    try {
      const data = await listAttachments(patientId);
      setItems(Array.isArray(data) ? data : []);
    } catch {
      // silent — empty state will show
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [patientId]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!patientId) return;
      setLoading(true);
      try {
        const data = await listAttachments(patientId);
        if (!cancelled) setItems(Array.isArray(data) ? data : []);
      } catch {
        if (!cancelled) setItems([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [patientId]);

  const handleFiles = useCallback(async (fileList) => {
    if (!fileList || fileList.length === 0) return;
    const files = Array.from(fileList);

    // Validación cliente — además del filtro del servidor.
    const tooBig = files.find(f => f.size > MAX_BYTES);
    if (tooBig) {
      message.error(`"${tooBig.name}" excede el tamaño máximo de 15 MB.`);
      return;
    }

    setUploading(true);
    setProgress(0);
    try {
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        // eslint-disable-next-line no-await-in-loop
        await uploadAttachment(patientId, file, {
          categoria,
          descripcion,
          onProgress: (p) => setProgress(p)
        });
      }
      message.success(files.length === 1 ? 'Adjunto subido' : `${files.length} adjuntos subidos`);
      setDescripcion('');
      await load();
    } catch (err) {
      const msg = err?.response?.data?.message || 'No se pudo subir el adjunto.';
      message.error(msg);
    } finally {
      setUploading(false);
      setProgress(0);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  }, [patientId, categoria, descripcion, load]);

  const onInputChange = (e) => handleFiles(e.target.files);

  const onDrop = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    if (e.dataTransfer?.files?.length) {
      handleFiles(e.dataTransfer.files);
    }
  }, [handleFiles]);

  const onDragOver = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  };
  const onDragLeave = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  };

  const onDelete = useCallback(async (attachmentId) => {
    try {
      await deleteAttachment(patientId, attachmentId);
      setItems((prev) => prev.filter((x) => x._id !== attachmentId));
      message.success('Adjunto eliminado');
    } catch (err) {
      const msg = err?.response?.data?.message || 'No se pudo eliminar el adjunto.';
      message.error(msg);
    }
  }, [patientId]);

  const previewUrl = useMemo(
    () => (previewItem ? buildAttachmentUrl(previewItem.url) : ''),
    [previewItem]
  );

  const renderPreviewBody = () => {
    if (!previewItem) return null;
    if (isImage(previewItem.mimeType)) {
      return (
        <img
          src={previewUrl}
          alt={previewItem.originalName}
          className="patient-attachments__preview-image"
        />
      );
    }
    if (isPdf(previewItem.mimeType)) {
      return (
        <iframe
          title={previewItem.originalName}
          src={previewUrl}
          className="patient-attachments__preview-pdf"
        />
      );
    }
    return (
      <div className="patient-attachments__preview-unknown">
        <p>No se puede previsualizar este tipo de archivo.</p>
        <a href={previewUrl} target="_blank" rel="noreferrer">Abrir en pestaña nueva</a>
      </div>
    );
  };

  return (
    <section className="patient-attachments patient-detail__section">
      <header className="patient-attachments__header">
        <h3 className="patient-attachments__title">
          Adjuntos
          <span className="patient-attachments__count">{items.length}</span>
        </h3>
      </header>

      <div
        className={`patient-attachments__dropzone ${isDragging ? 'is-dragging' : ''} ${uploading ? 'is-uploading' : ''}`}
        onDrop={onDrop}
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onClick={() => !uploading && fileInputRef.current?.click()}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if ((e.key === 'Enter' || e.key === ' ') && !uploading) {
            fileInputRef.current?.click();
          }
        }}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept={ACCEPT}
          multiple
          onChange={onInputChange}
          style={{ display: 'none' }}
        />
        <div className="patient-attachments__dropzone-icon" aria-hidden="true">📎</div>
        <div className="patient-attachments__dropzone-text">
          <strong>Haz click o arrastra archivos aquí</strong>
          <span>PDF, JPG, PNG, WEBP, GIF — hasta 15 MB por archivo</span>
        </div>
        {uploading && (
          <div className="patient-attachments__progress">
            <Progress percent={progress} size="small" status="active" />
          </div>
        )}
      </div>

      <div className="patient-attachments__meta-row">
        <div className="patient-attachments__meta-field">
          <label>Categoría</label>
          <Select
            value={categoria}
            onChange={setCategoria}
            options={CATEGORIES}
            disabled={uploading}
            style={{ width: '100%' }}
          />
        </div>
        <div className="patient-attachments__meta-field patient-attachments__meta-field--grow">
          <label>Descripción (opcional)</label>
          <Input
            value={descripcion}
            onChange={(e) => setDescripcion(e.target.value)}
            placeholder="Ej. radiografía panorámica pre-tratamiento"
            disabled={uploading}
            maxLength={500}
          />
        </div>
      </div>

      <div className="patient-attachments__grid">
        {loading && (
          <div className="patient-attachments__empty">Cargando adjuntos…</div>
        )}
        {!loading && items.length === 0 && (
          <div className="patient-attachments__empty">
            No hay adjuntos para este paciente.
          </div>
        )}
        {!loading && items.map((item) => {
          const url = buildAttachmentUrl(item.url);
          const image = isImage(item.mimeType);
          const pdf = isPdf(item.mimeType);
          return (
            <article
              key={item._id}
              className="patient-attachments__card"
              onClick={() => setPreviewItem(item)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') setPreviewItem(item);
              }}
              tabIndex={0}
              role="button"
              aria-label={`Ver adjunto ${item.originalName}`}
            >
              <div className="patient-attachments__thumb">
                {image ? (
                  <img src={url} alt={item.originalName} loading="lazy" />
                ) : pdf ? (
                  <div className="patient-attachments__thumb-pdf">
                    <span className="patient-attachments__thumb-pdf-badge">PDF</span>
                  </div>
                ) : (
                  <div className="patient-attachments__thumb-generic">
                    <span>📄</span>
                  </div>
                )}
              </div>
              <div className="patient-attachments__card-body">
                <div className="patient-attachments__card-name" title={item.originalName}>
                  {item.originalName}
                </div>
                {item.descripcion && (
                  <div className="patient-attachments__card-desc" title={item.descripcion}>
                    {item.descripcion}
                  </div>
                )}
                <div className="patient-attachments__card-meta">
                  <span className="patient-attachments__chip">
                    {CATEGORIES.find(c => c.value === item.categoria)?.label || item.categoria || 'Otro'}
                  </span>
                  <span>{formatBytes(item.size)}</span>
                  <span>{formatDate(item.createdAt)}</span>
                </div>
              </div>
              <div
                className="patient-attachments__card-actions"
                onClick={(e) => e.stopPropagation()}
              >
                <Popconfirm
                  title="Eliminar adjunto"
                  description="Esta acción no se puede deshacer."
                  okText="Eliminar"
                  cancelText="Cancelar"
                  okButtonProps={{ danger: true }}
                  onConfirm={() => onDelete(item._id)}
                >
                  <button
                    type="button"
                    className="patient-attachments__delete-btn"
                    aria-label={`Eliminar ${item.originalName}`}
                  >
                    Eliminar
                  </button>
                </Popconfirm>
              </div>
            </article>
          );
        })}
      </div>

      <Modal
        open={!!previewItem}
        onCancel={() => setPreviewItem(null)}
        footer={null}
        width={previewItem && isImage(previewItem.mimeType) ? 'min(900px, 95vw)' : 'min(1100px, 95vw)'}
        destroyOnClose
        title={previewItem?.originalName || 'Adjunto'}
        className="patient-attachments__preview-modal"
      >
        <div className="patient-attachments__preview-container">
          {renderPreviewBody()}
        </div>
        {previewItem && (
          <div className="patient-attachments__preview-footer">
            <span>{formatBytes(previewItem.size)} · {formatDate(previewItem.createdAt)}</span>
            <a href={previewUrl} target="_blank" rel="noreferrer" className="patient-attachments__preview-open">
              Abrir en pestaña nueva
            </a>
          </div>
        )}
      </Modal>
    </section>
  );
};

export default PatientAttachments;
