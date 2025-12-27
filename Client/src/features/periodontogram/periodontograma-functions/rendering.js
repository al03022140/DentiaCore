/**
 * Rendering.js
 * Módulo consolidado para renderizado del periodontograma
 * Adaptado para trabajar con estructura normalizada (vestibular/palatino)
 * 
 * Funcionalidades:
 * - Renderizado del canvas base
 * - Renderizado de dientes
 * - Renderizado de mediciones
 * - Optimizaciones de rendimiento
 * - Gestión de contexto del canvas
 */

// import PeriodontogramLogger from '../logger';
import PeriodontogramUtils, { getAllTeethData } from '../utils/periodontogram-utils';
import { UI_COLORS } from '../../../shared/config/periodontogram-config';

// ============================================================================
// FUNCIONES BASE DEL CANVAS
// ============================================================================

/**
 * Limpia completamente el canvas
 * @param {CanvasRenderingContext2D} ctx - Contexto del canvas
 * @param {HTMLCanvasElement} canvas - Elemento canvas
 */
export const clearCanvas = (ctx, canvasOrSize) => {
  if (!ctx) {
    console.warn('Contexto no válido para limpiar');
    return;
  }
  // Intentar obtener width/height desde el parámetro o desde ctx.canvas
  let width;
  let height;

  if (canvasOrSize && typeof canvasOrSize.width === 'number' && typeof canvasOrSize.height === 'number') {
    width = canvasOrSize.width;
    height = canvasOrSize.height;
  } else if (ctx.canvas && typeof ctx.canvas.width === 'number' && typeof ctx.canvas.height === 'number') {
    width = ctx.canvas.width;
    height = ctx.canvas.height;
  }

  if (typeof width === 'number' && typeof height === 'number') {
    ctx.clearRect(0, 0, width, height);
  } else {
    console.warn('No se pudo determinar el tamaño del canvas para limpiar');
  }
};

/**
 * Asegura que el contexto del canvas esté disponible
 * @param {CanvasRenderingContext2D} ctx - Contexto del canvas
 * @param {HTMLCanvasElement} canvas - Elemento canvas
 * @returns {CanvasRenderingContext2D|null} Contexto válido o null
 */
export const ensureCanvasContext = (ctx, canvas) => {
  if (!ctx && canvas) {
    console.warn('Contexto del canvas perdido, intentando restaurar...');
    const newCtx = canvas.getContext('2d');
    if (newCtx) {
      console.log('Contexto del canvas restaurado exitosamente');
      return newCtx;
    }
  }
  return ctx;
};

/**
 * Renderiza el fondo del periodontograma
 * @param {CanvasRenderingContext2D} ctx - Contexto del canvas
 * @param {Object} options - Opciones de renderizado
 */
export const renderBackground = (ctx, options) => {
  if (!ctx) return;
  
  const { width, height, backgroundColor = '#ffffff' } = options;
  
  ctx.fillStyle = backgroundColor;
  ctx.fillRect(0, 0, width, height);
};

/**
 * Renderiza la grilla de referencia
 * @param {CanvasRenderingContext2D} ctx - Contexto del canvas
 * @param {Object} options - Opciones de renderizado
 */
export const renderReferenceGrid = (ctx, options) => {
  if (!ctx || !options.showGrid) return;
  
  const { width, height, gridColor = '#e0e0e0', gridSize = 20 } = options;
  
  ctx.strokeStyle = gridColor;
  ctx.lineWidth = 1;
  
  // Líneas verticales
  for (let x = 0; x <= width; x += gridSize) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, height);
    ctx.stroke();
  }
  
  // Líneas horizontales
  for (let y = 0; y <= height; y += gridSize) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(width, y);
    ctx.stroke();
  }
};

/**
 * Renderiza los separadores de secciones
 * @param {CanvasRenderingContext2D} ctx - Contexto del canvas
 * @param {Object} options - Opciones de renderizado
 */
