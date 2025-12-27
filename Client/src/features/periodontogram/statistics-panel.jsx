/**
 * Panel de estadísticas simplificado para el periodontograma
 * Versión temporal sin dependencias complejas
 */

import React, { useMemo, useState, useEffect, useRef } from 'react';
import PropTypes from 'prop-types';
import { getToothData } from "./utils/periodontogram-utils";
import { UniversalToothValidator } from "../../shared/validators/universal-tooth-validator";
import './styles/statistics-panel.css';

const StatisticsPanel = ({
  data = null,
  teeth = [],
  showDetailed = true,
  compact = false
}) => {
  const [sampleDataVersion, setSampleDataVersion] = useState(0);
  const [forceUpdate, setForceUpdate] = useState(0);
  const debounceRef = useRef(null);
  
  // Forzar actualización cuando cambien los datos
  useEffect(() => {
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }
    debounceRef.current = setTimeout(() => {
      setForceUpdate(prev => prev + 1);
    }, 150);
    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
        debounceRef.current = null;
      }
    };
  }, [data?.teeth, data?.selectedTooth, data?.lastModified, data?.updatedAt, data?.statistics]);
  
  // Crear una clave única basada en los datos para forzar recálculo
  const dataKey = useMemo(() => {
    if (!data?.teeth) return `no-data-${sampleDataVersion}`;
    
    // Crear un hash más eficiente de los datos
    const teethKeys = Object.keys(data.teeth).sort();
    const teethCount = teethKeys.length;
    
    // Calcular un hash simple de los datos relevantes para estadísticas
    let dataHash = 0;
    teethKeys.forEach(toothNumber => {
      const tooth = data.teeth[toothNumber];
      if (tooth) {
        // Hash de datos relevantes para estadísticas
        const relevantData = {
          absent: tooth.absent,
          bleeding: tooth.bleeding,
          plaque: tooth.plaque,
          probingDepth: tooth.probingDepth,
          gingivalMargin: tooth.gingivalMargin
        };
        const dataStr = JSON.stringify(relevantData);
        for (let i = 0; i < dataStr.length; i++) {
          dataHash = ((dataHash << 5) - dataHash + dataStr.charCodeAt(i)) & 0xffffffff;
        }
      }
    });
    
    const selectedTooth = data.selectedTooth || 'none';
    const timestamp = data.lastModified || data.updatedAt || Date.now();
    const statisticsHash = data.statistics ? JSON.stringify(data.statistics).length : 0;
    
    return `${teethCount}-${dataHash}-${selectedTooth}-${timestamp}-${statisticsHash}-${sampleDataVersion}-${forceUpdate}`;
   }, [data?.teeth, data?.selectedTooth, data?.lastModified, data?.updatedAt, data?.statistics, sampleDataVersion, forceUpdate]);
  
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
    
    if (ADVANCED_LOGGING_CONFIG.enabled) console.log('🔄 StatisticsPanel: Estadísticas normalizadas:', {
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
    if (ADVANCED_LOGGING_CONFIG.enabled) console.log('🔄 StatisticsPanel: Recalculando estadísticas...', {
      hasData: !!data,
      dataKey,
      sampleDataVersion,
      teethCount: data?.teeth ? Object.keys(data.teeth).length : 0,
      hasPreCalculatedStats: !!data?.statistics
    });
    
    if (data) {
      // Verificar si tenemos estadísticas pre-calculadas y si no son todas 0
      if (data.statistics && !areStatisticsAllZero(data.statistics)) {
        if (ADVANCED_LOGGING_CONFIG.enabled) console.log('📊 StatisticsPanel: Usando estadísticas pre-calculadas válidas:', data.statistics);
        if (ADVANCED_LOGGING_CONFIG.enabled) console.log('🔍 StatisticsPanel: Datos completos recibidos:', {
          hasTeeth: !!data.teeth,
          teethCount: data.teeth ? Object.keys(data.teeth).length : 0,
          firstTooth: data.teeth ? Object.keys(data.teeth)[0] : null,
          sampleToothData: data.teeth ? data.teeth[Object.keys(data.teeth)[0]] : null,
          statistics: data.statistics
        });
        const normalized = normalizeStatistics(data.statistics);
        return normalized;
      }
      
      // Si las estadísticas pre-calculadas son todas 0 o no existen, calcular usando UniversalToothValidator
      if (ADVANCED_LOGGING_CONFIG.enabled) console.log('⚠️ StatisticsPanel: Estadísticas pre-calculadas son 0 o inexistentes, recalculando...');
      
      // Debug: Verificar datos de algunos dientes para entender por qué las estadísticas son 0
      if (ADVANCED_LOGGING_CONFIG.enabled) console.log('🔍 StatisticsPanel: Verificando datos de dientes para debug:', {
        totalTeeth: data?.teeth ? Object.keys(data.teeth).length : 0,
        firstFewTeeth: data?.teeth ? Object.keys(data.teeth).slice(0, 3).map(toothNum => ({
          toothNumber: toothNum,
          absent: data.teeth[toothNum]?.absent,
          hasBleedingData: !!(data.teeth[toothNum]?.bleeding),
          hasPlaqueData: !!(data.teeth[toothNum]?.plaque),
          hasProbingDepthData: !!(data.teeth[toothNum]?.probingDepth),
          bleedingStructure: data.teeth[toothNum]?.bleeding,
          plaqueStructure: data.teeth[toothNum]?.plaque,
          probingDepthStructure: data.teeth[toothNum]?.probingDepth,
          fullData: data.teeth[toothNum]
        })) : [],
        sampleToothData: data?.teeth && Object.keys(data.teeth)[0] ? {
          toothNumber: Object.keys(data.teeth)[0],
          fullData: data.teeth[Object.keys(data.teeth)[0]]
        } : null
      });
      
      const result = UniversalToothValidator.calculateStatistics(data);
      if (ADVANCED_LOGGING_CONFIG.enabled) console.log('📊 StatisticsPanel: Estadísticas recalculadas:', result);
      return result;
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
      if (ADVANCED_LOGGING_CONFIG.enabled) console.log('📊 StatisticsPanel: Estadísticas de muestra calculadas:', result);
      return result;
    }
  }, [data, sampleDataVersion, dataKey, forceUpdate]);

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
            📊 <strong>Fórmulas con 96 sitios (32×3):</strong><br/>
            • %SS = (Sitios con sangrado / Sitios válidos de dientes presentes) × 100<br/>
            • %P = (Sitios con placa / Sitios válidos de dientes presentes) × 100<br/>
            • Media PS = ∑profundidades reales / # sitios válidos (≠999)<br/>
            • Media NIC = ∑(profundidad + margen) / # sitios válidos (≠999)<br/>
            <em>✅ Base: 96 sitios totales, ajustado por {statistics.presentTeeth} dientes presentes</em>
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
  showDetailed: PropTypes.bool,
  compact: PropTypes.bool
};



export default StatisticsPanel;
import { ADVANCED_LOGGING_CONFIG } from './utils/config.js';