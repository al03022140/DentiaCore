/**
 * Utilidades del Periodontograma - Backend
 * Maneja la estructura de directorios y metadatos JSON del periodontograma
 * Sigue convenciones de nomenclatura estrictas del proyecto
 */

const fs = require('fs').promises;
const path = require('path');

/**
 * Constantes para el manejo de archivos del periodontograma
 */
const PERIODONTOGRAM_CONSTANTS = {
  SECTIONS: {
    SUPERIOR: 'superior',
    INFERIOR: 'inferior'
  },
  DIRECTORIES: {
    BASE: 'uploads',
    PERIODONTOGRAM: 'periodontograma', // unificado a minúsculas para alinear con save/read
    VERSIONS: 'versiones'
  },
  FILES: {
    METADATA: 'metadata.json',
    STATISTICS: 'statistics.json'
  },
  VERSION_PREFIX: 'v',
  TIMESTAMP_FORMAT: 'YYYY-MM-DDTHH-mm-ss'
};

/**
 * Ruta unificada: uploads/pacientes/<patient_id>/periodontograma/versiones/
 */
const getUnifiedPeriodontogramPath = (patientId, versionNumber = null) => {
  const basePath = path.join(
    PERIODONTOGRAM_CONSTANTS.DIRECTORIES.BASE,
    'pacientes',
    patientId.toString(),
    PERIODONTOGRAM_CONSTANTS.DIRECTORIES.PERIODONTOGRAM,
    PERIODONTOGRAM_CONSTANTS.DIRECTORIES.VERSIONS
  );
  return versionNumber ? path.join(basePath, versionNumber.toString()) : basePath;
};

/**
 * Cache para timestamps de sesiones activas
 */
const activeSessionTimestamps = new Map();

/**
 * Limpia archivos temporales o corruptos
 * @param {string} filePath - Ruta del archivo a limpiar
 */
async function _cleanupFile(filePath) {
  try {
    await fs.unlink(filePath);
    console.log(`Archivo limpiado: ${filePath}`);
  } catch (error) {
    console.warn(`No se pudo limpiar archivo ${filePath}:`, error.message);
  }
}

/**
 * Limpia archivos y lanza error
 * @param {string} message - Mensaje de error
 * @param {Array} filesToClean - Archivos a limpiar
 */
async function _cleanupAndThrow(message, filesToClean = []) {
  console.error(`❌ [PeriodontogramUtils] ${message}`);
  
  // Limpiar archivos creados
  for (const filePath of filesToClean) {
    try {
      await fs.unlink(filePath);
      console.log(`🧹 Archivo limpiado: ${filePath}`);
    } catch (cleanupError) {
      console.warn(`⚠️ No se pudo limpiar: ${filePath}`, cleanupError.message);
    }
  }
  
  throw new Error(message);
}

/**
 * Asegura que existe la estructura de directorios para el periodontograma
 * @param {string} patientId - ID del paciente
 * @param {string} versionNumber - Número de versión (opcional)
 * @returns {Promise<string>} Ruta del directorio
 */
async function ensurePeriodontogramDirectoryStructure(patientId, versionNumber = null) {
  try {
    const targetPath = path.join(__dirname, '..', getUnifiedPeriodontogramPath(patientId, versionNumber));
    
    await fs.mkdir(targetPath, { recursive: true });
    console.log(`📁 Directorio creado: ${targetPath}`);
    return targetPath;
  } catch (error) {
    console.error('❌ Error creando estructura de directorios:', error);
    throw new Error(`Error creando directorios: ${error.message}`);
  }
}



/**
 * Crea archivos de metadatos para una versión
 * @param {string} versionDir - Directorio de la versión
 * @param {Object} data - Datos para los metadatos
 */