export const renderSectionSeparators = (ctx, options) => {
  if (!ctx) return;
  
  const { width, height, sectionSeparatorColor = '#333333' } = options;
  
  ctx.strokeStyle = sectionSeparatorColor;
  ctx.lineWidth = 2;
  
  // Separador central horizontal (entre arcadas superior e inferior)
  const centerY = height / 2;
  ctx.beginPath();
  ctx.moveTo(0, centerY);
  ctx.lineTo(width, centerY);
  ctx.stroke();
  
  // Separador central vertical (entre lado derecho e izquierdo)
  const centerX = width / 2;
  ctx.beginPath();
  ctx.moveTo(centerX, 0);
  ctx.lineTo(centerX, height);
  ctx.stroke();
};

// ============================================================================
// FUNCIONES DE EXTRACCIÓN DE DATOS NORMALIZADOS
// ============================================================================

// Helpers para flags de ausencia e implante
const isToothAbsent = (toothData) => {
  if (!toothData) return false;
  if (typeof toothData.absent === 'boolean') return toothData.absent;
  if (typeof toothData.ausente === 'number') return toothData.ausente === 1;
  return false;
};

const isToothImplant = (toothData) => {
  if (!toothData) return false;
  if (typeof toothData.isImplant === 'boolean') return toothData.isImplant;
  if (typeof toothData.implant === 'boolean') return toothData.implant;
  if (typeof toothData.implante === 'boolean') return toothData.implante;
  return false;
};
/**
 * Extrae datos clínicos por cara específica (vestibular o palatino)
 * @param {Object} toothData - Datos del diente
 * @param {string} fieldName - Nombre del campo
 * @param {string} face - 'vestibular' o 'palatino'
 * @returns {Array|null} Array de 3 elementos [mesial, central, distal] o null
 */
const extractDataByFace = (toothData, fieldName, face = 'vestibular') => {
  if (!toothData) return null;

  // Si los datos vienen del formato legacy (arrays de 3 o 6 elementos)
  const legacyFieldMapping = {
    sangrado: 'bleeding',
    placa: 'plaque',
    supuracion: 'suppuration',
    profundidadSondaje: 'probingDepth',
    margenGingival: 'gingivalMargin',
    anchuraEncia: 'gumWidth'
  };

  const legacyFieldName = legacyFieldMapping[fieldName] || fieldName;
  if (toothData[legacyFieldName] && Array.isArray(toothData[legacyFieldName])) {
    const legacyArray = toothData[legacyFieldName];
    if (legacyArray.length === 6) {
      // Formato 6-elementos: [V-mesial, V-central, V-distal, L/P-mesial, L/P-central, L/P-distal]
      if (face === 'palatino') {
        return [legacyArray[3] || 0, legacyArray[4] || 0, legacyArray[5] || 0];
      } else {
        return [legacyArray[0] || 0, legacyArray[1] || 0, legacyArray[2] || 0];
      }
    } else if (legacyArray.length >= 3) {
      // Formato 3-elementos - usar para ambas caras (legacy)
      return [legacyArray[0] || 0, legacyArray[1] || 0, legacyArray[2] || 0];
    }
  }

  // Extraer de estructura normalizada
  const faceData = face === 'palatino' 
    ? (toothData.palatino?.[fieldName] || toothData.lingualPalatino?.[fieldName])
    : toothData.vestibular?.[fieldName];

  if (Array.isArray(faceData) && faceData.length >= 3) {
    return [faceData[0] || 0, faceData[1] || 0, faceData[2] || 0];
  } else if (typeof faceData === 'number') {
    return [faceData, faceData, faceData];
  }

  return null;
};

/**
 * Extrae datos clínicos desde el formato normalizado (vestibular/palatino)
 * Convierte a arrays de 3 elementos para el renderizador
 * MANTIENE RETROCOMPATIBILIDAD: prioriza vestibular, fallback a palatino
 */
const extractNormalizedData = (toothData, fieldName) => {
  // Intentar extraer datos vestibulares primero
  const vestibularData = extractDataByFace(toothData, fieldName, 'vestibular');
  if (vestibularData) return vestibularData;

  // Fallback a datos palatinos
  const palatinoData = extractDataByFace(toothData, fieldName, 'palatino');
  if (palatinoData) return palatinoData;

  return [0, 0, 0];
};

