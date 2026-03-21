#!/usr/bin/env node

const net = require('net');
const fs = require('fs');
const path = require('path');
const { spawn, spawnSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const DB_DIR = path.join(ROOT, 'DB');
const LOG_DIR = path.join(DB_DIR, 'logs');
const LOG_FILE = path.join(LOG_DIR, 'mongod.log');

function isPortOpen(host = '127.0.0.1', port = 27017, timeoutMs = 1200) {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    let done = false;

    const finish = (value) => {
      if (!done) {
        done = true;
        socket.destroy();
        resolve(value);
      }
    };

    socket.setTimeout(timeoutMs);
    socket.once('connect', () => finish(true));
    socket.once('timeout', () => finish(false));
    socket.once('error', () => finish(false));
    socket.connect(port, host);
  });
}

async function waitForMongoReady(seconds = 20) {
  const end = Date.now() + seconds * 1000;
  while (Date.now() < end) {
    // eslint-disable-next-line no-await-in-loop
    if (await isPortOpen()) return true;
    // eslint-disable-next-line no-await-in-loop
    await new Promise((r) => setTimeout(r, 1000));
  }
  return false;
}

function run(command, args) {
  return spawnSync(command, args, { stdio: 'pipe', encoding: 'utf8' });
}

function commandExists(command) {
  const checker = process.platform === 'win32' ? 'where' : 'which';
  const res = run(checker, [command]);
  return res.status === 0;
}

function findMongodUnix() {
  const candidates = ['/opt/homebrew/bin/mongod', '/usr/local/bin/mongod'];
  for (const p of candidates) {
    if (fs.existsSync(p)) return p;
  }

  const which = run('which', ['mongod']);
  if (which.status === 0 && which.stdout.trim()) {
    return which.stdout.trim();
  }

  return null;
}

async function startOnUnix() {
  if (await isPortOpen()) {
    console.log('MongoDB ya esta disponible en 127.0.0.1:27017');
    process.exit(0);
  }

  const brewServices = [
    'mongodb-community',
    'mongodb/brew/mongodb-community',
    'mongodb-community@8.0',
    'mongodb-community@7.0',
    'mongodb-community@6.0',
  ];

  for (const svc of brewServices) {
    const res = run('brew', ['services', 'start', svc]);
    if (res.status === 0) {
      console.log(`Intentando iniciar MongoDB con brew services (${svc})...`);
      // eslint-disable-next-line no-await-in-loop
      if (await waitForMongoReady(12)) {
        console.log('MongoDB listo en 127.0.0.1:27017');
        process.exit(0);
      }
    }
  }

  const mongodPath = findMongodUnix();
  if (!mongodPath) {
    console.error('No se encontro mongod en macOS/Linux.');
    console.error('Instala MongoDB Community: brew tap mongodb/brew && brew install mongodb-community');
    process.exit(1);
  }

  fs.mkdirSync(LOG_DIR, { recursive: true });
  fs.mkdirSync(DB_DIR, { recursive: true });

  const child = spawn(
    mongodPath,
    ['--dbpath', DB_DIR, '--logpath', LOG_FILE, '--bind_ip', '127.0.0.1,0.0.0.0'],
    {
      cwd: ROOT,
      detached: true,
      stdio: 'ignore',
    }
  );
  child.unref();

  if (await waitForMongoReady(20)) {
    console.log('MongoDB iniciado correctamente en 127.0.0.1:27017');
    process.exit(0);
  }

  console.error('No se pudo iniciar MongoDB automaticamente. Revisa DB/logs/mongod.log');
  process.exit(1);
}

async function main() {
  if (process.platform === 'win32') {
    const ps1 = path.join(ROOT, 'scripts', 'start-mongo.ps1');

    let shellCmd = null;
    if (commandExists('powershell')) {
      shellCmd = 'powershell';
    } else if (commandExists('pwsh')) {
      shellCmd = 'pwsh';
    }

    if (!shellCmd) {
      console.error('No se encontro PowerShell (powershell ni pwsh) en Windows.');
      process.exit(1);
    }

    const child = spawn(shellCmd, ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', ps1], {
      stdio: 'inherit',
      shell: true,
    });

    child.on('exit', (code) => process.exit(code || 0));
    return;
  }

  await startOnUnix();
}

main().catch((err) => {
  console.error('Error iniciando MongoDB:', err.message);
  process.exit(1);
});
