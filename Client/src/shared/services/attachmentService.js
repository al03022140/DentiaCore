import API from './axios-instance';

export const listAttachments = async (patientId) => {
  const { data } = await API.get(`/patients/${encodeURIComponent(patientId)}/attachments`);
  return data;
};

export const uploadAttachment = async (patientId, file, { categoria, descripcion, onProgress } = {}) => {
  const formData = new FormData();
  formData.append('file', file);
  if (categoria) formData.append('categoria', categoria);
  if (descripcion) formData.append('descripcion', descripcion);

  // No fijamos Content-Type: axios lo establece automáticamente con el
  // boundary correcto cuando el body es FormData.
  const { data } = await API.post(
    `/patients/${encodeURIComponent(patientId)}/attachments`,
    formData,
    {
      onUploadProgress: (event) => {
        if (!onProgress || !event.total) return;
        onProgress(Math.round((event.loaded * 100) / event.total));
      }
    }
  );
  return data;
};

export const deleteAttachment = async (patientId, attachmentId) => {
  const { data } = await API.delete(
    `/patients/${encodeURIComponent(patientId)}/attachments/${encodeURIComponent(attachmentId)}`
  );
  return data;
};

// Devuelve la URL absoluta a partir del campo `url` ("/uploads/...") guardado en el adjunto.
export const buildAttachmentUrl = (relativeUrl) => {
  if (!relativeUrl) return '';
  if (relativeUrl.startsWith('http')) return relativeUrl;
  return `${window.location.origin}${relativeUrl}`;
};
