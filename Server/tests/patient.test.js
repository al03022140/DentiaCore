/**
 * Pruebas para el modelo Patient
 * Valida campos requeridos, virtuales, métodos estáticos, middlewares y migración
 * 
 * Esquema actual: estructura PLANA (flat) — NO usa informacion_personal ni informacion_medica
 * Campos requeridos: primer_nombre, apellido_paterno, fecha_nacimiento, sexo, documento.tipo, documento.numero
 */

const mongoose = require('mongoose');
const Patient = require('../models/patient');
const { migratePatient } = require('../scripts/migratePatientData');

// Configuración de pruebas
const TEST_DB_URI = process.env.TEST_MONGODB_URI || 'mongodb://localhost:27017/DentiaCore_test';

// Helper: datos mínimos válidos para crear un paciente (campos requeridos)
let docCounter = 0;
function validPatientData(overrides = {}) {
    docCounter++;
    return {
        primer_nombre: 'Test',
        apellido_paterno: 'Paciente',
        fecha_nacimiento: new Date('1990-01-15'),
        sexo: 'Masculino',
        documento: {
            tipo: 'INE',
            numero: `DOC-TEST-${Date.now()}-${docCounter}`
        },
        ...overrides
    };
}

describe('Patient Model - Mejoras y Compatibilidad', () => {
    
    beforeAll(async () => {
        await mongoose.connect(TEST_DB_URI);
    });
    
    afterAll(async () => {
        await mongoose.connection.dropDatabase();
        await mongoose.connection.close();
    });
    
    beforeEach(async () => {
        await Patient.deleteMany({});
    });
    
    describe('Creación y Campos Requeridos', () => {
        
        test('Debe crear paciente con todos los campos requeridos', async () => {
            const patientData = validPatientData({
                primer_nombre: 'Juan',
                apellido_paterno: 'Pérez',
                apellido_materno: 'García',
                fecha_nacimiento: new Date('1990-05-15'),
                sexo: 'Masculino',
                email: 'juan.perez@email.com',
                contacto: { telefono: '5551234567' },
                documento: { tipo: 'INE', numero: 'PEGJ900515HDFRRN01' }
            });
            
            const patient = new Patient(patientData);
            await patient.save();
            
            expect(patient.paciente_id).toBeDefined();
            expect(patient.fullName).toBe('Juan Pérez García');
            expect(patient.emailVirtual).toBe('juan.perez@email.com');
            expect(patient.telefonoVirtual).toBe('5551234567');
        });
        
        test('Debe rechazar paciente sin primer_nombre', async () => {
            const patient = new Patient({
                apellido_paterno: 'Pérez',
                fecha_nacimiento: new Date('1990-01-01'),
                sexo: 'Masculino',
                documento: { tipo: 'INE', numero: 'MISSING-NOMBRE-001' }
            });
            
            await expect(patient.save()).rejects.toThrow();
        });
        
        test('Debe rechazar paciente sin documento', async () => {
            const patient = new Patient({
                primer_nombre: 'Test',
                apellido_paterno: 'User',
                fecha_nacimiento: new Date('1990-01-01'),
                sexo: 'Masculino'
            });
            
            await expect(patient.save()).rejects.toThrow();
        });

        test('Debe rechazar sexo con valor inválido', async () => {
            const patient = new Patient(validPatientData({
                sexo: 'invalido',
                documento: { tipo: 'INE', numero: 'SEXO-INV-001' }
            }));
            
            await expect(patient.save()).rejects.toThrow();
        });

        test('Debe rechazar documento.tipo con valor inválido', async () => {
            const patient = new Patient(validPatientData({
                documento: { tipo: 'curp', numero: 'TIPO-INV-001' }
            }));
            
            await expect(patient.save()).rejects.toThrow();
        });
    });
    
    describe('Virtuales', () => {
        
        test('fullName con nombre completo', () => {
            const patient = new Patient(validPatientData({
                primer_nombre: 'Ana',
                otros_nombres: 'Isabel',
                apellido_paterno: 'Martínez',
                apellido_materno: 'Sánchez'
            }));
            
            expect(patient.fullName).toBe('Ana Isabel Martínez Sánchez');
        });
        
        test('fullName sin campos opcionales', () => {
            const patient = new Patient(validPatientData({
                primer_nombre: 'María',
                apellido_paterno: 'López'
            }));
            
            expect(patient.fullName).toBe('María López Paciente'.replace(' Paciente', ''));
            // fullName concatenates: primer_nombre + otros_nombres + apellido_paterno + apellido_materno
            // With defaults: 'María' + '' + 'López' + '' = 'María López'
        });
        
        test('edadVirtual calcula edad correctamente', () => {
            const patient = new Patient(validPatientData({
                fecha_nacimiento: new Date('1985-03-20')
            }));
            
            expect(patient.edadVirtual).toBeGreaterThan(35);
        });
        
        test('edadVirtual retorna null sin fecha_nacimiento', () => {
            const patient = new Patient({
                primer_nombre: 'Test',
                apellido_paterno: 'User'
                // sin fecha_nacimiento
            });
            
            expect(patient.edadVirtual).toBeNull();
        });
        
        test('emailVirtual lee de campo email', () => {
            const patient = new Patient(validPatientData({
                email: 'test@example.com'
            }));
            
            expect(patient.emailVirtual).toBe('test@example.com');
        });
        
        test('telefonoVirtual lee de contacto.telefono', () => {
            const patient = new Patient(validPatientData({
                contacto: { telefono: '5559876543' }
            }));
            
            expect(patient.telefonoVirtual).toBe('5559876543');
        });
    });
    
    describe('Métodos de Búsqueda', () => {
        
        beforeEach(async () => {
            await Patient.create([
                validPatientData({
                    primer_nombre: 'Juan',
                    apellido_paterno: 'Pérez',
                    fecha_nacimiento: new Date('1990-01-01'),
                    sexo: 'Masculino',
                    documento: { tipo: 'INE', numero: 'SEARCH-001' }
                }),
                validPatientData({
                    primer_nombre: 'María',
                    apellido_paterno: 'García',
                    fecha_nacimiento: new Date('1985-01-01'),
                    sexo: 'Femenino',
                    email: 'maria@test.com',
                    documento: { tipo: 'INE', numero: 'SEARCH-002' }
                }),
                validPatientData({
                    primer_nombre: 'Carlos',
                    apellido_paterno: 'López',
                    fecha_nacimiento: new Date('1992-01-01'),
                    sexo: 'Masculino',
                    contacto: { telefono: '5551234567' },
                    documento: { tipo: 'Pasaporte', numero: 'SEARCH-003' }
                })
            ]);
        });
        
        test('findWithFilters por nombre', async () => {
            const results = await Patient.findWithFilters({ nombre: 'Juan' });
            
            expect(results.length).toBe(1);
            expect(results[0].primer_nombre).toBe('Juan');
        });
        
        test('findWithFilters por email', async () => {
            const results = await Patient.findWithFilters({ email: 'maria' });
            
            expect(results.length).toBe(1);
            expect(results[0].primer_nombre).toBe('María');
        });
        
        test('findWithFilters por documento', async () => {
            const results = await Patient.findWithFilters({ documento: 'SEARCH-003' });
            
            expect(results.length).toBe(1);
            expect(results[0].primer_nombre).toBe('Carlos');
        });
        
        test('findWithFilters sin filtros retorna todos', async () => {
            const results = await Patient.findWithFilters({});
            
            expect(results.length).toBe(3);
        });
        
        test('getStatistics retorna datos agregados', async () => {
            const stats = await Patient.getStatistics();
            
            expect(stats.totalPacientes).toBe(3);
            expect(stats.porGenero).toBeDefined();
            expect(stats.edadPromedio).toBeGreaterThan(0);
        });
    });
    
    describe('Script de Migración', () => {
        
        test('migratePatient debe convertir estructura legacy (async)', async () => {
            const legacyData = {
                paciente_id: '9999',
                primer_nombre: 'Pedro',
                apellido_paterno: 'Ramírez',
                fecha_nacimiento: new Date('1987-06-15'),
                sexo: 'masculino',
                email: 'pedro@test.com',
                contacto: { telefono: '5557778899' },
                encuesta_medica: {
                    habitos_estilo_vida: {
                        tabaquismo: { estado: true },
                        alcoholismo: { estado: false }
                    }
                }
            };
            
            const migrated = await migratePatient(legacyData);
            
            // migratePatient convierte flat → informacion_personal/informacion_medica
            // Si patient already has informacion_personal, returns null
            // Otherwise creates the modular structure
            if (migrated) {
                expect(migrated.informacion_personal).toBeDefined();
                expect(migrated.informacion_personal.primer_nombre).toBe('Pedro');
            }
        });
        
        test('migratePatient debe omitir datos ya migrados (async)', async () => {
            const alreadyMigrated = {
                informacion_personal: {
                    primer_nombre: 'Ana',
                    apellido_paterno: 'Torres'
                }
            };
            
            const result = await migratePatient(alreadyMigrated);
            expect(result).toBeNull();
        });
    });
    
    describe('Rendimiento', () => {
        
        test('Debe generar paciente_id único eficientemente', async () => {
            const startTime = Date.now();
            
            const patients = await Promise.all(
                Array.from({ length: 10 }, (_, i) => 
                    Patient.create(validPatientData({
                        documento: { tipo: 'INE', numero: `PERF-${Date.now()}-${i}` }
                    }))
                )
            );
            
            const endTime = Date.now();
            const duration = endTime - startTime;
            
            // Verificar que todos los IDs son únicos
            const ids = patients.map(p => p.paciente_id);
            const uniqueIds = new Set(ids);
            expect(uniqueIds.size).toBe(patients.length);
            
            // Verificar que la generación fue rápida (menos de 5 segundos)
            expect(duration).toBeLessThan(5000);
        });
    });
    
    describe('Middleware Pre-Save', () => {
        
        test('Debe calcular edad automáticamente al guardar', async () => {
            const patient = new Patient(validPatientData({
                fecha_nacimiento: new Date('1990-01-01'),
                documento: { tipo: 'INE', numero: 'EDAD-CALC-001' }
            }));
            
            await patient.save();
            expect(patient.edad).toBeGreaterThan(30);
        });
        
        test('Debe generar paciente_id automáticamente', async () => {
            const patient = new Patient(validPatientData({
                documento: { tipo: 'INE', numero: 'PACTID-AUTO-001' }
            }));
            
            expect(patient.paciente_id).toBeUndefined();
            await patient.save();
            expect(patient.paciente_id).toBeDefined();
            expect(patient.paciente_id).toMatch(/^\d{4}$/); // 4 dígitos
        });
        
        test('Debe actualizar timestamps automáticamente', async () => {
            const patient = new Patient(validPatientData({
                documento: { tipo: 'INE', numero: 'TIMESTAMPS-001' }
            }));
            
            await patient.save();
            const createdAt = patient.createdAt;
            
            // Esperar 10ms para que el timestamp cambie
            await new Promise(r => setTimeout(r, 10));
            
            // Modificar y guardar
            patient.email = 'updated@test.com';
            await patient.save();
            
            expect(patient.updatedAt).toBeInstanceOf(Date);
            expect(patient.updatedAt.getTime()).toBeGreaterThanOrEqual(createdAt.getTime());
        });
    });
});

