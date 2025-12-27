Datos transformados a 4 caras y validados: {pacienteId: '688a5c4ad5a7a538cb2c460d', teeth: {…}, statistics: {…}, version: '20250912T235822663Z', fechaCreacion: '2025-09-12T23:58:22.663Z', …}
universal-tooth-validator.js:133 [2025-09-12T23:58:22.664Z] VALIDATION: Estadísticas calculadas exitosamente según especificaciones SEPA {presentTeeth: 5, totalCasillasPosibles: 30, bleedingCount: 0, bleedingPercentage: 0}
periodontogram-service.js:213 💾 Guardando datos JSON del periodontograma: {patientId: '688a5c4ad5a7a538cb2c460d', versionName: '20250912T235822663Z'}
periodontogram-section.jsx:12 🚀 PeriodontogramSection montado con patientId: 688a5c4ad5a7a538cb2c460d
periodontogram-section.jsx:12 🚀 PeriodontogramSection montado con patientId: 688a5c4ad5a7a538cb2c460d
axios-instance.js:18 Starting Request: PUT /patients/688a5c4ad5a7a538cb2c460d/periodontogram/data
axios-instance.js:26 Response: 201 /patients/688a5c4ad5a7a538cb2c460d/periodontogram/data
periodontogram-service.js:226 ✅ Datos JSON guardados exitosamente
periodontogram-service.js:273 📚 Obteniendo lista de versiones JSON del periodontograma: 688a5c4ad5a7a538cb2c460d
axios-instance.js:18 Starting Request: GET /patients/688a5c4ad5a7a538cb2c460d/periodontogram/data?listVersions=true
axios-instance.js:26 Response: 200 /patients/688a5c4ad5a7a538cb2c460d/periodontogram/data?listVersions=true
periodontogram-service.js:282 ✅ Lista de versiones obtenida exitosamente
periodontogram-section.jsx:523 ✅ Periodontograma guardado exitosamente
periodontogram-section.jsx:12 🚀 PeriodontogramSection montado con patientId: 688a5c4ad5a7a538cb2c460d
periodontogram-section.jsx:12 🚀 PeriodontogramSection montado con patientId: 688a5c4ad5a7a538cb2c460d  

] 🔍 DEBUG validatePatientIdAsId:
[2]   - req.params: { id: '688a5c4ad5a7a538cb2c460d' }
[2]   - req.params.id: 688a5c4ad5a7a538cb2c460d
[2]   - value: 688a5c4ad5a7a538cb2c460d
[2]   - req.url: /data
[2]   - req.originalUrl: /api/patients/688a5c4ad5a7a538cb2c460d/periodontogram/data
[2] 🔍 DEBUG checkValidationErrors:
[2]   - req.params: { id: '688a5c4ad5a7a538cb2c460d' }
[2]   - req.body: {
[2]   teeth: {
[2]     '15': {
[2]       numeroDiente: '15',
[2]       arcada: 'superior',
[2]       ausente: false,
[2]       implante: false,
[2]       vestibular: [Object],
[2]       palatino: [Object],
[2]       movilidad: 0,
[2]       anchuraEncia: 3,
[2]       furca: [Object],
[2]       pronostico: 'Bueno',
[2]       fechaUltimaModificacion: null
[2]     },
[2]     '16': {
[2]       numeroDiente: '16',
[2]       arcada: 'superior',
[2]       ausente: false,
[2]       implante: false,
[2]       vestibular: [Object],
[2]       palatino: [Object],
[2]       movilidad: 0,
[2]       anchuraEncia: 3,
[2]       furca: [Object],
[2]       pronostico: 'Bueno',
[2]       fechaUltimaModificacion: null
[2]     },
[2]     '17': {
[2]       numeroDiente: '17',
[2]       arcada: 'superior',
[2]       ausente: false,
[2]       implante: false,
[2]       vestibular: [Object],
[2]       palatino: [Object],
[2]       movilidad: 0,
[2]       anchuraEncia: 3,
[2]       furca: [Object],
[2]       pronostico: 'Bueno',
[2]       fechaUltimaModificacion: null
[2]     },
[2]     '18': {
[2]       numeroDiente: '18',
[2]       arcada: 'superior',
[2]       ausente: false,
[2]       implante: false,
[2]       vestibular: [Object],
[2]       palatino: [Object],
[2]       movilidad: 0,
[2]       anchuraEncia: 3,
[2]       furca: [Object],
[2]       pronostico: 'Bueno',
[2]       fechaUltimaModificacion: null
[2]     },
[2]     '48': {
[2]       numeroDiente: '48',
[2]       arcada: 'superior',
[2]       ausente: false,
[2]       implante: false,
[2]       vestibular: [Object],
[2]       palatino: [Object],
[2]       movilidad: 0,
[2]       anchuraEncia: 3,
[2]       furca: [Object],
[2]       pronostico: 'Bueno',
[2]       fechaUltimaModificacion: null
[2]     }
[2]   },
[2]   statistics: {
[2]     totalTeeth: 32,
[2]     presentTeeth: 5,
[2]     absentTeeth: 27,
[2]     bleedingPercentage: 0,
[2]     plaquePercentage: 0,
[2]     averageProbingDepth: 0,
[2]     averageAttachmentLevel: 0,
[2]     lastCalculated: '2025-09-12T23:58:22.664Z'
[2]   },
[2]   versionName: '20250912T235822663Z'
[2] }
[2]   - req.url: /data
[2]   - validation errors: []
[2] ✅ Validation passed, calling next()
[2] 📋 Validando datos con esquema unificado: {
[2]   teeth: {
[2]     '15': {
[2]       numeroDiente: '15',
[2]       arcada: 'superior',
[2]       ausente: false,
[2]       implante: false,
[2]       vestibular: [Object],
[2]       palatino: [Object],
[2]       movilidad: 0,
[2]       anchuraEncia: 3,
[2]       furca: [Object],
[2]       pronostico: 'Bueno',
[2]       fechaUltimaModificacion: null
[2]     },
[2]     '16': {
[2]       numeroDiente: '16',
[2]       arcada: 'superior',
[2]       ausente: false,
[2]       implante: false,
[2]       vestibular: [Object],
[2]       palatino: [Object],
[2]       movilidad: 0,
[2]       anchuraEncia: 3,
[2]       furca: [Object],
[2]       pronostico: 'Bueno',
[2]       fechaUltimaModificacion: null
[2]     },
[2]     '17': {
[2]       numeroDiente: '17',
[2]       arcada: 'superior',
[2]       ausente: false,
[2]       implante: false,
[2]       vestibular: [Object],
[2]       palatino: [Object],
[2]       movilidad: 0,
[2]       anchuraEncia: 3,
[2]       furca: [Object],
[2]       pronostico: 'Bueno',
[2]       fechaUltimaModificacion: null
[2]     },
[2]     '18': {
[2]       numeroDiente: '18',
[2]       arcada: 'superior',
[2]       ausente: false,
[2]       implante: false,
[2]       vestibular: [Object],
[2]       palatino: [Object],
[2]       movilidad: 0,
[2]       anchuraEncia: 3,
[2]       furca: [Object],
[2]       pronostico: 'Bueno',
[2]       fechaUltimaModificacion: null
[2]     },
[2]     '48': {
[2]       numeroDiente: '48',
[2]       arcada: 'superior',
[2]       ausente: false,
[2]       implante: false,
[2]       vestibular: [Object],
[2]       palatino: [Object],
[2]       movilidad: 0,
[2]       anchuraEncia: 3,
[2]       furca: [Object],
[2]       pronostico: 'Bueno',
[2]       fechaUltimaModificacion: null
[2]     }
[2]   },
[2]   statistics: {
[2]     totalTeeth: 32,
[2]     presentTeeth: 5,
[2]     absentTeeth: 27,
[2]     bleedingPercentage: 0,
[2]     plaquePercentage: 0,
[2]     averageProbingDepth: 0,
[2]     averageAttachmentLevel: 0,
[2]     lastCalculated: '2025-09-12T23:58:22.664Z'
[2]   },
[2]   versionName: '20250912T235822663Z'
[2] }
[2] Valor de enum inválido: Bueno
[2] Valor de enum inválido: Bueno
[2] Valor de enum inválido: Bueno
[2] Valor de enum inválido: Bueno
[2] Valor de enum inválido: Bueno
[2] ✅ Datos validados correctamente: {
[2]   pacienteId: '688a5c4ad5a7a538cb2c460d',
[2]   teeth: {
[2]     '15': {
[2]       numeroDiente: 15,
[2]       arcada: 'superior',
[2]       ausente: false,
[2]       implante: false,
[2]       vestibularSuperior: [Object],
[2]       palatinoSuperior: [Object],
[2]       vestibularInferior: [Object],
[2]       lingualInferior: [Object],
[2]       movilidad: 0,
[2]       anchuraEncia: 3,
[2]       furca: [Object],
[2]       pronostico: 'Bueno',
[2]       fechaUltimaModificacion: 2025-09-12T23:58:22.723Z
[2]     },
[2]     '16': {
[2]       numeroDiente: 16,
[2]       arcada: 'superior',
[2]       ausente: false,
[2]       implante: false,
[2]       vestibularSuperior: [Object],
[2]       palatinoSuperior: [Object],
[2]       vestibularInferior: [Object],
[2]       lingualInferior: [Object],
[2]       movilidad: 0,
[2]       anchuraEncia: 3,
[2]       furca: [Object],
[2]       pronostico: 'Bueno',
[2]       fechaUltimaModificacion: 2025-09-12T23:58:22.723Z
[2]     },
[2]     '17': {
[2]       numeroDiente: 17,
[2]       arcada: 'superior',
[2]       ausente: false,
[2]       implante: false,
[2]       vestibularSuperior: [Object],
[2]       palatinoSuperior: [Object],
[2]       vestibularInferior: [Object],
[2]       lingualInferior: [Object],
[2]       movilidad: 0,
[2]       anchuraEncia: 3,
[2]       furca: [Object],
[2]       pronostico: 'Bueno',
[2]       fechaUltimaModificacion: 2025-09-12T23:58:22.723Z
[2]     },
[2]     '18': {
[2]       numeroDiente: 18,
[2]       arcada: 'superior',
[2]       ausente: false,
[2]       implante: false,
[2]       vestibularSuperior: [Object],
[2]       palatinoSuperior: [Object],
[2]       vestibularInferior: [Object],
[2]       lingualInferior: [Object],
[2]       movilidad: 0,
[2]       anchuraEncia: 3,
[2]       furca: [Object],
[2]       pronostico: 'Bueno',
[2]       fechaUltimaModificacion: 2025-09-12T23:58:22.724Z
[2]     },
[2]     '48': {
[2]       numeroDiente: 48,
[2]       arcada: 'superior',
[2]       ausente: false,
[2]       implante: false,
[2]       vestibularSuperior: [Object],
[2]       palatinoSuperior: [Object],
[2]       vestibularInferior: [Object],
[2]       lingualInferior: [Object],
[2]       movilidad: 0,
[2]       anchuraEncia: 3,
[2]       furca: [Object],
[2]       pronostico: 'Bueno',
[2]       fechaUltimaModificacion: 2025-09-12T23:58:22.724Z
[2]     }
[2]   },
[2]   statistics: {
[2]     totalTeeth: 32,
[2]     presentTeeth: 5,
[2]     absentTeeth: 27,
[2]     bleedingPercentage: 0,
[2]     plaquePercentage: 0,
[2]     averageProbingDepth: 0,
[2]     averageAttachmentLevel: 0,
[2]     lastCalculated: '2025-09-12T23:58:22.664Z'
[2]   },
[2]   version: '20250912T235822663Z',
[2]   fechaCreacion: 2025-09-12T23:58:22.720Z,
[2]   fechaModificacion: 2025-09-12T23:58:22.720Z
[2] }
[2] 📁 Directorio creado: C:\Users\arley\OneDrive\Documentos\DENT -1.1  REVISION\DENT -1.1\server\uploads\pacientes\688a5c4ad5a7a538cb2c460d\periodontograma\versiones
[2] PUT /api/patients/688a5c4ad5a7a538cb2c460d/periodontogram/data 201 35.788 ms - 107
[2] 🔍 Checking Content-Type: undefined
[2] 📝 Applying urlencoded middleware
[2] 🔍 DEBUG: checkPatient middleware
[2]   - req.params.id: 688a5c4ad5a7a538cb2c460d
[2]   - req.url: /periodontogram/data?listVersions=true
[2]   - req.originalUrl: /api/patients/688a5c4ad5a7a538cb2c460d/periodontogram/data?listVersions=true
[2]   - patient found: true
[2]   - checkPatient: SUCCESS, proceeding to next middleware
[2] 🔍 DEBUG: checkPatient middleware
[2]   - req.params.id: 688a5c4ad5a7a538cb2c460d
[2]   - req.url: /data?listVersions=true
[2]   - req.originalUrl: /api/patients/688a5c4ad5a7a538cb2c460d/periodontogram/data?listVersions=true
[2]   - patient found: true
[2]   - checkPatient: SUCCESS, proceeding to next middleware
[2] 🔍 DEBUG validatePatientIdAsId:
[2]   - req.params: { id: '688a5c4ad5a7a538cb2c460d' }
[2]   - req.params.id: 688a5c4ad5a7a538cb2c460d
[2]   - value: 688a5c4ad5a7a538cb2c460d
[2]   - req.url: /data?listVersions=true
[2]   - req.originalUrl: /api/patients/688a5c4ad5a7a538cb2c460d/periodontogram/data?listVersions=true
[2] [nodemon] restarting due to changes...
[2] 🔍 DEBUG checkValidationErrors:
[2]   - req.params: { id: '688a5c4ad5a7a538cb2c460d' }
[2]   - req.body: {}
[2]   - req.url: /data?listVersions=true
[2]   - validation errors: []
[2] ✅ Validation passed, calling next()
[2] GET /api/patients/688a5c4ad5a7a538cb2c460d/periodontogram/data?listVersions=true 200 17.897 ms - 73
[2] [nodemon] starting `node server/scripts/dent.js`
[2] 🔍 DEBUG: Cargando googleRoutes.js
[2] 🔍 DEBUG: Registrando rutas de Google...
[2] 🔍 DEBUG: Configurando rutas principales
[2]   - Montando /patients
[2]   - Montando /periodontograms
[2] 🔍 DEBUG: Montando rutas de Google en /api/google
[2] ✅ DEBUG: Rutas de Google montadas correctamente
[2] 🔄 Intentando conectar a MongoDB...
[2] 🔥 Servidor corriendo en http://localhost:5002
[2] ✅ Conectado a MongoDB con timeouts configurados
[2] 🔍 Checking Content-Type: undefined
[2] 📝 Applying urlencoded middleware
[2] 🔍 DEBUG: checkPatient middleware
[2]   - req.params.id: 688a5c4ad5a7a538cb2c460d
[2]   - req.url: /periodontogram/data?version=20250912T235822663Z
[2]   - req.originalUrl: /api/patients/688a5c4ad5a7a538cb2c460d/periodontogram/data?version=20250912T235822663Z
[2]   - patient found: true
[2]   - checkPatient: SUCCESS, proceeding to next middleware
[2] 🔍 DEBUG: checkPatient middleware
[2]   - req.params.id: 688a5c4ad5a7a538cb2c460d
[2]   - req.url: /data?version=20250912T235822663Z
[2]   - req.originalUrl: /api/patients/688a5c4ad5a7a538cb2c460d/periodontogram/data?version=20250912T235822663Z
[2]   - patient found: true
[2]   - checkPatient: SUCCESS, proceeding to next middleware
[2] 🔍 DEBUG validatePatientIdAsId:
[2]   - req.params: { id: '688a5c4ad5a7a538cb2c460d' }
[2]   - req.params.id: 688a5c4ad5a7a538cb2c460d
[2]   - value: 688a5c4ad5a7a538cb2c460d
[2]   - req.url: /data?version=20250912T235822663Z
[2]   - req.originalUrl: /api/patients/688a5c4ad5a7a538cb2c460d/periodontogram/data?version=20250912T235822663Z
[2] 🔍 DEBUG checkValidationErrors:
[2]   - req.params: { id: '688a5c4ad5a7a538cb2c460d' }
[2]   - req.body: {}
[2]   - req.url: /data?version=20250912T235822663Z
[2]   - validation errors: []
[2] ✅ Validation passed, calling next()
[2] GET /api/patients/688a5c4ad5a7a538cb2c460d/periodontogram/data?version=20250912T235822663Z 200 52.833 ms - 4380
[2] 🔍 Checking Content-Type: undefined
[2] 📝 Applying urlencoded middleware
[2] 🔍 DEBUG: checkPatient middleware
[2]   - req.params.id: 688a5c4ad5a7a538cb2c460d
[2]   - req.url: /periodontogram/data?version=20250903T181231547Z
[2]   - req.originalUrl: /api/patients/688a5c4ad5a7a538cb2c460d/periodontogram/data?version=20250903T181231547Z
[2]   - patient found: true
[2]   - checkPatient: SUCCESS, proceeding to next middleware
[2] 🔍 DEBUG: checkPatient middleware
[2]   - req.params.id: 688a5c4ad5a7a538cb2c460d
[2]   - req.url: /data?version=20250903T181231547Z
[2]   - req.originalUrl: /api/patients/688a5c4ad5a7a538cb2c460d/periodontogram/data?version=20250903T181231547Z
[2]   - patient found: true
[2]   - checkPatient: SUCCESS, proceeding to next middleware
[2] 🔍 DEBUG validatePatientIdAsId:
[2]   - req.params: { id: '688a5c4ad5a7a538cb2c460d' }
[2]   - req.params.id: 688a5c4ad5a7a538cb2c460d
[2]   - value: 688a5c4ad5a7a538cb2c460d
[2]   - req.url: /data?version=20250903T181231547Z
[2]   - req.originalUrl: /api/patients/688a5c4ad5a7a538cb2c460d/periodontogram/data?version=20250903T181231547Z
[2] 🔍 DEBUG checkValidationErrors:
[2]   - req.params: { id: '688a5c4ad5a7a538cb2c460d' }
[2]   - req.body: {}
[2]   - req.url: /data?version=20250903T181231547Z
[2]   - validation errors: []
[2] ✅ Validation passed, calling next()
[2] GET /api/patients/688a5c4ad5a7a538cb2c460d/periodontogram/data?version=20250903T181231547Z 200 19.723 ms - 2828
[2] 🔍 Checking Content-Type: undefined
[2] 📝 Applying urlencoded middleware
[2] 🔍 DEBUG: checkPatient middleware
[2]   - req.params.id: 688a5c4ad5a7a538cb2c460d
[2]   - req.url: /periodontogram/data?version=20250912T235822663Z
[2]   - req.originalUrl: /api/patients/688a5c4ad5a7a538cb2c460d/periodontogram/data?version=20250912T235822663Z
[2]   - patient found: true
[2]   - checkPatient: SUCCESS, proceeding to next middleware
[2] 🔍 DEBUG: checkPatient middleware
[2]   - req.params.id: 688a5c4ad5a7a538cb2c460d
[2]   - req.url: /data?version=20250912T235822663Z
[2]   - req.originalUrl: /api/patients/688a5c4ad5a7a538cb2c460d/periodontogram/data?version=20250912T235822663Z
[2]   - patient found: true
[2]   - checkPatient: SUCCESS, proceeding to next middleware
[2] 🔍 DEBUG validatePatientIdAsId:
[2]   - req.params: { id: '688a5c4ad5a7a538cb2c460d' }
[2]   - req.params.id: 688a5c4ad5a7a538cb2c460d
[2]   - value: 688a5c4ad5a7a538cb2c460d
[2]   - req.url: /data?version=20250912T235822663Z
[2]   - req.originalUrl: /api/patients/688a5c4ad5a7a538cb2c460d/periodontogram/data?version=20250912T235822663Z
[2] 🔍 DEBUG checkValidationErrors:
[2]   - req.params: { id: '688a5c4ad5a7a538cb2c460d' }
[2]   - req.body: {}
[2]   - req.url: /data?version=20250912T235822663Z
[2]   - validation errors: []
[2] ✅ Validation passed, calling next()
[2] GET /api/patients/688a5c4ad5a7a538cb2c460d/periodontogram/data?version=20250912T235822663Z 200 24.116 ms - 4380
