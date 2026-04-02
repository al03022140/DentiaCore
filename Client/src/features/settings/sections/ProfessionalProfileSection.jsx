import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useAuth } from '../../../app/auth/AuthContext';
import {
  updateProfessionalProfile,
  uploadFirma,
  deleteFirma,
  getFirmaUrl,
} from '../../../shared/services/settingsService';
import pencilIcon from '../../../assets/images/icons/pencil.svg';
import folderUploadIcon from '../../../assets/images/icons/folder-upload.svg';

const ProfessionalProfileSection = () => {
  const { user, refreshUser } = useAuth();
  const userId = user?._id || user?.id;

  const [cedula, setCedula] = useState(user?.cedulaProfesional || '');
  const [especialidad, setEspecialidad] = useState(user?.especialidad || '');
  const [universidad, setUniversidad] = useState(user?.universidad || '');
  const [registroSSA, setRegistroSSA] = useState(user?.registroSSA || '');
  const [msg, setMsg] = useState(null);
  const [saving, setSaving] = useState(false);

  // Firma
  const [hasFirma, setHasFirma] = useState(!!user?.firmaDigitalUrl);
  const [firmaMode, setFirmaMode] = useState('upload'); // 'upload' | 'draw'
  const [firmaMsg, setFirmaMsg] = useState(null);
  const canvasRef = useRef(null);
  const drawingRef = useRef(false);

  useEffect(() => {
    setHasFirma(!!user?.firmaDigitalUrl);
  }, [user?.firmaDigitalUrl]);

  // ── Professional data save ──
  const handleSave = async (e) => {
    e.preventDefault();
    setSaving(true);
    setMsg(null);
    try {
      await updateProfessionalProfile({
        cedulaProfesional: cedula,
        especialidad,
        universidad,
        registroSSA,
      });
      if (refreshUser) await refreshUser();
      setMsg({ type: 'success', text: 'Perfil profesional actualizado' });
    } catch (err) {
      setMsg({ type: 'error', text: err.response?.data?.message || 'Error al guardar' });
    } finally {
      setSaving(false);
    }
  };

  // ── Upload file ──
  const handleFileUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setFirmaMsg(null);
    try {
      await uploadFirma(file);
      if (refreshUser) await refreshUser();
      setHasFirma(true);
      setFirmaMsg({ type: 'success', text: 'Firma subida correctamente' });
    } catch (err) {
      setFirmaMsg({ type: 'error', text: err.response?.data?.message || 'Error al subir firma' });
    }
  };

  // ── Canvas drawing helpers ──
  const lastPointRef = useRef(null);

  const setupCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    const ctx = canvas.getContext('2d');
    ctx.scale(dpr, dpr);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.lineWidth = 2;
    ctx.strokeStyle = '#111';
  }, []);

  useEffect(() => {
    if (firmaMode === 'draw') {
      // Small delay so the canvas is rendered with its CSS size
      const id = requestAnimationFrame(setupCanvas);
      return () => cancelAnimationFrame(id);
    }
  }, [firmaMode, setupCanvas]);

  const getCanvasCoords = (e) => {
    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;
    return {
      x: clientX - rect.left,
      y: clientY - rect.top,
    };
  };

  const startDraw = (e) => {
    e.preventDefault();
    drawingRef.current = true;
    const point = getCanvasCoords(e);
    lastPointRef.current = point;
    const ctx = canvasRef.current.getContext('2d');
    ctx.beginPath();
    ctx.moveTo(point.x, point.y);
  };

  const draw = (e) => {
    e.preventDefault();
    if (!drawingRef.current) return;
    const ctx = canvasRef.current.getContext('2d');
    const point = getCanvasCoords(e);
    const last = lastPointRef.current;
    // Quadratic curve through midpoint for smooth strokes
    const mid = { x: (last.x + point.x) / 2, y: (last.y + point.y) / 2 };
    ctx.quadraticCurveTo(last.x, last.y, mid.x, mid.y);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(mid.x, mid.y);
    lastPointRef.current = point;
  };

  const endDraw = (e) => {
    if (e) e.preventDefault();
    drawingRef.current = false;
    lastPointRef.current = null;
  };

  const clearCanvas = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    setupCanvas();
  };

  const saveCanvasAsFirma = useCallback(async () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    setFirmaMsg(null);
    canvas.toBlob(async (blob) => {
      if (!blob) return;
      const file = new File([blob], 'firma.png', { type: 'image/png' });
      try {
        await uploadFirma(file);
        if (refreshUser) await refreshUser();
        setHasFirma(true);
        setFirmaMsg({ type: 'success', text: 'Firma guardada correctamente' });
      } catch (err) {
        setFirmaMsg({ type: 'error', text: err.response?.data?.message || 'Error al guardar firma' });
      }
    }, 'image/png');
  }, [refreshUser]);

  const handleDeleteFirma = async () => {
    setFirmaMsg(null);
    try {
      await deleteFirma();
      if (refreshUser) await refreshUser();
      setHasFirma(false);
      setFirmaMsg({ type: 'success', text: 'Firma eliminada' });
    } catch (err) {
      setFirmaMsg({ type: 'error', text: err.response?.data?.message || 'Error al eliminar firma' });
    }
  };

  return (
    <div>
      {/* Datos profesionales */}
      <form onSubmit={handleSave}>
        {msg && <div className={`settings-message ${msg.type}`}>{msg.text}</div>}
        <div className="settings-form-group">
          <label>Cédula profesional</label>
          <input value={cedula} onChange={(e) => setCedula(e.target.value)} />
        </div>
        <div className="settings-form-group">
          <label>Especialidad</label>
          <input value={especialidad} onChange={(e) => setEspecialidad(e.target.value)} />
        </div>
        <div className="settings-form-group">
          <label>Universidad</label>
          <input value={universidad} onChange={(e) => setUniversidad(e.target.value)} />
        </div>
        <div className="settings-form-group">
          <label>Registro SSA</label>
          <input value={registroSSA} onChange={(e) => setRegistroSSA(e.target.value)} />
        </div>
        <div className="settings-actions">
          <button type="submit" className="settings-btn-primary" disabled={saving}>
            {saving ? 'Guardando…' : 'Guardar datos profesionales'}
          </button>
        </div>
      </form>

      <hr style={{ margin: '2rem 0', borderColor: 'var(--color-border-light)' }} />

      {/* Firma digital */}
      <h3 style={{ marginBottom: '1rem' }}>Firma digital</h3>
      {firmaMsg && <div className={`settings-message ${firmaMsg.type}`}>{firmaMsg.text}</div>}

      {hasFirma && (
        <div className="signature-preview" style={{ marginBottom: '1rem' }}>
          <img
            src={getFirmaUrl(userId)}
            alt="Firma digital"
            onError={(e) => { e.target.style.display = 'none'; }}
          />
          <button className="settings-btn-danger" onClick={handleDeleteFirma}>Eliminar firma</button>
        </div>
      )}

      <div className="signature-container">
        <div className="signature-toggle">
          <button
            className={firmaMode === 'upload' ? 'active' : ''}
            onClick={() => setFirmaMode('upload')}
            type="button"
          >
            <img src={folderUploadIcon} alt="" width="16" height="16" className="theme-icon" /> Subir archivo
          </button>
          <button
            className={firmaMode === 'draw' ? 'active' : ''}
            onClick={() => setFirmaMode('draw')}
            type="button"
          >
            <img src={pencilIcon} alt="" width="16" height="16" className="theme-icon" /> Dibujar
          </button>
        </div>

        {firmaMode === 'upload' ? (
          <div className="settings-form-group">
            <input type="file" accept="image/png,image/jpeg" onChange={handleFileUpload} />
            <span className="hint">PNG o JPG, máximo 500 KB</span>
          </div>
        ) : (
          <>
            <canvas
              ref={canvasRef}
              className="signature-canvas"
              onMouseDown={startDraw}
              onMouseMove={draw}
              onMouseUp={endDraw}
              onMouseLeave={endDraw}
              onTouchStart={startDraw}
              onTouchMove={draw}
              onTouchEnd={endDraw}
            />
            <div className="settings-actions">
              <button className="settings-btn-secondary" onClick={clearCanvas} type="button">Limpiar</button>
              <button className="settings-btn-primary" onClick={saveCanvasAsFirma} type="button">Guardar firma</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default ProfessionalProfileSection;
