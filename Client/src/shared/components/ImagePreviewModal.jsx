import React from 'react';
import { Modal } from 'antd';
import './styles/image-preview-modal.css';

export default function ImagePreviewModal({ open, onClose, src, alt, title }) {
  return (
    <Modal
      open={open}
      onCancel={onClose}
      footer={null}
      destroyOnClose
      centered
      width="min(560px, 92vw)"
      title={title}
      className="image-preview-modal"
    >
      <div className="image-preview-modal__container">
        <img src={src} alt={alt} className="image-preview-modal__image" />
      </div>
      <div className="image-preview-modal__footer">
        <a href={src} target="_blank" rel="noreferrer">Abrir en pestaña nueva</a>
      </div>
    </Modal>
  );
}