/**
 * Extrae datos de movilidad desde el formato normalizado
 */
const extractMobilityData = (toothData) => {
  if (!toothData) return 0;
  
  // Priorizar campo directo 'mobility', luego 'movilidad'
  return toothData.mobility || toothData.movilidad || 0;
};

/**
 * Extrae datos de furca desde el formato normalizado
 */
const extractFurcaData = (toothData) => {
  if (!toothData) return null;
  const furca = toothData.furca || {};
  const normalized = {
    vestibular: furca.vestibular || 0,
    // Mapear todas las variantes a 'lingual' para efectos de renderizado (palatino/lingualPalatino)
    lingual: (furca.lingual ?? furca.palatino ?? furca.lingualPalatino) || 0,
    mesial: furca.mesial || 0,
    distal: furca.distal || 0
  };
  if (furca.doble && typeof furca.doble === 'object') {
    normalized.doble = {
      furca1: furca.doble.furca1 || 0,
      furca2: furca.doble.furca2 || 0
    };
  }
  return normalized;
};

// ============================================================================
// FUNCIONES DE RENDERIZADO DE DIENTES
// ============================================================================

/**
 * Renderiza un diente individual
 * @param {CanvasRenderingContext2D} ctx - Contexto del canvas
 * @param {number} toothNumber - Número del diente (FDI)
 * @param {Object} toothData - Datos del diente
 * @param {Object} position - Posición del diente {x, y, width, height}
 * @param {Object} options - Opciones de renderizado
 */
export const renderTooth = (ctx, toothNumber, toothData, position, options) => {
  if (!ctx) return;
  
  const { x, y, width, height } = position;
  const {
    toothColor = '#ffffff',
    toothBorderColor = '#333333',
    implantColor = '#cccccc',
    absentColor = 'transparent'
  } = options;

  const absent = isToothAbsent(toothData);
  const implant = isToothImplant(toothData);
  
  // Determinar color del diente
  let fillColor = toothColor;
  if (implant) {
    fillColor = implantColor;
  } else if (absent) {
    fillColor = absentColor;
  }
  
  // Renderizar el diente
  ctx.fillStyle = fillColor;
  ctx.strokeStyle = toothBorderColor;
  ctx.lineWidth = 1;
  
  ctx.fillRect(x, y, width, height);
  ctx.strokeRect(x, y, width, height);
  
  // Si el diente está ausente, agregar superposición roja similar al modo de visualización
  if (absent) {
    // Superposición roja semitransparente
    ctx.fillStyle = 'rgba(220, 53, 69, 0.1)';
    ctx.fillRect(x, y, width, height);
    
    // Sin indicador de 'X' por requerimiento: solo overlay rojo semitransparente
  } else {
    // Renderizar número del diente solo si no está ausente
    ctx.fillStyle = '#000000';
    ctx.font = '12px Arial';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(toothNumber.toString(), x + width / 2, y + height / 2);
  }
};

/**
 * Renderiza las zonas de medición de un diente
 * ADAPTADO PARA ESTRUCTURA NORMALIZADA
 * @param {CanvasRenderingContext2D} ctx - Contexto del canvas
 * @param {number} toothNumber - Número del diente (FDI)
 * @param {Object} toothData - Datos del diente (formato normalizado)
 * @param {Object} position - Posición del diente
 * @param {Object} options - Opciones de renderizado
 */
