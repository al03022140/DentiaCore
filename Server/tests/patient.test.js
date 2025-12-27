/**
 * Pruebas para el modelo Patient mejorado
 * Valida compatibilidad, nuevas funcionalidades y migración
 */

const mongoose = require('mongoose');
const Patient = require('../models/patient');
const { migratePatient } = require('../scripts/migratePatientData');

// Configuración de pruebas
const TEST_DB_URI = process.env.TEST_MONGODB_URI || 'mongodb://localhost:27017/dental_clinic_test';

describe('Patient Model - Mejoras y Compatibilidad', () => {
    
    beforeAll(async () => {
        await mongoose.connect(TEST_DB_URI, {
            useNewUrlParser: true,
            useUnifiedTopology: true
        });
    });
    
    afterAll(async () => {
        await mongoose.connection.dropDatabase();
        await mongoose.connection.close();
    });
    
    beforeEach(async () => {
        await Patient.deleteMany({});
    });
    
    describe('🔄 Compatibilidad con Estructura Anterior', () => {
        
        test('Debe crear paciente con estructura legacy', async () => {
            const legacyPatient = {
                primer_nombre: 'Juan',
                apellido_paterno: 'Pérez',
                apellido_materno: 'García',
                fecha_nacimiento: new Date('1990-05-15'),
                sexo: 'masculino',
                email: 'juan.perez@email.com',
                telefono: '5551234567',
                documento: {
                    tipo: 'ine',
                    numero: 'PEGJ900515HDFRRN01'
                },
                encuesta_medica: {
                    medicamentos_actuales: 'Ninguno',
                    alergias: 'Polen',
                    fuma: false,
                    alcohol: 'ocasional'
                }
            };
            
            const patient = new Patient(legacyPatient);
            await patient.save();
            
            expect(patient.paciente_id).toBeDefined();
            expect(patient.fullName).toBe('Juan Pérez García');
            expect(patient.emailVirtual).toBe('juan.perez@email.com');
            expect(patient.telefonoVirtual).toBe('5551234567');
        });
        
        test('Virtuales deben funcionar con estructura legacy', async () => {
            const patient = new Patient({
                primer_nombre: 'María',
                apellido_paterno: 'López',
                fecha_nacimiento: new Date('1985-03-20'),
                email: 'maria@test.com',
                telefono: '5559876543'
            });
            
            expect(patient.fullName).toBe('María López');
            expect(patient.edadVirtual).toBeGreaterThan(35);
            expect(patient.emailVirtual).toBe('maria@test.com');
            expect(patient.telefonoVirtual).toBe('5559876543');
        });
    });
    
    describe('🆕 Nueva Estructura Modular', () => {
        
        test('Debe crear paciente con nueva estructura', async () => {
            const newPatient = {
                informacion_personal: {
                    primer_nombre: 'Carlos',
                    apellido_paterno: 'Rodríguez',
                    fecha_nacimiento: new Date('1992-08-10'),
                    genero: 'masculino',
                    email: 'carlos@email.com',
                    telefono: '5551112233',
                    documento: {
                        tipo: 'ine',
                        numero: 'RODC920810HDFDRR05'
                    }
                },
                informacion_medica: {
                    medicamentos_actuales: 'Ibuprofeno',
                    alergias: 'Penicilina',
                    habitos: {
                        fuma: false,
                        alcohol: 'nunca'
                    }
                }
            };
            
            const patient = new Patient(newPatient);
            await patient.save();
            
            expect(patient.paciente_id).toBeDefined();
            expect(patient.fullName).toBe('Carlos Rodríguez');
            expect(patient.emailVirtual).toBe('carlos@email.com');
            expect(patient.telefonoVirtual).toBe('5551112233');
        });
        
        test('Virtuales deben funcionar con nueva estructura', async () => {
            const patient = new Patient({
                informacion_personal: {
                    primer_nombre: 'Ana',
                    segundo_nombre: 'Isabel',
                    apellido_paterno: 'Martínez',
                    apellido_materno: 'Sánchez',
                    fecha_nacimiento: new Date('1988-12-05'),
                    email: 'ana.martinez@test.com',
                    telefono: '5554445566'
                }
            });
            
            expect(patient.fullName).toBe('Ana Isabel Martínez Sánchez');
            expect(patient.edadVirtual).toBeGreaterThan(30);
            expect(patient.emailVirtual).toBe('ana.martinez@test.com');
            expect(patient.telefonoVirtual).toBe('5554445566');
        });
    });
    
    describe('🔒 Validaciones de Seguridad', () => {
        
        test('Debe validar formato de email', async () => {
            const patient = new Patient({
                informacion_personal: {
                    primer_nombre: 'Test',
                    apellido_paterno: 'User',
                    email: 'email-invalido'
                }
            });
            
            await expect(patient.save()).rejects.toThrow();
        });
        
        test('Debe validar teléfono mexicano', async () => {
            const patient = new Patient({
                informacion_personal: {
                    primer_nombre: 'Test',
                    apellido_paterno: 'User',
                    telefono: '123' // Muy corto
                }
            });
            
            await expect(patient.save()).rejects.toThrow();
        });
        
        test('Debe validar CURP mexicano', async () => {
            const patient = new Patient({
                informacion_personal: {
                    primer_nombre: 'Test',
                    apellido_paterno: 'User',
                    documento: {
                        tipo: 'curp',
                        numero: 'CURP-INVALIDO'
                    }
                }
            });
            
            await expect(patient.save()).rejects.toThrow();
        });
        
        test('Debe sanitizar texto contra XSS', async () => {
            const patient = new Patient({
                informacion_personal: {
                    primer_nombre: '<script>alert("xss")</script>Juan',
                    apellido_paterno: 'Pérez'
                }
            });
            
            await patient.save();
            expect(patient.informacion_personal.primer_nombre).not.toContain('<script>');
        });
    });
    
    describe('🔍 Métodos de Búsqueda Avanzada', () => {
        
        beforeEach(async () => {
            // Crear pacientes de prueba
            await Patient.create([
                {
                    informacion_personal: {
                        primer_nombre: 'Juan',
                        apellido_paterno: 'Pérez',
                        fecha_nacimiento: new Date('1990-01-01'),
                        genero: 'masculino'
                    }
                },
                {
                    informacion_personal: {
                        primer_nombre: 'María',
                        apellido_paterno: 'García',
                        fecha_nacimiento: new Date('1985-01-01'),
                        genero: 'femenino'
                    }
                },
                {
                    primer_nombre: 'Carlos', // Estructura legacy
                    apellido_paterno: 'López',
                    fecha_nacimiento: new Date('1992-01-01'),
                    sexo: 'masculino'
                }
            ]);
        });
        
        test('findWithFilters debe funcionar con ambas estructuras', async () => {
            const results = await Patient.findWithFilters({
                genero: 'masculino',
                edad_min: 25,
                edad_max: 35
            });
            
            expect(results.length).toBeGreaterThan(0);
        });
        
        test('getStatistics debe retornar datos agregados', async () => {
            const stats = await Patient.getStatistics();
            
            expect(stats.total).toBe(3);
            expect(stats.por_genero).toBeDefined();
            expect(stats.edad_promedio).toBeGreaterThan(0);
        });
    });
    
    describe('🔄 Script de Migración', () => {
        
        test('migratePatient debe convertir estructura legacy', () => {
            const legacyData = {
                primer_nombre: 'Pedro',
                apellido_paterno: 'Ramírez',
                fecha_nacimiento: new Date('1987-06-15'),
                sexo: 'masculino',
                email: 'pedro@test.com',
                telefono: '5557778899',
                encuesta_medica: {
                    medicamentos_actuales: 'Aspirina',
                    alergias: 'Ninguna',
                    fuma: true,
                    alcohol: 'moderado'
                }
            };
            
            const migrated = migratePatient(legacyData);
            
            expect(migrated.informacion_personal).toBeDefined();
            expect(migrated.informacion_medica).toBeDefined();
            expect(migrated.informacion_personal.primer_nombre).toBe('Pedro');
            expect(migrated.informacion_personal.genero).toBe('masculino');
            expect(migrated.informacion_medica.habitos.fuma).toBe(true);
        });
        
        test('migratePatient debe omitir datos ya migrados', () => {
            const alreadyMigrated = {
                informacion_personal: {
                    primer_nombre: 'Ana',
                    apellido_paterno: 'Torres'
                }
            };
            
            const result = migratePatient(alreadyMigrated);
            expect(result).toBeNull();
        });
    });
    
    describe('🏥 Odontogramas', () => {
        
        test('Debe validar números de diente', async () => {
            const patient = new Patient({
                informacion_personal: {
                    primer_nombre: 'Test',
                    apellido_paterno: 'Odonto'
                },
                odontograma_inicial: {
                    snapshots: [{
                        toothNumber: 99, // Número inválido
                        condition: 'sano'
                    }]
                }
            });
            
            await expect(patient.save()).rejects.toThrow();
        });
        
        test('Debe limitar número de snapshots', async () => {
            const snapshots = Array.from({ length: 15 }, (_, i) => ({
                toothNumber: i + 1,
                condition: 'sano'
            }));
            
            const patient = new Patient({
                informacion_personal: {
                    primer_nombre: 'Test',
                    apellido_paterno: 'Snapshots'
                },
                odontograma_inicial: { snapshots }
            });
            
            await expect(patient.save()).rejects.toThrow();
        });
        
        test('Debe prevenir dientes duplicados en daños', async () => {
            const patient = new Patient({
                informacion_personal: {
                    primer_nombre: 'Test',
                    apellido_paterno: 'Duplicado'
                },
                odontograma_clinico: {
                    damages: [
                        { toothNumber: 11, damage: 'caries' },
                        { toothNumber: 11, damage: 'fractura' } // Duplicado
                    ]
                }
            });
            
            await expect(patient.save()).rejects.toThrow();
        });
    });
    
    describe('📊 Rendimiento', () => {
        
        test('Debe generar paciente_id único eficientemente', async () => {
            const startTime = Date.now();
            
            const patients = await Promise.all(
                Array.from({ length: 10 }, () => 
                    Patient.create({
                        informacion_personal: {
                            primer_nombre: 'Test',
                            apellido_paterno: 'Performance'
                        }
                    })
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
    
    describe('🛡️ Middleware de Seguridad', () => {
        
        test('Debe calcular edad automáticamente', async () => {
            const patient = new Patient({
                informacion_personal: {
                    primer_nombre: 'Test',
                    apellido_paterno: 'Edad',
                    fecha_nacimiento: new Date('1990-01-01')
                }
            });
            
            await patient.save();
            expect(patient.edad).toBeGreaterThan(30);
        });
        
        test('Debe actualizar fechas automáticamente', async () => {
            const patient = new Patient({
                informacion_personal: {
                    primer_nombre: 'Test',
                    apellido_paterno: 'Fechas'
                }
            });
            
            await patient.save();
            const createdAt = patient.createdAt;
            
            // Simular actualización
            patient.informacion_personal.primer_nombre = 'Updated';
            await patient.save();
            
            expect(patient.updatedAt).toBeInstanceOf(Date);
            expect(patient.updatedAt.getTime()).toBeGreaterThan(createdAt.getTime());
        });
    });
});

// Pruebas de integración
describe('🔗 Integración Completa', () => {
    
    test('Flujo completo: crear, buscar, actualizar paciente', async () => {
        // Crear paciente
        const patient = await Patient.create({
            informacion_personal: {
                primer_nombre: 'Integración',
                apellido_paterno: 'Test',
                email: 'integracion@test.com',
                telefono: '5551234567'
            },
            informacion_medica: {
                alergias: 'Ninguna'
            }
        });
        
        expect(patient.paciente_id).toBeDefined();
        
        // Buscar paciente
        const found = await Patient.findOne({ paciente_id: patient.paciente_id });
        expect(found).toBeTruthy();
        expect(found.fullName).toBe('Integración Test');
        
        // Actualizar paciente
        found.informacion_personal.segundo_nombre = 'Completa';
        await found.save();
        
        const updated = await Patient.findOne({ paciente_id: patient.paciente_id });
        expect(updated.fullName).toBe('Integración Completa Test');
        
        // Verificar que los virtuales funcionan
        expect(updated.emailVirtual).toBe('integracion@test.com');
        expect(updated.telefonoVirtual).toBe('5551234567');
    });
});

// Configuración de Jest
module.exports = {
    testEnvironment: 'node',
    setupFilesAfterEnv: ['<rootDir>/tests/setup.js'],
    testTimeout: 30000
};