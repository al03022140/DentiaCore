const path = require('path');
const fsExtra = require('fs-extra');

function getUploadsBase() {
  const envBase = process.env.UPLOADS_DIR && process.env.UPLOADS_DIR.trim();
  if (envBase) {
    return path.resolve(__dirname, '..', envBase);
  }
  return path.resolve(__dirname, '../uploads');
}

function resolveUploadsPath(...segments) {
  return path.join(getUploadsBase(), ...segments);
}

async function ensureUploadsPath(...segments) {
  const target = resolveUploadsPath(...segments);
  await fsExtra.ensureDir(target);
  return target;
}

module.exports = {
  getUploadsBase,
  resolveUploadsPath,
  ensureUploadsPath
};