export const renderToothZones = (ctx, toothNumber, toothData, position, options) => {
  if (!ctx || isToothAbsent(toothData)) return;
  
  const { x, y, width, height } = position;
  const zoneWidth = width / 3;
  
  // Extraer datos de sangrado del formato normalizado
  const bleedingArray = extractNormalizedData(toothData, 'sangrado');
  if (bleedingArray) {
    bleedingArray.forEach((hasBleed, index) => {
      if (hasBleed) {
        ctx.fillStyle = UI_COLORS.bleeding.active + '80'; // Agregar transparencia
        ctx.fillRect(x + (index * zoneWidth), y - 10, zoneWidth, 10);
      }
    });
  }
  
  // Extraer datos de placa del formato normalizado
  const plaqueArray = extractNormalizedData(toothData, 'placa');
  if (plaqueArray) {
    plaqueArray.forEach((hasPlaque, index) => {
      if (hasPlaque) {
        ctx.fillStyle = UI_COLORS.plaque.active + '80'; // Agregar transparencia
        ctx.fillRect(x + (index * zoneWidth), y + height, zoneWidth, 10);
      }
    });
  }
  
  // Extraer datos de supuración del formato normalizado
  const suppurationArray = extractNormalizedData(toothData, 'supuracion');
  if (suppurationArray) {
    suppurationArray.forEach((hasSuppuration, index) => {
      if (hasSuppuration) {
        ctx.fillStyle = UI_COLORS.suppuration.active + '80'; // Agregar transparencia
        ctx.fillRect(x + (index * zoneWidth), y + height + 10, zoneWidth, 10);
      }
    });
  }
  
  // Renderizar líneas divisorias de zonas
  ctx.strokeStyle = '#cccccc';
  ctx.lineWidth = 1;
  
  for (let i = 1; i < 3; i++) {
    const lineX = x + (i * zoneWidth);
    ctx.beginPath();
    ctx.moveTo(lineX, y);
    ctx.lineTo(lineX, y + height);
    ctx.stroke();
  }
};

/**
 * Renderiza indicadores de movilidad
 * ADAPTADO PARA ESTRUCTURA NORMALIZADA
 * @param {CanvasRenderingContext2D} ctx - Contexto del canvas
 * @param {number} toothNumber - Número del diente (FDI)
 * @param {Object} toothData - Datos del diente (formato normalizado)
 * @param {Object} position - Posición del diente
 * @param {Object} options - Opciones de renderizado
 */
export const renderMobilityIndicator = (ctx, toothNumber, toothData, position, options) => {
  const mobility = extractMobilityData(toothData);
  
  if (!ctx || isToothAbsent(toothData) || !mobility || mobility === 0) return;
  
  const { x, y, width } = position;
  
  // Colores según grado de movilidad
  const mobilityColors = {
    1: '#FF9800', // Naranja
    2: '#FF5722', // Naranja rojizo
    3: '#F44336'  // Rojo
  };
  
  const color = mobilityColors[mobility] || '#FF9800';
  
  // Renderizar indicador circular
  const centerX = x + width / 2;
  const centerY = y - 15;
  const radius = 5 + (mobility * 2); // Radio aumenta con la movilidad
  
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(centerX, centerY, radius, 0, 2 * Math.PI);
  ctx.fill();
  
  // Renderizar número de movilidad
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 10px Arial';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(mobility.toString(), centerX, centerY);
};

/**
 * Renderiza indicadores de furca
 * ADAPTADO PARA ESTRUCTURA NORMALIZADA
 * @param {CanvasRenderingContext2D} ctx - Contexto del canvas
 * @param {number} toothNumber - Número del diente (FDI)
 * @param {Object} toothData - Datos del diente (formato normalizado)
 * @param {Object} position - Posición del diente
 * @param {Object} options - Opciones de renderizado
 */
