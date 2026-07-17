/**
 * Panel de estadísticas simplificado para el periodontograma
 * Versión temporal sin dependencias complejas
 */

import { useMemo, useState } from 'react';
import PropTypes from 'prop-types';
import { getToothData } from "./utils/periodontogram-utils";
import { UniversalToothValidator } from "../../shared/validators/universal-tooth-validator";
import { ADVANCED_LOGGING_CONFIG } from './utils/config.js';
import './styles/statistics-panel.css';
import stadisticsIcon from '../../assets/images/icons/stadistics.svg';
import checkCircle2Icon from '../../assets/images/icons/check circle 2.svg';
import { logger } from '../../shared/utils/logger';

const StatisticsPanel = ({
  data = null,
  teeth = [],
  compact = false
}) => {
  // El padre actualiza `data` de forma inmutable en cada edición (nueva
  // referencia + teeth nuevo + lastModified), así que el useMemo de estadísticas
  // depende de `data` y recalcula solo cuando cambia. Antes había tres mecanismos
  // solapados para lo mismo sobre un único memo (forceUpdate con debounce de
  // 150ms, dataKey con hash, sampleDataVersion), y el validador ya cachea por su
  // cuenta con su propio hash. M7.
  const [sampleDataVersion, setSampleDataVersion] = useState(0);

  // Función para crear datos de prueba específicos
  const createSampleData = () => {
    let bleedingSitesCreated = 0;
    const targetBleedingSites = 3; // Exactamente 3 sitios con sangrado (debería dar ~4.17% con 72 sitios totales)
    
    const randomDepth = () => Math.floor(Math.random() * 6) + 1; // 1-6mm
    const randomMargin = () => Math.floor(Math.random() * 3); // 0-2mm
    
    // Función para crear sangrado controlado
    const createControlledBleeding = () => {
      const face = [0, 0, 0]; // Por defecto sin sangrado
      // Solo agregar sangrado si no hemos alcanzado el límite
      if (bleedingSitesCreated < targetBleedingSites) {
        const sitesToAdd = Math.min(3, targetBleedingSites - bleedingSitesCreated);
        for (let i = 0; i < sitesToAdd; i++) {
          face[i] = 1;
          bleedingSitesCreated++;
        }
      }
      return face;
    };
    
    const sampleData = {
      getTooth: (toothNumber) => {
        // Crear datos de muestra para todos los 32 dientes como SEPA
        const allTeeth = [11, 12, 13, 14, 15, 16, 17, 18, 21, 22, 23, 24, 25, 26, 27, 28, 31, 32, 33, 34, 35, 36, 37, 38, 41, 42, 43, 44, 45, 46, 47, 48];
        if (allTeeth.includes(toothNumber)) {
          return {
            available: true,
            bleeding: {
              vestibular: toothNumber === 11 ? createControlledBleeding() : [0, 0, 0], // 3 sitios vestibulares
              palatino: [0, 0, 0] // 3 sitios palatino/linguales
            },
            plaque: {
              vestibular: [Math.random() > 0.7 ? 1 : 0, Math.random() > 0.7 ? 1 : 0, Math.random() > 0.7 ? 1 : 0], // 3 sitios vestibulares
              palatino: [Math.random() > 0.7 ? 1 : 0, Math.random() > 0.7 ? 1 : 0, Math.random() > 0.7 ? 1 : 0] // 3 sitios palatino/linguales
            },
            probingDepth: {
              // Crear exactamente 3 sitios con 9mm de profundidad para demostrar el cálculo SEPA (solo vestibular)
              vestibular: toothNumber === 11 ? [9, 9, 9] : [randomDepth(), randomDepth(), randomDepth()], // 3 sitios vestibulares
              palatino: [randomDepth(), randomDepth(), randomDepth()] // 3 sitios palatino/linguales (no se cuentan en SEPA)
            },
            gingivalMargin: {
              // Crear exactamente 3 sitios con 9mm de margen para demostrar el cálculo SEPA (solo vestibular)
              vestibular: toothNumber === 11 ? [9, 9, 9] : [randomMargin(), randomMargin(), randomMargin()], // 3 sitios vestibulares
              palatino: [randomMargin(), randomMargin(), randomMargin()] // 3 sitios palatino/linguales (no se cuentan en SEPA)
            }
          };
        }
        return { available: true };
      }
    };
    return sampleData;
  };
  
  // Usar todos los 32 dientes como estándar SEPA para cálculo correcto
  const allTeeth = [11, 12, 13, 14, 15, 16, 17, 18, 21, 22, 23, 24, 25, 26, 27, 28, 31, 32, 33, 34, 35, 36, 37, 38, 41, 42, 43, 44, 45, 46, 47, 48];
  // Filtrar valores NaN del array teeth antes de usarlo
  const validTeeth = teeth.filter(tooth => !isNaN(tooth) && tooth !== null && tooth !== undefined);
  const workingTeeth = validTeeth.length > 0 ? validTeeth : allTeeth;
  
  // Función para normalizar nombres de estadísticas
  const normalizeStatistics = (stats) => {
    if (!stats) return null;
    
    // Si las estadísticas vienen con nombres en español, mapearlas a inglés
    const normalized = {
      totalTeeth: stats.totalTeeth || stats.dientesTotales || 0,
      presentTeeth: stats.presentTeeth || stats.dientesPresentes || 0,
      absentTeeth: stats.absentTeeth || stats.dientesAusentes || 0,
      averageDepth: stats.averageDepth || stats.profundidadPromedio || stats.averageProbingDepth || 0,
      averageProbingDepth: stats.averageProbingDepth || stats.averageDepth || stats.profundidadPromedio || 0,
      bleedingPercentage: stats.bleedingPercentage || stats.sangradoTotal || 0,
      plaquePercentage: stats.plaquePercentage || stats.placaTotal || 0,
      averageAttachmentLevel: stats.averageAttachmentLevel || stats.nivelInsercionPromedio || stats.averageAttachment || 0
    };
    
    if (ADVANCED_LOGGING_CONFIG.enabled) logger.log('🔄 StatisticsPanel: Estadísticas normalizadas:', {
      original: stats,
      normalized: normalized
    });
    
    return normalized;
  };

  // Función para verificar si las estadísticas pre-calculadas son todas 0
  const areStatisticsAllZero = (stats) => {
    if (!stats) return true;
    
    const values = [
      stats.bleedingPercentage || stats.sangradoTotal || 0,
      stats.plaquePercentage || stats.placaTotal || 0,
      stats.averageProbingDepth || stats.profundidadPromedio || 0,
      stats.averageDepth || stats.profundidadPromedio || 0,
      stats.averageAttachmentLevel || stats.nivelInsercionPromedio || 0
    ];
    
    return values.every(value => value === 0);
  };

  // Usar directamente las estadísticas calculadas por UniversalToothValidator
  const statistics = useMemo(() => {
    if (ADVANCED_LOGGING_CONFIG.enabled) logger.log('🔄 StatisticsPanel: Recalculando estadísticas...', {
      hasData: !!data,
      sampleDataVersion,
      teethCount: data?.teeth ? Object.keys(data.teeth).length : 0,
      hasPreCalculatedStats: !!data?.statistics
    });

    if (data) {
      // Con dientes: SIEMPRE devolver el cálculo en vivo, aunque dé ceros — es la
      // verdad de los datos actuales. Antes, un resultado en ceros se caía a las
      // estadísticas pre-calculadas, lo que enmascaraba gráficas legítimamente
      // vacías y podía mostrar números viejos. La pre-calculada solo se usa cuando
      // NO hay dientes que recalcular. M7.
      if (data.teeth && Object.keys(data.teeth).length > 0) {
        return UniversalToothValidator.calculateStatistics(data);
      }

      // Sin dientes pero con estadísticas pre-calculadas: usarlas.
      if (data.statistics && !areStatisticsAllZero(data.statistics)) {
        return normalizeStatistics(data.statistics);
      }

      // Sin dientes ni estadísticas: calcular (dará ceros).
      return UniversalToothValidator.calculateStatistics(data);
    } else {
      // Crear datos de muestra para demostración
      const sampleData = createSampleData();
      // Convertir datos de muestra al formato esperado por UniversalToothValidator
      const mockData = {
        teeth: {}
      };
      
      // Generar datos para todos los dientes
      [11, 12, 13, 14, 15, 16, 17, 18, 21, 22, 23, 24, 25, 26, 27, 28,
       31, 32, 33, 34, 35, 36, 37, 38, 41, 42, 43, 44, 45, 46, 47, 48].forEach(toothNumber => {
        const toothData = sampleData.getTooth(toothNumber);
        if (toothData && !toothData.absent) {
          mockData.teeth[toothNumber] = toothData;
        }
      });
      
      const result = UniversalToothValidator.calculateStatistics(mockData);
      if (ADVANCED_LOGGING_CONFIG.enabled) logger.log('📊 StatisticsPanel: Estadísticas de muestra calculadas:', result);
      return result;
    }
  }, [data, sampleDataVersion]);

  if (compact) {
    return (
      <div className="statistics-panel compact">
        <div className="stat-item">
          <span className="stat-value">{statistics.presentTeeth}/{statistics.totalTeeth}</span>
          <span className="stat-label">Dientes</span>
        </div>
        <div className="stat-item">
          <span className="stat-value">{statistics.bleedingPercentage}%</span>
          <span className="stat-label">Sangrado</span>
        </div>
        <div className="stat-item">
          <span className="stat-value">{statistics.plaquePercentage}%</span>
          <span className="stat-label">Placa</span>
        </div>
        <div className="stat-item">
          <span className="stat-value">{statistics.averageProbingDepth}mm</span>
          <span className="stat-label">Prof. PS</span>
        </div>
        <div className="stat-item">
          <span className="stat-value">{statistics.averageAttachmentLevel}mm</span>
          <span className="stat-label">Ins. NIC</span>
        </div>
      </div>
    );
  }

  return (
    <div className="statistics-panel">
      <h3 className="panel-title">Estadísticas del Periodontograma</h3>
      {!data && (
        <div>
          <div className="sample-data-indicator" style={{
            backgroundColor: '#e3f2fd',
            border: '1px solid #2196f3',
            borderRadius: '4px',
            padding: '8px 12px',
            margin: '10px 0',
            fontSize: '14px',
            color: '#1976d2'
          }}>
            <img src={stadisticsIcon} alt="" width="16" height="16" className="theme-icon" /> <strong>Fórmulas (6 sitios por diente = 2 caras × 3):</strong><br/>
            • %SS = (Sitios con sangrado / Sitios válidos de dientes presentes) × 100<br/>
            • %P = (Sitios con placa / Sitios válidos de dientes presentes) × 100<br/>
            • Media PS = ∑profundidades reales / # sitios válidos (≠999)<br/>
            • Media NIC = ∑(profundidad − margen) / # sitios válidos (≠999)<br/>
            <em><img src={checkCircle2Icon} alt="✓" width="14" height="14" className="theme-icon" /> Base: {statistics.presentTeeth} dientes presentes × 6 sitios</em>
          </div>
          <button 
            onClick={() => setSampleDataVersion(prev => prev + 1)}
            style={{
              backgroundColor: '#4caf50',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              padding: '8px 16px',
              fontSize: '14px',
              cursor: 'pointer',
              marginBottom: '10px'
            }}
          >
            🎲 Generar nuevos datos aleatorios
          </button>
        </div>
      )}
      
      <div className="statistics-grid">
        <div className="stat-card">
          <div className="stat-header">
            <h4>Dientes</h4>
          </div>
          <div className="stat-content">
            <div className="stat-main">
              <span className="stat-number">{statistics.presentTeeth}</span>
              <span className="stat-total">/ {statistics.totalTeeth}</span>
            </div>
            <div className="stat-description">Presentes</div>
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-header">
            <h4>Sangrado al Sondaje</h4>
          </div>
          <div className="stat-content">
            <div className="stat-main">
              <span className="stat-number">{statistics.bleedingPercentage}</span>
              <span className="stat-unit">%</span>
            </div>
            <div className="stat-description">
              {statistics.bleedingPercentage < 10 ? 'Excelente' :
               statistics.bleedingPercentage < 25 ? 'Bueno' :
               statistics.bleedingPercentage < 50 ? 'Regular' : 'Requiere atención'}
            </div>
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-header">
            <h4>Índice de Placa</h4>
          </div>
          <div className="stat-content">
            <div className="stat-main">
              <span className="stat-number">{statistics.plaquePercentage}</span>
              <span className="stat-unit">%</span>
            </div>
            <div className="stat-description">
              {statistics.plaquePercentage < 15 ? 'Excelente' :
               statistics.plaquePercentage < 30 ? 'Bueno' :
               statistics.plaquePercentage < 50 ? 'Regular' : 'Requiere mejora'}
            </div>
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-header">
            <h4>Media Profundidad PS</h4>
          </div>
          <div className="stat-content">
            <div className="stat-main">
              <span className="stat-number">{statistics.averageProbingDepth}</span>
              <span className="stat-unit">mm</span>
            </div>
            <div className="stat-description">
              {statistics.averageProbingDepth <= 3 ? 'Saludable' :
               statistics.averageProbingDepth <= 5 ? 'Gingivitis' :
               statistics.averageProbingDepth <= 7 ? 'Periodontitis moderada' : 'Periodontitis severa'}
            </div>
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-header">
            <h4>Media Inserción NIC</h4>
          </div>
          <div className="stat-content">
            <div className="stat-main">
              <span className="stat-number">{statistics.averageAttachmentLevel}</span>
              <span className="stat-unit">mm</span>
            </div>
            <div className="stat-description">
              {statistics.averageAttachmentLevel <= 3 ? 'Excelente' :
               statistics.averageAttachmentLevel <= 5 ? 'Bueno' :
               statistics.averageAttachmentLevel <= 7 ? 'Moderado' : 'Requiere atención'}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

StatisticsPanel.propTypes = {
  data: PropTypes.object,
  teeth: PropTypes.arrayOf(PropTypes.number),
  compact: PropTypes.bool
};



export default StatisticsPanel;