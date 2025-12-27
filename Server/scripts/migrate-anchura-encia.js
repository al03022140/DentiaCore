/**
 * Script para migrar datos de periodontograma existentes:
 * Convierte anchuraEncia de arrays por cara a valor único por diente
 */

const fs = require('fs');
const path = require('path');

// Función para calcular promedio de arrays de anchuraEncia
function calculateAverageGumWidth(vestibular, palatino) {
  const allValues = [...vestibular, ...palatino].filter(val => val > 0);
  if (allValues.length === 0) return 0;
  return Math.round((allValues.reduce((sum, val) => sum + val, 0) / allValues.length) * 10) / 10;
}

// Función para migrar un archivo de periodontograma
function migratePeriodontogramFile(filePath) {
  try {
    console.log(`Migrando archivo: ${filePath}`);
    
    const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    let modified = false;
    
    if (data.teeth) {
      Object.keys(data.teeth).forEach(toothNumber => {
        const tooth = data.teeth[toothNumber];
        
        // Verificar si tiene anchuraEncia en las caras
        const hasVestibularAnchura = tooth.vestibular && Array.isArray(tooth.vestibular.anchuraEncia);
        const hasPalatinoAnchura = tooth.palatino && Array.isArray(tooth.palatino.anchuraEncia);
        const hasLingualAnchura = tooth.lingualPalatino && Array.isArray(tooth.lingualPalatino.anchuraEncia);
        
        if (hasVestibularAnchura || hasPalatinoAnchura || hasLingualAnchura) {
          // Obtener valores de anchuraEncia de las caras
          const vestibularValues = hasVestibularAnchura ? tooth.vestibular.anchuraEncia : [0, 0, 0];
          const palatinoValues = hasPalatinoAnchura ? tooth.palatino.anchuraEncia : 
                               hasLingualAnchura ? tooth.lingualPalatino.anchuraEncia : [0, 0, 0];
          
          // Calcular promedio
          const averageGumWidth = calculateAverageGumWidth(vestibularValues, palatinoValues);
          
          // Asignar valor único a nivel de diente
          tooth.anchuraEncia = averageGumWidth;
          
          // Eliminar anchuraEncia de las caras
          if (tooth.vestibular && tooth.vestibular.anchuraEncia) {
            delete tooth.vestibular.anchuraEncia;
          }
          if (tooth.palatino && tooth.palatino.anchuraEncia) {
            delete tooth.palatino.anchuraEncia;
          }
          if (tooth.lingualPalatino && tooth.lingualPalatino.anchuraEncia) {
            delete tooth.lingualPalatino.anchuraEncia;
          }
          
          modified = true;
          console.log(`  Diente ${toothNumber}: anchuraEncia migrada a ${averageGumWidth}`);
        }
      });
    }
    
    if (modified) {
      // Crear backup
      const backupPath = filePath + '.backup-' + Date.now();
      fs.copyFileSync(filePath, backupPath);
      console.log(`  Backup creado: ${backupPath}`);
      
      // Guardar archivo migrado
      fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
      console.log(`  Archivo migrado exitosamente`);
      return true;
    } else {
      console.log(`  No requiere migración`);
      return false;
    }
    
  } catch (error) {
    console.error(`Error migrando ${filePath}:`, error.message);
    return false;
  }
}

// Función para buscar y migrar todos los archivos de periodontograma
function migrateAllPeriodontograms() {
  const uploadsDir = path.join(__dirname, '..', 'uploads');
  
  if (!fs.existsSync(uploadsDir)) {
    console.log('Directorio uploads no encontrado');
    return;
  }
  
  let totalFiles = 0;
  let migratedFiles = 0;
  
  function searchPeriodontogramFiles(dir) {
    const items = fs.readdirSync(dir);
    
    items.forEach(item => {
      const itemPath = path.join(dir, item);
      const stat = fs.statSync(itemPath);
      
      if (stat.isDirectory()) {
        searchPeriodontogramFiles(itemPath);
      } else if (item === 'periodontogram.json') {
        totalFiles++;
        if (migratePeriodontogramFile(itemPath)) {
          migratedFiles++;
        }
      }
    });
  }
  
  console.log('=== INICIANDO MIGRACIÓN DE ANCHURA ENCÍA ===');
  console.log('Buscando archivos periodontogram.json...');
  
  searchPeriodontogramFiles(uploadsDir);
  
  console.log('\n=== RESUMEN DE MIGRACIÓN ===');
  console.log(`Archivos encontrados: ${totalFiles}`);
  console.log(`Archivos migrados: ${migratedFiles}`);
  console.log(`Archivos sin cambios: ${totalFiles - migratedFiles}`);
  
  if (migratedFiles > 0) {
    console.log('\n✅ Migración completada exitosamente');
    console.log('📁 Se crearon backups de los archivos originales');
  } else {
    console.log('\n✅ No se requirieron migraciones');
  }
}

// Ejecutar migración si se llama directamente
if (require.main === module) {
  migrateAllPeriodontograms();
}

module.exports = {
  migratePeriodontogramFile,
  migrateAllPeriodontograms,
  calculateAverageGumWidth
};