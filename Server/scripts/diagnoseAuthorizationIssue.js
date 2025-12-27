/**
 * Script para diagnosticar el problema de autorización en periodontograma
 * 
 * PROBLEMA IDENTIFICADO:
 * - Los logs muestran que se está ejecutando authorize(['read_periodontogram'])
 * - Pero todas las llamadas al middleware authorize están comentadas
 * - Esto sugiere una discrepancia entre el código y la ejecución
 * 
 * OBJETIVO:
 * - Identificar la fuente real de los logs de autorización
 * - Proponer soluciones para eliminar los logs de permisos insuficientes
 */

const fs = require('fs').promises;
const path = require('path');

class AuthorizationDiagnostic {
  constructor() {
    this.routesFile = path.join(__dirname, '../routes/periodontogramRoutes.js');
    this.logFile = path.join(__dirname, '../logs/combined.log');
  }

  /**
   * Analiza el contenido del archivo de rutas
   */
  async analyzeRoutesFile() {
    console.log('🔍 Analizando archivo de rutas...');
    
    try {
      const content = await fs.readFile(this.routesFile, 'utf8');
      
      // Buscar todas las líneas que contienen 'authorize'
      const lines = content.split('\n');
      const authorizeCalls = [];
      
      lines.forEach((line, index) => {
        if (line.includes('authorize(')) {
          authorizeCalls.push({
            lineNumber: index + 1,
            content: line.trim(),
            isCommented: line.trim().startsWith('//')
          });
        }
      });
      
      console.log(`📊 Encontradas ${authorizeCalls.length} referencias a 'authorize':`);
      authorizeCalls.forEach(call => {
        const status = call.isCommented ? '💤 COMENTADA' : '🔴 ACTIVA';
        console.log(`   Línea ${call.lineNumber}: ${status} - ${call.content}`);
      });
      
      // Verificar middleware temporal
      const hasTemporaryUser = content.includes("id: 'user123'");
      console.log(`\n👤 Usuario temporal detectado: ${hasTemporaryUser ? 'SÍ' : 'NO'}`);
      
      if (hasTemporaryUser) {
        // Extraer configuración del usuario temporal
        const userMatch = content.match(/req\.user = \{([^}]+)\}/s);
        if (userMatch) {
          console.log('📋 Configuración del usuario temporal:');
          console.log(userMatch[0]);
        }
      }
      
      return {
        totalAuthorizeCalls: authorizeCalls.length,
        activeCalls: authorizeCalls.filter(call => !call.isCommented).length,
        commentedCalls: authorizeCalls.filter(call => call.isCommented).length,
        hasTemporaryUser,
        authorizeCalls
      };
      
    } catch (error) {
      console.error('❌ Error leyendo archivo de rutas:', error.message);
      throw error;
    }
  }

  /**
   * Analiza los logs para entender el patrón de errores
   */
  async analyzeLogs() {
    console.log('\n📋 Analizando logs...');
    
    try {
      const content = await fs.readFile(this.logFile, 'utf8');
      const lines = content.split('\n').filter(line => line.trim());
      
      // Buscar eventos de insufficient permissions
      const insufficientEvents = [];
      const unauthorizedEvents = [];
      
      lines.forEach((line, index) => {
        try {
          const logEntry = JSON.parse(line);
          
          if (logEntry.event === 'Insufficient permissions') {
            insufficientEvents.push({
              lineNumber: index + 1,
              timestamp: logEntry.timestamp,
              userId: logEntry.details?.userId,
              requiredPermissions: logEntry.details?.requiredPermissions,
              userRole: logEntry.details?.userRole,
              path: logEntry.details?.path
            });
          }
          
          if (logEntry.event === 'Unauthorized access attempt') {
            unauthorizedEvents.push({
              lineNumber: index + 1,
              timestamp: logEntry.timestamp,
              path: logEntry.details?.path,
              ip: logEntry.details?.ip
            });
          }
        } catch (parseError) {
          // Ignorar líneas que no son JSON válido
        }
      });
      
      console.log(`🔍 Eventos encontrados:`);
      console.log(`   - Insufficient permissions: ${insufficientEvents.length}`);
      console.log(`   - Unauthorized access attempt: ${unauthorizedEvents.length}`);
      
      // Mostrar últimos eventos
      if (insufficientEvents.length > 0) {
        console.log('\n🔴 Últimos eventos de "Insufficient permissions":');
        insufficientEvents.slice(-3).forEach(event => {
          console.log(`   ${event.timestamp}: Usuario ${event.userId} (${event.userRole}) - ${event.requiredPermissions?.join(', ')} en ${event.path}`);
        });
      }
      
      if (unauthorizedEvents.length > 0) {
        console.log('\n🚫 Últimos eventos de "Unauthorized access attempt":');
        unauthorizedEvents.slice(-3).forEach(event => {
          console.log(`   ${event.timestamp}: ${event.path} desde ${event.ip}`);
        });
      }
      
      return {
        insufficientEvents,
        unauthorizedEvents
      };
      
    } catch (error) {
      console.log(`⚠️ No se pudo analizar logs: ${error.message}`);
      return { insufficientEvents: [], unauthorizedEvents: [] };
    }
  }

  /**
   * Propone soluciones basadas en el análisis
   */
  proposeSolutions(routesAnalysis, logsAnalysis) {
    console.log('\n💡 DIAGNÓSTICO Y SOLUCIONES:');
    
    // Caso 1: Todas las llamadas están comentadas pero hay logs
    if (routesAnalysis.activeCalls === 0 && logsAnalysis.insufficientEvents.length > 0) {
      console.log('\n🔍 PROBLEMA IDENTIFICADO:');
      console.log('   ❌ Todas las llamadas a authorize() están comentadas');
      console.log('   ❌ Pero se siguen generando logs de "Insufficient permissions"');
      console.log('   ❌ Esto indica que hay código ejecutándose que no coincide con el archivo actual');
      
      console.log('\n🛠️ POSIBLES CAUSAS:');
      console.log('   1. El servidor está ejecutando una versión anterior del código');
      console.log('   2. Hay un proceso zombie o caché de Node.js');
      console.log('   3. Hay un middleware global aplicando autorización');
      console.log('   4. El código se está ejecutando desde otro archivo');
      
      console.log('\n✅ SOLUCIONES RECOMENDADAS:');
      console.log('   1. 🔄 Reiniciar completamente el servidor');
      console.log('   2. 🧹 Limpiar caché de Node.js (eliminar node_modules/.cache si existe)');
      console.log('   3. 👤 Agregar permisos al usuario temporal como solución inmediata');
      console.log('   4. 🔍 Verificar que no hay otros archivos ejecutando middleware de autorización');
    }
    
    // Caso 2: Usuario temporal sin permisos
    if (routesAnalysis.hasTemporaryUser) {
      console.log('\n👤 USUARIO TEMPORAL DETECTADO:');
      console.log('   ⚠️ Se está simulando user123 con rol "dentist"');
      console.log('   ⚠️ Este usuario no tiene permisos específicos asignados');
      console.log('   ✅ Solución: Agregar array de permisos al usuario temporal');
    }
  }

  /**
   * Aplica la solución de agregar permisos al usuario temporal
   */
  async fixTemporaryUserPermissions() {
    console.log('\n🔧 Aplicando solución: Agregar permisos al usuario temporal...');
    
    try {
      const content = await fs.readFile(this.routesFile, 'utf8');
      
      // Buscar y reemplazar la configuración del usuario temporal
      const userPattern = /req\.user = \{\s*id: 'user123',\s*role: 'dentist'\s*\};/;
      
      if (userPattern.test(content)) {
        // Crear backup
        const backupFile = this.routesFile + '.backup.' + Date.now();
        await fs.writeFile(backupFile, content);
        console.log(`📁 Backup creado: ${path.basename(backupFile)}`);
        
        // Aplicar el reemplazo
        const updatedContent = content.replace(
          userPattern,
          `req.user = {
    id: 'user123',
    role: 'dentist',
    permissions: [
      'read_periodontogram',
      'create_periodontogram',
      'update_periodontogram',
      'delete_periodontogram'
    ]
  };`
        );
        
        await fs.writeFile(this.routesFile, updatedContent);
        console.log('✅ Permisos agregados al usuario temporal');
        
        console.log('\n📝 PRÓXIMOS PASOS:');
        console.log('   1. 🔄 Reiniciar el servidor para aplicar los cambios');
        console.log('   2. 🧪 Probar las rutas de periodontograma');
        console.log('   3. 📊 Verificar que no aparezcan más logs de "Insufficient permissions"');
        console.log('   4. ⚠️ IMPORTANTE: Esta es una solución temporal para desarrollo');
        
        return true;
      } else {
        console.log('⚠️ No se encontró el patrón del usuario temporal para modificar');
        console.log('💡 Verifique manualmente la configuración del usuario en el archivo de rutas');
        return false;
      }
      
    } catch (error) {
      console.error('❌ Error aplicando la solución:', error.message);
      throw error;
    }
  }

  /**
   * Ejecuta el diagnóstico completo
   */
  async run() {
    console.log('🚀 DIAGNÓSTICO DE PROBLEMA DE AUTORIZACIÓN EN PERIODONTOGRAMA\n');
    console.log('=' .repeat(70));
    
    try {
      // Analizar archivo de rutas
      const routesAnalysis = await this.analyzeRoutesFile();
      
      // Analizar logs
      const logsAnalysis = await this.analyzeLogs();
      
      // Proponer soluciones
      this.proposeSolutions(routesAnalysis, logsAnalysis);
      
      // Aplicar solución automáticamente si es necesario
      if (routesAnalysis.activeCalls === 0 && 
          logsAnalysis.insufficientEvents.length > 0 && 
          routesAnalysis.hasTemporaryUser) {
        
        console.log('\n❓ Aplicando solución automática...');
        const fixed = await this.fixTemporaryUserPermissions();
        
        if (fixed) {
          console.log('\n🎉 SOLUCIÓN APLICADA EXITOSAMENTE');
        } else {
          console.log('\n⚠️ No se pudo aplicar la solución automáticamente');
        }
      }
      
      console.log('\n' + '=' .repeat(70));
      console.log('✅ Diagnóstico completado');
      
    } catch (error) {
      console.error('💥 Error durante el diagnóstico:', error.message);
      process.exit(1);
    }
  }
}

// Ejecutar si se llama directamente
if (require.main === module) {
  const diagnostic = new AuthorizationDiagnostic();
  diagnostic.run().catch(console.error);
}

module.exports = AuthorizationDiagnostic;