export const renderFurcaIndicators = (ctx, toothNumber, toothData, position, options) => {
  if (!ctx || isToothAbsent(toothData)) return;
  
  const furca = extractFurcaData(toothData);
  if (!furca) return;
  
  const { x, y, width, height } = position;
  
  // Colores según grado de furca
  const furcaColors = {
    1: '#FF9800', // Naranja
    2: '#FF5722', // Naranja rojizo
    3: '#F44336'  // Rojo
  };
  
  // Posiciones de los indicadores de furca
  const positions = {
    vestibular: { x: x + width / 2, y: y - 5 },
    lingual: { x: x + width / 2, y: y + height + 5 },
    mesial: { x: x - 5, y: y + height / 2 },
    distal: { x: x + width + 5, y: y + height / 2 }
  };

  const drawMarker = (pos, grade) => {
    const color = furcaColors[grade] || '#FF9800';
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(pos.x, pos.y - 3);
    ctx.lineTo(pos.x - 3, pos.y + 3);
    ctx.lineTo(pos.x + 3, pos.y + 3);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 8px Arial';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(grade.toString(), pos.x, pos.y);
  };

  const useDoublePalatine = !!(PeriodontogramUtils && typeof PeriodontogramUtils.needsDoubleFurca === 'function' && PeriodontogramUtils.needsDoubleFurca(toothNumber));

  // Renderizado específico para doble furca (palatino) cuando aplique
  if (useDoublePalatine && furca.doble && (furca.doble.furca1 > 0 || furca.doble.furca2 > 0)) {
    const base = positions.lingual; // Usar línea palatina/lingual como base visual
    const grades = [furca.doble.furca1 || 0, furca.doble.furca2 || 0];
    const offsets = [-6, 6];
    grades.forEach((g, idx) => {
      if (g > 0) {
        drawMarker({ x: base.x + offsets[idx], y: base.y }, g);
      }
    });
  }

  // Renderizar el resto de ubicaciones, evitando duplicar la lingual si ya se usó doble
  Object.entries(furca).forEach(([location, grade]) => {
    if (location === 'doble') return; // ya manejado
    if (useDoublePalatine && location === 'lingual') return; // evitar duplicado cuando hay doble
    if (grade > 0 && positions[location]) {
      drawMarker(positions[location], grade);
    }
  });
};

// ============================================================================
// FUNCIONES DE RENDERIZADO DE MEDICIONES
// ============================================================================

/**
 * Renderiza las profundidades de sondaje
 * ADAPTADO PARA ESTRUCTURA NORMALIZADA
 * @param {CanvasRenderingContext2D} ctx - Contexto del canvas
 * @param {number} toothNumber - Número del diente (FDI)
 * @param {Object} toothData - Datos del diente (formato normalizado)
 * @param {Object} position - Posición del diente
 * @param {Object} options - Opciones de renderizado
 */
export const renderProbingDepths = (ctx, toothNumber, toothData, position, options) => {
  if (!ctx || isToothAbsent(toothData)) return;
  
  const depths = extractNormalizedData(toothData, 'profundidadSondaje');
  if (!depths) return;
  
  const { x, y, width } = position;
  const zoneWidth = width / 3;
  
  depths.forEach((depth, index) => {
    if (depth > 0) {
      const zoneX = x + (index * zoneWidth) + (zoneWidth / 2);
      const textY = y - 25;
      
      // Color según severidad
      let color = '#4CAF50'; // Verde para normal
      if (depth > 6) color = '#F44336'; // Rojo para severo
      else if (depth > 4) color = '#FF9800'; // Naranja para moderado
      else if (depth > 3) color = '#8BC34A'; // Verde claro para leve
      
      // Renderizar fondo del texto
      ctx.fillStyle = color;
      ctx.fillRect(zoneX - 8, textY - 6, 16, 12);
      
      // Renderizar texto
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 10px Arial';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(depth.toString(), zoneX, textY);
    }
  });
};

/**
 * Renderiza los márgenes gingivales
 * ADAPTADO PARA ESTRUCTURA NORMALIZADA
 * @param {CanvasRenderingContext2D} ctx - Contexto del canvas
 * @param {number} toothNumber - Número del diente (FDI)
 * @param {Object} toothData - Datos del diente (formato normalizado)
 * @param {Object} position - Posición del diente
 * @param {Object} options - Opciones de renderizado
 */
export const renderGingivalMargins = (ctx, toothNumber, toothData, position, options) => {
  if (!ctx || isToothAbsent(toothData)) return;
  
  const margins = extractNormalizedData(toothData, 'margenGingival');
  if (!margins) return;
  
  const { x, y, width, height } = position;
  const zoneWidth = width / 3;
  
  margins.forEach((margin, index) => {
    if (margin !== 0) {
      const zoneX = x + (index * zoneWidth) + (zoneWidth / 2);
      const textY = y + height + 35;
      
      // Color según tipo de margen
      const color = margin < 0 ? '#FF5722' : '#2196F3'; // Rojo para recesión, azul para hiperplasia
      
      // Renderizar fondo del texto
      ctx.fillStyle = color;
      ctx.fillRect(zoneX - 8, textY - 6, 16, 12);
      
      // Renderizar texto
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 9px Arial';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(margin.toString(), zoneX, textY);
    }
  });
};