async function createVersionMetadata(versionDir, data) {
  try {
    const {
      sessionId,
      versionNumber,
      section,
      statistics,
      data: additionalData,
      imageInfo
    } = data;
    
    const timestamp = new Date().toISOString();
    
    // Crear metadata.json
    const metadata = {
      sessionId,
      versionNumber,
      section,
      timestamp,
      imageInfo,
      additionalData
    };
    
    const metadataPath = path.join(versionDir, PERIODONTOGRAM_CONSTANTS.FILES.METADATA);
    await fs.writeFile(metadataPath, JSON.stringify(metadata, null, 2));
    console.log(`📄 Metadata creado: ${metadataPath}`);
    
    // Crear statistics.json si se proporcionaron estadísticas
    if (statistics) {
      const statisticsData = {
        ...statistics,
        timestamp,
        versionNumber
        // sessionId se maneja por separado en metadata, no duplicar en statistics
      };
      
      const statisticsPath = path.join(versionDir, PERIODONTOGRAM_CONSTANTS.FILES.STATISTICS);
      await fs.writeFile(statisticsPath, JSON.stringify(statisticsData, null, 2));
      console.log(`📊 Estadísticas creadas: ${statisticsPath}`);
    }
    
  } catch (error) {
    console.error('❌ Error creando metadatos:', error);
    throw new Error(`Error creando metadatos: ${error.message}`);
  }
}

/**
 * Obtiene el siguiente número de versión
 * @param {string} patientId - ID del paciente
 * @returns {Promise<string>} Número de versión
 */
async function getNextVersionNumber(patientId) {
  try {
    const versionsDir = path.join(__dirname, '..', getUnifiedPeriodontogramPath(patientId));
    
    let nextVersion = 1;
    
    try {
      const entries = await fs.readdir(versionsDir);
      const versionNumbers = entries
        .filter(entry => entry.startsWith(PERIODONTOGRAM_CONSTANTS.VERSION_PREFIX))
        .map(entry => {
          const match = entry.match(/^v(\d+)_/);
          return match ? parseInt(match[1], 10) : 0;
        })
        .filter(num => num > 0);
      
      if (versionNumbers.length > 0) {
        nextVersion = Math.max(...versionNumbers) + 1;
      }
    } catch (_error) {
      // El directorio no existe, empezar con versión 1
      console.log('📁 Directorio de versiones no existe, empezando con v001');
    }
    
    // Generar timestamp para la versión
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const versionNumber = `${PERIODONTOGRAM_CONSTANTS.VERSION_PREFIX}${nextVersion.toString().padStart(3, '0')}_${timestamp}`;
    
    console.log(`🔢 Siguiente versión generada: ${versionNumber}`);
    return versionNumber;
    
  } catch (error) {
    console.error('❌ Error obteniendo siguiente versión:', error);
    throw new Error(`Error obteniendo versión: ${error.message}`);
  }
}

/**
 * Obtiene todas las versiones disponibles para un paciente
 * @param {string} patientId - ID del paciente
 * @returns {Promise<Array>} Lista de versiones
 */
async function _getPeriodontogramVersions(patientId) {
  try {
    const versionsDir = path.join(__dirname, '..', getUnifiedPeriodontogramPath(patientId));
    
    try {
      const entries = await fs.readdir(versionsDir);
      const versions = [];
      
      for (const entry of entries) {
        const versionPath = path.join(versionsDir, entry);
        const stat = await fs.stat(versionPath);
        
        if (stat.isDirectory() && entry.startsWith(PERIODONTOGRAM_CONSTANTS.VERSION_PREFIX)) {
          // Leer metadatos si existen
          const metadataPath = path.join(versionPath, PERIODONTOGRAM_CONSTANTS.FILES.METADATA);
          let metadata = null;
          
          try {
            const metadataContent = await fs.readFile(metadataPath, 'utf8');
            metadata = JSON.parse(metadataContent);
          } catch (metadataError) {
            console.warn(`⚠️ No se pudieron leer metadatos para ${entry}:`, metadataError.message);
          }
          
          versions.push({
            versionNumber: entry,
            path: versionPath,
            createdAt: stat.birthtime,
            modifiedAt: stat.mtime,
            metadata
          });
        }
      }
      
      // Ordenar por fecha de creación (más reciente primero)
      versions.sort((a, b) => b.createdAt - a.createdAt);
      
      console.log(`📋 Encontradas ${versions.length} versiones para paciente ${patientId}`);
      return versions;
      
    } catch (error) {
      if (error.code === 'ENOENT') {
        console.log(`📁 No existen versiones para paciente ${patientId}`);
        return [];
      }
      throw error;
    }
    
  } catch (error) {
    console.error('❌ Error obteniendo versiones:', error);
    throw new Error(`Error obteniendo versiones: ${error.message}`);
  }
}