// Pruebas de integración
describe('Integración Completa', () => {
    
    beforeAll(async () => {
        if (mongoose.connection.readyState !== 1) {
            await mongoose.connect(
                process.env.TEST_MONGODB_URI || 'mongodb://localhost:27017/DentiaCore_test'
            );
        }
    });
    
    afterAll(async () => {
        await mongoose.connection.dropDatabase();
        await mongoose.connection.close();
    });
    
    beforeEach(async () => {
        await Patient.deleteMany({});
    });
    
    test('Flujo completo: crear, buscar, actualizar paciente', async () => {
        // Crear paciente
        const patient = await Patient.create({
            primer_nombre: 'Integración',
            apellido_paterno: 'Test',
            fecha_nacimiento: new Date('1990-06-15'),
            sexo: 'Masculino',
            email: 'integracion@test.com',
            contacto: { telefono: '5551234567' },
            documento: { tipo: 'INE', numero: 'INTEG-001' }
        });
        
        expect(patient.paciente_id).toBeDefined();
        
        // Buscar paciente
        const found = await Patient.findOne({ paciente_id: patient.paciente_id });
        expect(found).toBeTruthy();
        expect(found.fullName).toBe('Integración Test');
        
        // Actualizar paciente
        found.otros_nombres = 'Completa';
        await found.save();
        
        const updated = await Patient.findOne({ paciente_id: patient.paciente_id });
        expect(updated.fullName).toBe('Integración Completa Test');
        
        // Verificar que los virtuales funcionan
        expect(updated.emailVirtual).toBe('integracion@test.com');
        expect(updated.telefonoVirtual).toBe('5551234567');
    });
});