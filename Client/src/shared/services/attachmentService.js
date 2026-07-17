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
// M-13: los archivos viven en el servidor de la API (p. ej. :5002), no en el
// origen del frontend. Antes se anteponía `window.location.origin`, lo que en
// producción daba 404 salvo que un proxy reenviara /uploads. Usamos la base de
// la API (igual que fetchLogoBlobUrl/fetchFirmaBlobUrl) para construir una URL correcta.
export const buildAttachmentUrl = (relativeUrl) => {
  if (!relativeUrl) return '';
  if (relativeUrl.startsWith('http')) return relativeUrl;
  const base = (API.defaults.baseURL || window.location.origin).replace(/\/$/, '');
  return `${base}${relativeUrl}`;
};
