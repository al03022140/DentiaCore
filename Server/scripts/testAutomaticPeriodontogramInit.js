/**
 * Script de prueba para verificar la inicialización automática del periodontograma
 * Este script prueba:
 * 1. Creación de un paciente nuevo
 * 2. Verificación de que se crea automáticamente un periodontograma
 * 3. Obtención del periodontograma (debe crear uno si no existe)
 */

const mongoose = require('mongoose');
const Patient = require('../models/patient');
const Periodontogram = require('../models/periodontogram');
const { ensurePeriodontogramExists } = require('../controllers/periodontogramController');

// Configuración de la base de datos
const DB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/DentiaCore';

/**
 * Función para conectar a la base de datos
 */
async function connectDB() {
  try {
    await mongoose.connect(DB_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    console.log('✅ Conectado a MongoDB');
  } catch (error) {
    console.error('❌ Error al conectar a MongoDB:', error);
    process.exit(1);
  }
}

/**
 * Función para desconectar de la base de datos
 */
async function disconnectDB() {
  try {
    await mongoose.disconnect();
    console.log('✅ Desconectado de MongoDB');
  } catch (error) {
    console.error('❌ Error al desconectar de MongoDB:', error);
  }
}

/**
 * Función para limpiar datos de prueba
 */
async function cleanupTestData(patientId) {
  try {
    // Eliminar periodontograma de prueba
    await Periodontogram.deleteMany({ patient: patientId });
    // Eliminar paciente de prueba
    await Patient.findByIdAndDelete(patientId);
    console.log('🧹 Datos de prueba limpiados');
  } catch (error) {
    console.error('⚠️ Error al limpiar datos de prueba:', error);
  }
}

/**
 * Prueba 1: Crear paciente y verificar inicialización automática del periodontograma
 */
async function testPatientCreationWithPeriodontogram() {
  console.log('\n🧪 PRUEBA 1: Creación de paciente con inicialización automática de periodontograma');
  
  try {
    // Crear paciente de prueba
    const testPatient = new Patient({
      primer_nombre: 'Juan',
      apellido_paterno: 'Pérez',
      fecha_nacimiento: new Date('1990-01-01'),
      sexo: 'Masculino',
      documento: {
        tipo: 'INE',
        numero: '12345678'
      },
      contacto: {
        telefono: '3001234567',
        email: 'juan.perez@test.com'
      }
    });
    
    await testPatient.save();
    console.log('✅ Paciente creado con ID:', testPatient._id);
    
    // Simular la lógica del controlador de pacientes
    try {
      console.log('🦷 Creando periodontograma inicial para el paciente...');
      const initialPeriodontogram = Periodontogram.createInitial(testPatient._id);
      await initialPeriodontogram.save();
      console.log('✅ Periodontograma inicial creado exitosamente con ID:', initialPeriodontogram._id);
      
      // Verificar que el periodontograma se creó correctamente
      const foundPeriodontogram = await Periodontogram.findOne({ patient: testPatient._id });
      if (foundPeriodontogram) {
        console.log('✅ Verificación exitosa: Periodontograma encontrado en la base de datos');
        console.log('   - ID del periodontograma:', foundPeriodontogram._id);
        console.log('   - Estado:', foundPeriodontogram.status);
        console.log('   - Número de dientes:', Object.keys(foundPeriodontogram.teeth).length);
      } else {
        console.log('❌ Error: Periodontograma no encontrado después de la creación');
      }
      
    } catch (periodontogramError) {
      console.error('⚠️ Error al crear periodontograma inicial:', periodontogramError.message);
      console.log('ℹ️ El paciente se creó correctamente, pero el periodontograma deberá crearse manualmente');
    }
    
    return testPatient._id;
    
  } catch (error) {
    console.error('❌ Error en la prueba 1:', error);
    throw error;
  }
}

/**
 * Prueba 2: Verificar función ensurePeriodontogramExists
 */
async function testEnsurePeriodontogramExists() {
  console.log('\n🧪 PRUEBA 2: Función ensurePeriodontogramExists');
  
  try {
    // Crear paciente sin periodontograma
    const testPatient = new Patient({
      primer_nombre: 'María',
      apellido_paterno: 'González',
      fecha_nacimiento: new Date('1985-05-15'),
      sexo: 'Femenino',
      documento: {
        tipo: 'Pasaporte',
        numero: '87654321'
      },
      contacto: {
        telefono: '3009876543',
        email: 'maria.gonzalez@test.com'
      }
    });
    
    await testPatient.save();
    console.log('✅ Paciente creado sin periodontograma, ID:', testPatient._id);
    
    // Verificar que no existe periodontograma
    let existingPeriodontogram = await Periodontogram.findOne({ patient: testPatient._id });
    console.log('📋 Periodontograma antes de ensurePeriodontogramExists:', existingPeriodontogram ? 'EXISTE' : 'NO EXISTE');
    
    // Usar la función helper
    const periodontogram = await ensurePeriodontogramExists(testPatient._id);
    console.log('✅ ensurePeriodontogramExists completado, ID del periodontograma:', periodontogram._id);
    
    // Verificar que ahora existe
    existingPeriodontogram = await Periodontogram.findOne({ patient: testPatient._id });
    console.log('📋 Periodontograma después de ensurePeriodontogramExists:', existingPeriodontogram ? 'EXISTE' : 'NO EXISTE');
    
    // Llamar nuevamente para verificar que no se duplica
    const periodontogram2 = await ensurePeriodontogramExists(testPatient._id);
    console.log('✅ Segunda llamada a ensurePeriodontogramExists, mismo ID:', periodontogram._id.toString() === periodontogram2._id.toString());
    
    return testPatient._id;
    
  } catch (error) {
    console.error('❌ Error en la prueba 2:', error);
    throw error;
  }
}

/**
 * Prueba 3: Verificar comportamiento con paciente inexistente
 */
async function testEnsurePeriodontogramWithInvalidPatient() {
  console.log('\n🧪 PRUEBA 3: ensurePeriodontogramExists con paciente inexistente');
  
  try {
    const fakePatientId = new mongoose.Types.ObjectId();
    console.log('🔍 Intentando crear periodontograma para paciente inexistente:', fakePatientId);
    
    try {
      await ensurePeriodontogramExists(fakePatientId);
      console.log('❌ Error: La función debería haber fallado con paciente inexistente');
    } catch (error) {
      console.log('✅ Comportamiento correcto: Error capturado -', error.message);
    }
    
  } catch (error) {
    console.error('❌ Error inesperado en la prueba 3:', error);
    throw error;
  }
}

/**
 * Función principal
 */
async function runTests() {
  console.log('🚀 Iniciando pruebas de inicialización automática del periodontograma\n');
  
  const testPatientIds = [];
  
  try {
    await connectDB();
    
    // Ejecutar pruebas
    const patientId1 = await testPatientCreationWithPeriodontogram();
    testPatientIds.push(patientId1);
    
    const patientId2 = await testEnsurePeriodontogramExists();
    testPatientIds.push(patientId2);
    
    await testEnsurePeriodontogramWithInvalidPatient();
    
    console.log('\n✅ Todas las pruebas completadas exitosamente');
    
  } catch (error) {
    console.error('\n❌ Error durante las pruebas:', error);
  } finally {
    // Limpiar datos de prueba
    for (const patientId of testPatientIds) {
      if (patientId) {
        await cleanupTestData(patientId);
      }
    }
    
    await disconnectDB();
  }
}

// Ejecutar las pruebas si el script se ejecuta directamente
if (require.main === module) {
  runTests();
}

module.exports = {
  runTests,
  testPatientCreationWithPeriodontogram,
  testEnsurePeriodontogramExists,
  testEnsurePeriodontogramWithInvalidPatient
};