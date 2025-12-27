/**
 * Servidor de desarrollo simple para probar la actualización de estadísticas
 */

const express = require('express');
const path = require('path');
const app = express();
const PORT = 3001;

// Servir archivos estáticos
app.use(express.static(path.join(__dirname, 'public')));
app.use('/src', express.static(path.join(__dirname, 'src')));

// Ruta principal
app.get('/', (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html lang="es">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Prueba de Estadísticas del Periodontograma</title>
        <script src="https://unpkg.com/react@18/umd/react.development.js"></script>
        <script src="https://unpkg.com/react-dom@18/umd/react-dom.development.js"></script>
        <script src="https://unpkg.com/@babel/standalone/babel.min.js"></script>
    </head>
    <body>
        <div id="root"></div>
        
        <script type="text/babel">
            // Importar el componente de prueba
            const { useState, useMemo } = React;
            
            // Componente StatisticsPanel simplificado para la prueba
            const StatisticsPanel = ({ data, teeth = [] }) => {
              const statistics = useMemo(() => {
                console.log('🔄 Recalculando estadísticas...', { data, teeth });
                
                if (!data || !data.teeth) {
                  return {
                    totalTeeth: 0,
                    presentTeeth: 0,
                    bleedingPercentage: 0,
                    plaquePercentage: 0,
                    averageProbingDepth: 0
                  };
                }
                
                let totalTeeth = teeth.length;
                let presentTeeth = 0;
                let bleedingCount = 0;
                let plaqueCount = 0;
                let totalDepth = 0;
                let depthCount = 0;
                let totalSites = 0;
                
                teeth.forEach(toothNumber => {
                  const toothData = data.teeth[toothNumber];
                  if (toothData && toothData.available !== false) {
                    presentTeeth++;
                    
                    // Procesar cada zona del diente
                    Object.values(toothData.zones || {}).forEach(zone => {
                      totalSites++;
                      if (zone.bleeding) bleedingCount++;
                      if (zone.plaque) plaqueCount++;
                      if (zone.probingDepth) {
                        totalDepth += zone.probingDepth;
                        depthCount++;
                      }
                    });
                  }
                });
                
                return {
                  totalTeeth,
                  presentTeeth,
                  bleedingPercentage: totalSites > 0 ? Math.round((bleedingCount / totalSites) * 100) : 0,
                  plaquePercentage: totalSites > 0 ? Math.round((plaqueCount / totalSites) * 100) : 0,
                  averageProbingDepth: depthCount > 0 ? Math.round((totalDepth / depthCount) * 100) / 100 : 0
                };
              }, [data, teeth]);
              
              return (
                <div style={{ border: '1px solid #ccc', padding: '15px', borderRadius: '5px' }}>
                  <h3>📊 Estadísticas del Periodontograma</h3>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '10px' }}>
                    <div style={{ padding: '10px', backgroundColor: '#f8f9fa', borderRadius: '3px' }}>
                      <strong>Dientes:</strong> {statistics.presentTeeth}/{statistics.totalTeeth}
                    </div>
                    <div style={{ padding: '10px', backgroundColor: '#f8f9fa', borderRadius: '3px' }}>
                      <strong>Sangrado:</strong> {statistics.bleedingPercentage}%
                    </div>
                    <div style={{ padding: '10px', backgroundColor: '#f8f9fa', borderRadius: '3px' }}>
                      <strong>Placa:</strong> {statistics.plaquePercentage}%
                    </div>
                    <div style={{ padding: '10px', backgroundColor: '#f8f9fa', borderRadius: '3px' }}>
                      <strong>Prof. Promedio:</strong> {statistics.averageProbingDepth}mm
                    </div>
                  </div>
                </div>
              );
            };
            
            // Componente de prueba principal
            const TestApp = () => {
              const [testData, setTestData] = useState({
                teeth: {
                  11: {
                    available: true,
                    zones: {
                      mesial: { bleeding: false, plaque: false, probingDepth: 2 },
                      vestibular: { bleeding: false, plaque: false, probingDepth: 2 },
                      distal: { bleeding: false, plaque: false, probingDepth: 2 },
                      lingual: { bleeding: false, plaque: false, probingDepth: 2 }
                    }
                  },
                  21: {
                    available: true,
                    zones: {
                      mesial: { bleeding: false, plaque: false, probingDepth: 3 },
                      vestibular: { bleeding: false, plaque: false, probingDepth: 3 },
                      distal: { bleeding: false, plaque: false, probingDepth: 3 },
                      lingual: { bleeding: false, plaque: false, probingDepth: 3 }
                    }
                  }
                }
              });
              
              const toggleBleeding = (toothNumber, zone) => {
                setTestData(prevData => {
                  const newData = JSON.parse(JSON.stringify(prevData)); // Deep clone
                  newData.teeth[toothNumber].zones[zone].bleeding = !newData.teeth[toothNumber].zones[zone].bleeding;
                  console.log('🔄 Datos actualizados:', newData);
                  return newData;
                });
              };
              
              const togglePlaque = (toothNumber, zone) => {
                setTestData(prevData => {
                  const newData = JSON.parse(JSON.stringify(prevData)); // Deep clone
                  newData.teeth[toothNumber].zones[zone].plaque = !newData.teeth[toothNumber].zones[zone].plaque;
                  console.log('🔄 Datos actualizados:', newData);
                  return newData;
                });
              };
              
              const increaseProbingDepth = (toothNumber, zone) => {
                setTestData(prevData => {
                  const newData = JSON.parse(JSON.stringify(prevData)); // Deep clone
                  const currentDepth = newData.teeth[toothNumber].zones[zone].probingDepth || 0;
                  newData.teeth[toothNumber].zones[zone].probingDepth = currentDepth >= 12 ? 0 : currentDepth + 1;
                  console.log('🔄 Datos actualizados:', newData);
                  return newData;
                });
              };
              
              return (
                <div style={{ padding: '20px', fontFamily: 'Arial, sans-serif' }}>
                  <h1>🧪 Prueba de Actualización de Estadísticas del Periodontograma</h1>
                  
                  <div style={{ marginBottom: '20px', padding: '15px', border: '1px solid #007bff', borderRadius: '5px' }}>
                    <h2>Controles de Prueba</h2>
                    
                    <div style={{ marginBottom: '15px' }}>
                      <h3>Diente 11:</h3>
                      <button onClick={() => toggleBleeding(11, 'vestibular')} style={{ margin: '5px', padding: '8px' }}>
                        Toggle Sangrado Vestibular ({testData.teeth[11].zones.vestibular.bleeding ? 'SÍ' : 'NO'})
                      </button>
                      <button onClick={() => togglePlaque(11, 'mesial')} style={{ margin: '5px', padding: '8px' }}>
                        Toggle Placa Mesial ({testData.teeth[11].zones.mesial.plaque ? 'SÍ' : 'NO'})
                      </button>
                      <button onClick={() => increaseProbingDepth(11, 'distal')} style={{ margin: '5px', padding: '8px' }}>
                        Aumentar Prof. Distal ({testData.teeth[11].zones.distal.probingDepth}mm)
                      </button>
                    </div>
                    
                    <div style={{ marginBottom: '15px' }}>
                      <h3>Diente 21:</h3>
                      <button onClick={() => toggleBleeding(21, 'lingual')} style={{ margin: '5px', padding: '8px' }}>
                        Toggle Sangrado Lingual ({testData.teeth[21].zones.lingual.bleeding ? 'SÍ' : 'NO'})
                      </button>
                      <button onClick={() => togglePlaque(21, 'vestibular')} style={{ margin: '5px', padding: '8px' }}>
                        Toggle Placa Vestibular ({testData.teeth[21].zones.vestibular.plaque ? 'SÍ' : 'NO'})
                      </button>
                      <button onClick={() => increaseProbingDepth(21, 'mesial')} style={{ margin: '5px', padding: '8px' }}>
                        Aumentar Prof. Mesial ({testData.teeth[21].zones.mesial.probingDepth}mm)
                      </button>
                    </div>
                  </div>
                  
                  <StatisticsPanel data={testData} teeth={[11, 21]} />
                  
                  <div style={{ marginTop: '20px', padding: '10px', backgroundColor: '#f8f9fa', borderRadius: '5px' }}>
                    <h3>📋 Datos Actuales:</h3>
                    <pre style={{ fontSize: '12px', overflow: 'auto', maxHeight: '300px' }}>
                      {JSON.stringify(testData, null, 2)}
                    </pre>
                  </div>
                </div>
              );
            };
            
            // Renderizar la aplicación
            ReactDOM.render(<TestApp />, document.getElementById('root'));
        </script>
    </body>
    </html>
  `);
});

app.listen(PORT, () => {
  console.log(`🚀 Servidor de prueba ejecutándose en http://localhost:${PORT}`);
  console.log('📊 Prueba la actualización de estadísticas del periodontograma');
});