/**
 * Renderiza el ancho de encía queratinizada
 * ADAPTADO PARA ESTRUCTURA NORMALIZADA
 * @param {CanvasRenderingContext2D} ctx - Contexto del canvas
 * @param {number} toothNumber - Número del diente (FDI)
 * @param {Object} toothData - Datos del diente (formato normalizado)
 * @param {Object} position - Posición del diente
 * @param {Object} options - Opciones de renderizado
 */
export const renderGumWidth = (ctx, toothNumber, toothData, position, options) => {
  if (!ctx || isToothAbsent(toothData)) return;
  
  // anchuraEncia ahora es un valor único por diente (0-3)
  const gumWidth = toothData?.anchuraEncia || 0;
  if (gumWidth <= 0) return;
  
  const { x, y, width, height } = position;
  
  // Renderizar el valor único centrado en el diente
  const centerX = x + (width / 2);
  const textY = y + height + 50;
  
  // Color según adecuación
  const color = gumWidth < 2 ? '#FF9800' : '#4CAF50'; // Naranja si insuficiente, verde si adecuado
  
  // Renderizar fondo del texto
  ctx.fillStyle = color;
  ctx.fillRect(centerX - 6, textY - 5, 12, 10);
  
  // Renderizar texto
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 8px Arial';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(gumWidth.toString(), centerX, textY);
};

// ============================================================================
// FUNCIONES DE RENDERIZADO COMPLETO
// ============================================================================

/**
 * Renderiza un diente completo con todas sus mediciones
 * @param {CanvasRenderingContext2D} ctx - Contexto del canvas
 * @param {number} toothNumber - Número del diente (FDI)
 * @param {Object} toothData - Datos del diente
 * @param {Object} position - Posición del diente
 * @param {Object} options - Opciones de renderizado
 */
export const renderCompleteTooth = (ctx, toothNumber, toothData, position, options) => {
  try {
    // Renderizar el diente base
    renderTooth(ctx, toothNumber, toothData, position, options);
    
    // Renderizar zonas de medición
    renderToothZones(ctx, toothNumber, toothData, position, options);
    
    // Renderizar indicadores clínicos
    if (options.showMobility) {
      renderMobilityIndicator(ctx, toothNumber, toothData, position, options);
    }
    
    if (options.showFurca) {
      renderFurcaIndicators(ctx, toothNumber, toothData, position, options);
    }
    
    // Renderizar mediciones
    if (options.showProbingDepths) {
      renderProbingDepths(ctx, toothNumber, toothData, position, options);
    }
    
    if (options.showGingivalMargins) {
      renderGingivalMargins(ctx, toothNumber, toothData, position, options);
    }
    
    if (options.showGumWidth) {
      renderGumWidth(ctx, toothNumber, toothData, position, options);
    }
    
  } catch (error) {
    console.error(`Error al renderizar diente ${toothNumber}:`, error);
  }
};

/**
 * Renderiza el periodontograma completo
 * ADAPTADO PARA TRABAJAR DIRECTAMENTE CON ESTRUCTURA NORMALIZADA
 * @param {CanvasRenderingContext2D} ctx - Contexto del canvas
 * @param {Object} periodontogramData - Datos del periodontograma (formato normalizado)
 * @param {Object} canvasConfig - Configuración del canvas
 * @param {Object} renderOptions - Opciones de renderizado
 */
