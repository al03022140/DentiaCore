#!/usr/bin/env node

/**
 * Verifica la cadena de integridad del audit log NOM-024 (AuditLog.verifyChain).
 *
 * Paso de ACEPTACIÓN tras una restauración (O-9): confirma que las entradas del
 * audit log restauradas siguen encadenadas y que su HMAC recomputa con el
 * AUDIT_HMAC_SECRET actual. Un `ok:false` tras restaurar en hardware nuevo casi
 * siempre significa que el AUDIT_HMAC_SECRET del .env NO es el que selló los
 * datos — restaura el secreto original (nunca lo regeneres sobre datos existentes).
 *
 * Uso:
 *   node scripts/verify-audit-chain.js                 # usa MONGODB_URI de Server/.env
 *   node scripts/verify-audit-chain.js --uri="mongodb://127.0.0.1:27017/DentiaCore_restore_test"
 *   node scripts/verify-audit-chain.js --limit=1000    # solo las primeras N (por seq)
 *
 * Exit 0 si la cadena verifica; 1 si hay rupturas o error de conexión.
 */

const path = require('path');
// db.js hace dotenv.config sobre Server/.env → deja AUDIT_HMAC_SECRET y
// MONGODB_URI en process.env, y usa el mongoose de Server/ (no el de la raíz),
// el mismo que registran los modelos — ver la nota en scripts/migrate.js.
const connectDB = require(path.join(__dirname, '..', 'Server', 'config', 'db'));

function parseArgs(argv) {
  const args = { uri: null, limit: 0 };
  for (const a of argv) {
    if (a.startsWith('--uri=')) args.uri = a.slice('--uri='.length);
    else if (a.startsWith('--limit=')) {
      const n = Number(a.slice('--limit='.length));
      if (Number.isFinite(n) && n > 0) args.limit = n;
    } else if (a === '--help' || a === '-h') {
      console.log('Uso: node scripts/verify-audit-chain.js [--uri=<conn>] [--limit=N]');
      console.log('');
      console.log('Verifica la cadena de integridad del audit log NOM-024.');
      console.log('Sin --uri usa MONGODB_URI de Server/.env. Exit 0 = ok, 1 = rupturas.');
      process.exit(0);
    }
  }
  return args;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const uri = args.uri || process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/DentiaCore';

  if ((process.env.AUDIT_HMAC_SECRET || '').trim().length < 32) {
    console.warn('⚠️  AUDIT_HMAC_SECRET ausente o < 32 chars en Server/.env.');
    console.warn('    La verificación no probará nada real: para un restore, restaura');
    console.warn('    primero el .env con el secreto original que selló los datos.');
  }

  let connection;
  try {
    connection = await connectDB({ uri, exitOnFail: false });
  } catch (err) {
    console.error(`❌ No se pudo conectar a Mongo: ${err.message}`);
    process.exit(1);
  }

  const AuditLog = require(path.join(__dirname, '..', 'Server', 'models', 'auditLog'));

  try {
    console.log('⏳ Verificando la cadena del audit log NOM-024…');
    const { ok, checked, breaks } = await AuditLog.verifyChain({ limit: args.limit });

    if (ok) {
      console.log(`✅ Cadena íntegra: ${checked} entradas verificadas, 0 rupturas.`);
    } else {
      console.error(`❌ Cadena ROTA: ${breaks.length} ruptura(s) sobre ${checked} entradas.`);
      const byType = breaks.reduce((acc, b) => { acc[b.type] = (acc[b.type] || 0) + 1; return acc; }, {});
      console.error(`   Por tipo: ${JSON.stringify(byType)}`);
      console.error('   Primeras rupturas:');
      for (const b of breaks.slice(0, 10)) {
        console.error(`     seq=${b.seq} ${b.type}${b.expected != null ? ` (esperado ${b.expected})` : ''}`);
      }
      console.error('');
      console.error('   Si es tras un restore: casi siempre el AUDIT_HMAC_SECRET del .env');
      console.error('   NO es el que selló los datos. Restaura el secreto original.');
    }
    await connection.close();
    process.exit(ok ? 0 : 1);
  } catch (err) {
    console.error(`❌ Error al verificar: ${err.message}`);
    try { await connection.close(); } catch { /* ignore */ }
    process.exit(1);
  }
}

main();
