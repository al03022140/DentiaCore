#!/usr/bin/env node
/**
 * Backup de PNGs legacy del odontograma inicial (sin borrar originales).
 *
 * Empaqueta todos los archivos en
 *   Server/uploads/pacientes/<id>/odontograma-inicial/*.png
 * en un único tar.gz dentro de
 *   Server/backups/legacy-odontograma-inicial-YYYY-MM-DD-HHmmss.tar.gz
 *
 * NO modifica nada más:
 *   - Originales se quedan en su lugar
 *   - MongoDB no se toca
 *   - Solo crea el archivo de respaldo
 *
 * Uso:
 *   node scripts/backup-legacy-uploads.js          # backup
 *   node scripts/backup-legacy-uploads.js --dry    # listar sin crear archivo
 *
 * Exit codes:
 *   0 = backup creado (o dry-run completado)
 *   1 = no había archivos legacy para respaldar
 *   2 = error (sin permisos, sin tar, etc.)
 *
 * Requiere `tar` en PATH (preinstalado en macOS/Linux y en Windows 10 build 17063+).
 */

/* eslint-disable no-console */
const path = require('path');
const fs = require('fs');
const fsp = fs.promises;
const { spawnSync, execSync } = require('child_process');

const projectRoot = __dirname.endsWith('scripts') ? path.resolve(__dirname, '..') : __dirname;
const serverDir = path.join(projectRoot, 'Server');
const uploadsBase = path.join(serverDir, 'uploads', 'pacientes');
const backupsDir = path.join(serverDir, 'backups');

const args = process.argv.slice(2);
const dryRun = args.includes('--dry') || args.includes('--dry-run');

function tarAvailable() {
  try {
    const r = spawnSync(process.platform === 'win32' ? 'tar.exe' : 'tar', ['--version'], { stdio: 'pipe' });
    return r.status === 0;
  } catch { return false; }
}

function timestamp() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
}

function humanBytes(n) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / (1024 * 1024)).toFixed(1)} MB`;
  return `${(n / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

async function findLegacyFiles() {
  const results = [];
  try {
    await fsp.access(uploadsBase);
  } catch {
    return results;
  }

  const patients = await fsp.readdir(uploadsBase);
  for (const pid of patients) {
    const dir = path.join(uploadsBase, pid, 'odontograma-inicial');
    let entries;
    try { entries = await fsp.readdir(dir); } catch { continue; }
    for (const f of entries) {
      if (!/\.png$/i.test(f)) continue;
      const abs = path.join(dir, f);
      try {
        const st = await fsp.stat(abs);
        if (st.isFile()) {
          // Path relativo a serverDir para que tar lo guarde con estructura predecible
          results.push({
            absolute: abs,
            relativeToServer: path.relative(serverDir, abs).split(path.sep).join('/'),
            size: st.size,
          });
        }
      } catch { /* skip */ }
    }
  }
  return results;
}

async function main() {
  console.log('🔍 Buscando PNGs legacy del odontograma inicial...');
  console.log(`   Origen: ${uploadsBase}`);

  const files = await findLegacyFiles();
  if (files.length === 0) {
    console.log('✅ No hay archivos legacy. Nada que respaldar.');
    process.exit(1);
  }

  const totalSize = files.reduce((s, f) => s + f.size, 0);
  console.log(`📦 Encontrados ${files.length} archivos (${humanBytes(totalSize)} total)`);

  // Listar los primeros 10 a modo de muestra
  const preview = files.slice(0, 10);
  for (const f of preview) {
    console.log(`   - ${f.relativeToServer} (${humanBytes(f.size)})`);
  }
  if (files.length > preview.length) {
    console.log(`   ... y ${files.length - preview.length} más`);
  }

  if (dryRun) {
    console.log('\n🔬 Modo --dry: no se creó archivo. Quita --dry para ejecutar backup real.');
    process.exit(0);
  }

  if (!tarAvailable()) {
    console.error('❌ No se encontró `tar` en PATH.');
    console.error('   En Windows necesitas Windows 10 build 17063+ (2018) o instalar tar manualmente.');
    process.exit(2);
  }

  await fsp.mkdir(backupsDir, { recursive: true });
  const ts = timestamp();
  const tarName = `legacy-odontograma-inicial-${ts}.tar.gz`;
  const tarPath = path.join(backupsDir, tarName);

  // Crear lista temporal de archivos a empaquetar (paths relativos a serverDir)
  const listFile = path.join(backupsDir, `.tarlist-${ts}.txt`);
  await fsp.writeFile(listFile, files.map(f => f.relativeToServer).join('\n'), 'utf-8');

  console.log(`\n📦 Creando ${tarPath} ...`);
  const tarCmd = process.platform === 'win32' ? 'tar.exe' : 'tar';
  const tarArgs = ['-czf', tarPath, '-C', serverDir, '-T', listFile];

  const r = spawnSync(tarCmd, tarArgs, { stdio: 'inherit' });

  // Limpiar el listfile temporal pase lo que pase
  try { await fsp.unlink(listFile); } catch { /* noop */ }

  if (r.status !== 0) {
    console.error('❌ tar salió con código', r.status);
    process.exit(2);
  }

  let archiveSize = 0;
  try { archiveSize = (await fsp.stat(tarPath)).size; } catch { /* noop */ }

  console.log('');
  console.log('='.repeat(60));
  console.log('✅ BACKUP CREADO');
  console.log('='.repeat(60));
  console.log(`   Archivo:    ${tarPath}`);
  console.log(`   Originales: ${files.length} archivos (${humanBytes(totalSize)}) — NO modificados`);
  console.log(`   Backup:     ${humanBytes(archiveSize)} comprimido`);
  console.log('');
  console.log('Para verificar el contenido del backup:');
  console.log(`   tar -tzf "${tarPath}" | head`);
  console.log('');
  console.log('Para restaurar (si los borraras a futuro):');
  console.log(`   tar -xzf "${tarPath}" -C "${serverDir}"`);
  console.log('');
  process.exit(0);
}

main().catch((err) => {
  console.error('❌ Error inesperado:', err.message);
  if (err.stack) console.error(err.stack);
  process.exit(2);
});