export const renderCompletePeriodontogram = (ctx, periodontogramData, canvasConfig, renderOptions) => {
  try {
    // Limpiar canvas
    clearCanvas(ctx, { width: canvasConfig.width, height: canvasConfig.height });
    
    // Renderizar fondo
    renderBackground(ctx, canvasConfig);
    
    // Renderizar grilla si está habilitada
    if (renderOptions.showGrid) {
      renderReferenceGrid(ctx, canvasConfig);
    }
    
    // Renderizar separadores
    renderSectionSeparators(ctx, canvasConfig);
    
    // Obtener datos de todos los dientes
    const allTeethData = getAllTeethData(periodontogramData) || periodontogramData;
    
    // Renderizar cada diente (solo claves numéricas válidas FDI)
    Object.entries(allTeethData).forEach(([key, toothData]) => {
      const toothNum = Number(key);
      if (!Number.isInteger(toothNum)) return; // Ignorar claves no numéricas

      const position = calculateToothPosition(toothNum, canvasConfig);
      
      // El renderizado ahora trabaja directamente con datos normalizados
      renderCompleteTooth(ctx, toothNum, toothData, position, renderOptions);
    });
    
    console.log('Periodontograma renderizado completamente');
    
  } catch (error) {
    console.error('Error al renderizar periodontograma completo:', error);
  }
};

// ============================================================================
// FUNCIONES DE UTILIDAD
// ============================================================================

/**
 * Calcula la posición de un diente en el canvas
 * @param {number} toothNumber - Número del diente (FDI)
 * @param {Object} canvasConfig - Configuración del canvas
 * @returns {Object} Posición {x, y, width, height}
 */
export const calculateToothPosition = (toothNumber, canvasConfig) => {
  const quadrant = Math.floor(toothNumber / 10);
  const position = toothNumber % 10;
  
  const {
    width = 800,
    height = 600,
    toothWidth = 40,
    toothHeight = 60,
    marginX = 50,
    marginY = 50
  } = canvasConfig;
  
  let baseX, baseY;
  
  switch (quadrant) {
    case 1: // Superior derecho
      baseX = width / 2 - (position * toothWidth);
      baseY = marginY;
      break;
    case 2: // Superior izquierdo
      baseX = width / 2 + ((position - 1) * toothWidth);
      baseY = marginY;
      break;
    case 3: // Inferior izquierdo
      baseX = width / 2 + ((position - 1) * toothWidth);
      baseY = height - marginY - toothHeight;
      break;
    case 4: // Inferior derecho
      baseX = width / 2 - (position * toothWidth);
      baseY = height - marginY - toothHeight;
      break;
    default:
      baseX = 0;
      baseY = 0;
  }
  
  return {
    x: baseX,
    y: baseY,
    width: toothWidth,
    height: toothHeight
  };
};

/**
 * Optimiza el renderizado usando requestAnimationFrame
 * @param {Function} renderFunction - Función de renderizado
 * @returns {number} ID de la animación
 */
export const optimizedRender = (renderFunction) => {
  return requestAnimationFrame(renderFunction);
};

/**
 * Cancela un renderizado optimizado
 * @param {number} animationId - ID de la animación
 */
export const cancelOptimizedRender = (animationId) => {
  if (animationId) {
    cancelAnimationFrame(animationId);
  }
};

// ============================================================================
// EXPORTACIONES AGRUPADAS
// ============================================================================

export const CanvasOperations = {
  clear: clearCanvas,
  ensureContext: ensureCanvasContext,
  renderBackground,
  renderGrid: renderReferenceGrid,
  renderSeparators: renderSectionSeparators
};

export const ToothRendering = {
  renderTooth,
  renderZones: renderToothZones,
  renderMobility: renderMobilityIndicator,
  renderFurca: renderFurcaIndicators,
  renderComplete: renderCompleteTooth
};

export const MeasurementRendering = {
  renderProbingDepths,
  renderGingivalMargins,
  renderGumWidth
};

export const CompleteRendering = {
  renderPeriodontogram: renderCompletePeriodontogram,
  calculatePosition: calculateToothPosition,
  optimizedRender,
  cancelRender: cancelOptimizedRender
};

export const Rendering = {
  Canvas: CanvasOperations,
  Tooth: ToothRendering,
  Measurements: MeasurementRendering,
  Complete: CompleteRendering
};

export default Rendering;