/**
 * Elimina una versión específica del periodontograma
 * @param {string} patientId - ID del paciente
 * @param {string} versionNumber - Número de versión
 * @returns {Promise<boolean>} Éxito de la operación
 */
async function deletePeriodontogramVersion(patientId, versionNumber) {
  try {
    const versionPath = path.join(__dirname, '..', getUnifiedPeriodontogramPath(patientId, versionNumber));
    
    // Verificar que existe
    try {
      await fs.access(versionPath);
    } catch (_error) {
      throw new Error(`La versión ${versionNumber} no existe`);
    }
    
    // Eliminar directorio completo
    await fs.rm(versionPath, { recursive: true, force: true });
    
    console.log(`🗑️ Versión eliminada: ${versionNumber}`);
    return true;
    
  } catch (error) {
    console.error('❌ Error eliminando versión:', error);
    throw new Error(`Error eliminando versión: ${error.message}`);
  }
}

/**
 * Gestiona el timestamp de sesión activa
 * @param {string} sessionId - ID de la sesión
 * @param {string} timestamp - Timestamp (opcional)
 * @returns {string} Timestamp de la sesión
 */
function manageSessionTimestamp(sessionId, timestamp = null) {
  if (timestamp) {
    activeSessionTimestamps.set(sessionId, timestamp);
    console.log(`⏰ Timestamp de sesión actualizado: ${sessionId} -> ${timestamp}`);
    return timestamp;
  } else {
    const existingTimestamp = activeSessionTimestamps.get(sessionId);
    if (existingTimestamp) {
      console.log(`⏰ Timestamp de sesión recuperado: ${sessionId} -> ${existingTimestamp}`);
      return existingTimestamp;
    } else {
      const newTimestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
      activeSessionTimestamps.set(sessionId, newTimestamp);
      console.log(`⏰ Nuevo timestamp de sesión creado: ${sessionId} -> ${newTimestamp}`);
      return newTimestamp;
    }
  }
}

/**
 * Limpia timestamps de sesiones inactivas
 * @param {number} maxAge - Edad máxima en milisegundos (por defecto 1 hora)
 */
function cleanupInactiveSessions(maxAge = 60 * 60 * 1000) {
  const now = Date.now();
  const sessionsToDelete = [];
  
  for (const [sessionId, timestamp] of activeSessionTimestamps) {
    const sessionTime = new Date(timestamp.replace(/-/g, ':')).getTime();
    if (now - sessionTime > maxAge) {
      sessionsToDelete.push(sessionId);
    }
  }
  
  sessionsToDelete.forEach(sessionId => {
    activeSessionTimestamps.delete(sessionId);
    console.log(`🧹 Sesión inactiva limpiada: ${sessionId}`);
  });
  
  if (sessionsToDelete.length > 0) {
    console.log(`🧹 ${sessionsToDelete.length} sesiones inactivas limpiadas`);
  }
}

// Limpiar sesiones inactivas cada 30 minutos
// .unref() permite que el proceso termine limpiamente sin esperar al intervalo
const _cleanupInterval = setInterval(() => {
  cleanupInactiveSessions();
}, 30 * 60 * 1000);
_cleanupInterval.unref();


// Eliminar exportación de getPeriodontogramVersions y addImageVersion del objeto module.exports
module.exports = {
  ensurePeriodontogramDirectoryStructure,
  createVersionMetadata,
  getNextVersionNumber,
  // getPeriodontogramVersions, // eliminado
  deletePeriodontogramVersion,
  manageSessionTimestamp,
  cleanupInactiveSessions,
  getUnifiedPeriodontogramPath,
  PERIODONTOGRAM_CONSTANTS
};